import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseCsv } from '../sediment/csv.js';
import { DOCUMENTS, GUIDANCE, GUIDANCE_FILE } from './documents.js';
import { MAPPING, UNMAPPED } from './mapping.js';
import { verifyManifest } from './manifest.js';
import type {
  Group,
  SummaryValue,
  UptakeForm,
  ValueStatus,
  WildlifeGroup,
  WildlifeRow,
} from './types.js';

const here = dirname(new URL(import.meta.url).pathname);
const LICENCE =
  'U.S. government work, public domain in the United States; the documents state no restriction.';

export const serialize = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';

const GROUPS: Group[] = ['plants', 'invertebrates', 'avian', 'mammalian'];

const num = (s: string, where: string): number => {
  const n = Number(s);
  if (s.trim() === '' || !Number.isFinite(n)) throw new Error(`${where}: "${s}" is not a number`);
  return n;
};
const optNum = (s: string, where: string): number | null => (s === '' ? null : num(s, where));

export interface EcosslJson {
  edition: string;
  source: {
    reference: string;
    url: string;
    listingPageDate: string;
    retrieved: string;
    licence: string;
    guidance: {
      reference: string;
      file: string;
      url: string;
      directive: string;
      date: string;
      revised: string;
      bytes: number;
      sha256: string;
    };
    documents: {
      key: string;
      file: string;
      url: string;
      directive: string;
      date: string;
      revised: string | null;
      bytes: number;
      sha256: string;
    }[];
  };
  units: { soil: string; trv: string; fir: string };
  substances: {
    substance: string;
    name: string;
    document: string;
    chemicalIds: string[];
    note: string | null;
    values: Record<
      Group,
      { status: ValueStatus; value: number | null; table: string; page: number }
    >;
    wildlife: Omit<WildlifeRow, 'raw' | 'substance' | 'document'>[];
  }[];
  unmapped: { substance: string; name: string; reason: string }[];
}

export interface EcosslBuild {
  values: SummaryValue[];
  wildlife: WildlifeRow[];
  json: EcosslJson;
}

const docOf = (substance: string): string => {
  const d = DOCUMENTS.find((x) => x.substances.includes(substance));
  if (!d) throw new Error(`substance ${substance} belongs to no Eco-SSL document`);
  return d.key;
};

/** Reads the committed CSVs and manifest; verifies the checksums of any fetched PDFs; no network. */
export const buildEcossl = (rawDir: string): EcosslBuild => {
  const { manifest } = verifyManifest(rawDir, { allowMissing: true });
  const srcDir = resolve(here);

  const values: SummaryValue[] = parseCsv(readFileSync(join(srcDir, 'values.csv'), 'utf8')).map(
    (r) => {
      const where = `values.csv ${r['substance']} ${r['group']}`;
      const status = r['status'] as ValueStatus;
      if (!['value', 'NA', 'NC', 'procedure'].includes(status))
        throw new Error(`${where}: bad status`);
      if (!GROUPS.includes(r['group'] as Group)) throw new Error(`${where}: bad group`);
      return {
        substance: r['substance']!,
        document: docOf(r['substance']!),
        group: r['group'] as Group,
        status,
        value: status === 'value' ? num(r['value']!, where) : null,
        table: r['table']!,
        page: num(r['page']!, where),
        evidence: r['evidence']!,
        raw: { value: r['value']! },
      };
    },
  );

  const wildlife: WildlifeRow[] = parseCsv(readFileSync(join(srcDir, 'wildlife.csv'), 'utf8')).map(
    (r) => {
      const where = `wildlife.csv ${r['substance']} ${r['group']} ${r['surrogate']}`;
      const form = r['form'] as UptakeForm;
      if (!['ratio', 'ln', 'affine', 'NA'].includes(form)) throw new Error(`${where}: bad form`);
      const group = r['group'] as WildlifeGroup;
      if (group !== 'avian' && group !== 'mammalian') throw new Error(`${where}: bad group`);
      return {
        substance: r['substance']!,
        document: docOf(r['substance']!),
        group,
        surrogate: r['surrogate']!,
        trv: num(r['trv']!, where),
        fir: num(r['fir']!, where),
        ps: num(r['ps']!, where),
        form,
        a: optNum(r['a']!, where),
        b: optNum(r['b']!, where),
        cdiet: optNum(r['cdiet']!, where),
        ecoSsl: r['ecoSsl'] === 'NA' ? null : num(r['ecoSsl']!, where),
        table: r['table']!,
        page: num(r['page']!, where),
        flag: r['flag'] === '' ? null : r['flag']!,
        raw: {
          trv: r['trv']!,
          fir: r['fir']!,
          ps: r['ps']!,
          a: r['a']!,
          b: r['b']!,
          cdiet: r['cdiet']!,
          ecoSsl: r['ecoSsl']!,
        },
      };
    },
  );

  for (const w of wildlife) {
    const item =
      w.group === 'avian' ? { dove: 1, woodcock: 1, hawk: 1 } : { vole: 1, shrew: 1, weasel: 1 };
    if (!(w.surrogate in item))
      throw new Error(`${w.substance}: ${w.surrogate} is not a ${w.group} surrogate`);
    if (w.form !== 'NA' && w.a === null)
      throw new Error(`${w.substance} ${w.surrogate}: no coefficient`);
    if (w.form === 'ln' && w.b === null)
      throw new Error(`${w.substance} ${w.surrogate}: ln form needs b`);
  }

  // Chemical ids: every mapped id must exist in the RSL chemicals with a matching name.
  const rsl = JSON.parse(
    readFileSync(resolve(rawDir, '../../../generated/rsl-2024-11/chemicals.json'), 'utf8'),
  ) as { chemicals: { id: string; name: string }[] };
  const byId = new Map(rsl.chemicals.map((c) => [c.id, c.name]));

  const substanceIds = [...new Set(values.map((v) => v.substance))];
  const substances: EcosslJson['substances'] = [];
  const unmapped: EcosslJson['unmapped'] = [];
  for (const id of substanceIds) {
    const mapping = MAPPING[id];
    if (!mapping) {
      const u = UNMAPPED[id];
      if (!u) throw new Error(`substance ${id} is neither mapped nor listed as unmapped`);
      unmapped.push({ substance: id, ...u });
      continue;
    }
    for (const cid of mapping.chemicalIds) {
      const name = byId.get(cid);
      if (name === undefined) throw new Error(`${id}: chemical id ${cid} is not in chemicals.json`);
      if (!mapping.nameMatch.test(name)) throw new Error(`${id}: ${cid} is named "${name}"`);
    }
    const mine = values.filter((v) => v.substance === id);
    const vals = Object.fromEntries(
      GROUPS.map((g) => {
        const v = mine.find((x) => x.group === g)!;
        return [g, { status: v.status, value: v.value, table: v.table, page: v.page }];
      }),
    ) as EcosslJson['substances'][number]['values'];
    substances.push({
      substance: id,
      name: mapping.name,
      document: docOf(id),
      chemicalIds: mapping.chemicalIds,
      note: mapping.note ?? null,
      values: vals,
      wildlife: wildlife
        .filter((w) => w.substance === id)
        .map(({ raw: _raw, substance: _s, document: _d, ...rest }) => rest),
    });
  }
  for (const id of Object.keys(UNMAPPED)) {
    if (!substanceIds.includes(id)) throw new Error(`unmapped substance ${id} has no values`);
  }

  const file = (name: string) => {
    const f = manifest.files.find((x) => x.file === name);
    if (!f) throw new Error(`the manifest lists no ${name}`);
    return f;
  };
  const guidance = file(GUIDANCE_FILE);
  const json: EcosslJson = {
    edition: manifest.edition,
    source: {
      reference: 'epaecossl',
      url: 'https://www.epa.gov/chemical-research/interim-ecological-soil-screening-level-documents',
      listingPageDate: manifest.listingPageDate,
      retrieved: manifest.retrieved,
      licence: LICENCE,
      guidance: {
        reference: 'epaecosslguidance',
        file: guidance.file,
        url: guidance.url,
        directive: GUIDANCE.directive,
        date: GUIDANCE.date,
        revised: GUIDANCE.revised,
        bytes: guidance.bytes,
        sha256: guidance.sha256,
      },
      documents: DOCUMENTS.map((d) => {
        const f = file(d.file);
        return {
          key: d.key,
          file: d.file,
          url: f.url,
          directive: d.directive,
          date: d.date,
          revised: d.revised ?? null,
          bytes: f.bytes,
          sha256: f.sha256,
        };
      }),
    },
    units: { soil: 'mg/kg dry weight', trv: 'mg/kg bw/d', fir: 'kg dw/kg bw/d' },
    substances,
    unmapped,
  };
  return { values, wildlife, json };
};
