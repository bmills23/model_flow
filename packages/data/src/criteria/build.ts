import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { casCheckDigitValid } from '../nrwqc/parse.js';
import { parseCsv } from '../sediment/csv.js';
import { verifyCriteriaManifest } from './manifest.js';
import {
  CRITERIA_SET_IDS,
  type CriteriaRow,
  type CriteriaSetFile,
  type CriteriaSetId,
  type CriteriaUnit,
  type IdBy,
} from './types.js';

export interface CriteriaBuild {
  edition: string;
  sets: Record<CriteriaSetId, CriteriaSetFile>;
}

export const serializeSet = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';

/**
 * Sets written as one generated file per water type. The web bundle test allows no chunk over 500 kB, and
 * the ANZG set (841 values with their notes) is about 530 kB as one file. Each part is a complete set file
 * (header, source, its own notes) holding the rows of one water type.
 */
export const SPLIT_SETS: ReadonlySet<CriteriaSetId> = new Set<CriteriaSetId>(['anzg']);

export interface GeneratedPart {
  /** File stem under generated/criteria-<edition>/. */
  name: string;
  file: CriteriaSetFile;
}

/** The generated files of a set: the set itself, or one part per water type for a split set. */
export const generatedParts = (file: CriteriaSetFile): GeneratedPart[] => {
  if (!SPLIT_SETS.has(file.set)) return [{ name: file.set, file }];
  return (['fresh', 'salt'] as const).map((waterType) => {
    const rows = file.rows.filter((r) => r.waterType === waterType);
    const notes: string[] = [];
    const remap = new Map<number, number>();
    const kept = rows.map((r) => {
      if (r.note === undefined) return r;
      let n = remap.get(r.note);
      if (n === undefined) {
        n = notes.length;
        notes.push(file.notes[r.note]!);
        remap.set(r.note, n);
      }
      return { ...r, note: n };
    });
    return { name: `${file.set}-${waterType}`, file: { ...file, notes, rows: kept } };
  });
};

/** The generated US files whose chemical ids the international sets join to (committed, never fetched). */
const NRWQC_DIR = 'nrwqc-2026-10-16';
const SEDIMENT_DIR = 'sediment-2026-10-16';

/** Where the transcribed CSV of each set sits, relative to the raw directory. */
export const SET_CSV: Record<CriteriaSetId, string[]> = {
  ccme: ['ccme/ccme.csv'],
  eu: ['eu-eqs/eqs.csv'],
  eu2026: ['eu-eqs-2026/eqs.csv'],
  uk: ['uk-eqs/eqs.csv'],
  anzg: ['anzg/anzg-2018-dgv.csv'],
  macdonald2000: ['macdonald2000/consensus-tec-pec.csv'],
};

export const SET_LABEL: Record<CriteriaSetId, string> = {
  ccme: 'Canada (CCME)',
  eu: 'European Union (Directive 2008/105/EC)',
  eu2026: 'European Union (Directive 2008/105/EC as amended by Directive (EU) 2026/805)',
  uk: 'United Kingdom (England and Wales)',
  anzg: 'Australia and New Zealand (ANZG 2018)',
  macdonald2000: 'MacDonald et al. 2000 consensus sediment guidelines',
};

/**
 * CAS numbers a source prints that fail the check digit. They are kept as printed and flagged, never
 * corrected from outside knowledge (DECISIONS, wave V slices c-ccme and anzg). Any other failure is an
 * extraction error and stops the build.
 */
const KNOWN_UNVERIFIED = new Set(['13826-41-3', '7440-62-3']);

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normName = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

interface CleanCas {
  cas: string | null;
  casPrinted?: string;
  casUnverified?: true;
}

const cleanCas = (printed: string, where: string): CleanCas => {
  if (printed === '') return { cas: null };
  // A group standard (cyclodiene pesticides, heptachlor with its epoxide) prints several CAS numbers: the row
  // keeps them as printed, has no single CAS number, and takes the slug of its name as its id.
  if (/[;/]/.test(printed)) {
    for (const part of printed.split(/[;/]/)) cleanCas(part, `${where} (group member)`);
    return { cas: null, casPrinted: printed };
  }
  // A spreadsheet stored two ANZG numbers with a leading zero (0120-12-7); the digits are the same CAS number.
  const cas = printed.replace(/^0+(?=\d)/, '');
  if (!/^[1-9]\d{1,6}-\d{2}-\d$/.test(cas)) {
    throw new Error(`${where}: CAS number ${printed} is malformed`);
  }
  const out: CleanCas = { cas };
  if (cas !== printed) out.casPrinted = printed;
  if (!casCheckDigitValid(cas)) {
    if (!KNOWN_UNVERIFIED.has(cas)) {
      throw new Error(`${where}: CAS number ${cas} fails its check digit and is not a known one`);
    }
    out.casUnverified = true;
  }
  return out;
};

interface UnitSpec {
  re: RegExp;
  unit: CriteriaUnit;
  /** Power of ten applied to the printed value. */
  shift: number;
  /** Added to the row's note. */
  note?: string;
}

const UNITS: UnitSpec[] = [
  { re: /^[µμ]g\/l$/i, unit: 'ug/L', shift: 0 },
  { re: /^mg\/l$/i, unit: 'mg/L', shift: 0 },
  { re: /^ng\/l$/i, unit: 'ug/L', shift: -3 },
  { re: /^[µμ]g Sn\/l$/i, unit: 'ug/L', shift: 0, note: 'expressed as tin (printed unit ug Sn/L)' },
  { re: /^[µμ]g\/kg (dry weight|DW)$/i, unit: 'ug/kg', shift: 0 },
  { re: /^mg\/kg (dry weight|DW)$/i, unit: 'mg/kg', shift: 0 },
  {
    re: /^ng TEQ\/kg dry weight$/i,
    unit: 'ug/kg',
    shift: -3,
    note: 'expressed as toxic equivalents (TEQ); the printed unit is ng TEQ/kg dry weight',
  },
];

const convert = (printed: string, spec: UnitSpec): number => {
  const v = Number(printed);
  if (!Number.isFinite(v) || v < 0) throw new Error(`value ${printed} is not a number`);
  if (spec.shift === 0) return v;
  // toPrecision removes the float noise of the power of ten (0.0002 ng/L is 2e-7 ug/L, not 2.0000000000000002e-7).
  return Number((v * 10 ** spec.shift).toPrecision(12));
};

const MEDIA: Record<string, { medium: 'surfaceWater' | 'sediment'; waterType: 'fresh' | 'salt' }> =
  {
    freshwater: { medium: 'surfaceWater', waterType: 'fresh' },
    marine: { medium: 'surfaceWater', waterType: 'salt' },
    'sediment-freshwater': { medium: 'sediment', waterType: 'fresh' },
    'sediment-marine': { medium: 'sediment', waterType: 'salt' },
  };

const basisLabel = (set: CriteriaSetId, basis: string): string => {
  switch (set) {
    case 'ccme':
      if (basis === 'long-term') return 'long-term exposure guideline';
      if (basis === 'short-term') return 'short-term exposure guideline';
      if (basis === 'ISQG') return 'interim sediment quality guideline (ISQG)';
      if (basis === 'PEL') return 'probable effect level (PEL)';
      return basis;
    case 'eu':
    case 'eu2026':
    case 'uk': {
      const aa = /^AA-EQS (.*)$/.exec(basis);
      if (aa) return `annual average (AA-EQS), ${aa[1]}`;
      const mac = /^MAC-EQS (.*)$/.exec(basis);
      if (mac) return `maximum allowable concentration (MAC-EQS), ${mac[1]}`;
      return `${basis} standard`;
    }
    case 'anzg':
      return `${basis} (default guideline value)`;
    case 'macdonald2000':
      if (basis === 'TEC') return 'consensus threshold effect concentration (TEC)';
      if (basis === 'PEC') return 'consensus probable effect concentration (PEC)';
      return basis;
  }
};

/**
 * MacDonald et al. 2000 prints no CAS numbers. Most of its chemicals join to the Region 4 file by name; these
 * few print a different name or a sum, and each is tied to a Region 4 row by the id AND the name the Region 4
 * file itself prints, checked at build time. Nothing here is a number from memory: the target must exist.
 */
const MACDONALD_ALIASES: Record<string, { id: string; r4Name: string }> = {
  Chromium: { id: '7440-47-3', r4Name: 'Chromium (Total)' },
  'Lindane (gamma-BHC)': { id: '58-89-9', r4Name: 'BHC-gamma (Lindane) (aquatic life)' },
  'Sum DDD': { id: 'code-ddd', r4Name: 'Total DDD' },
  'Sum DDE': { id: 'code-dde', r4Name: 'Total DDE' },
  'Sum DDT': { id: 'code-ddt', r4Name: 'Total DDT' },
  'Total DDTs': { id: 'code-ddtr', r4Name: 'DDT/DDE/DDD (total)' },
};

interface NameIndex {
  us: Map<string, Set<string>>;
  all: Map<string, Set<string>>;
  r4Names: Map<string, Set<string>>;
}

const addTo = (m: Map<string, Set<string>>, k: string, v: string): void => {
  const s = m.get(k);
  if (s) s.add(v);
  else m.set(k, new Set([v]));
};

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const csvRows = (rawDir: string, file: string): Record<string, string>[] =>
  parseCsv(readFileSync(join(rawDir, file), 'utf8'));

const buildNameIndex = (rawDir: string, generatedDir: string): NameIndex => {
  const idx: NameIndex = { us: new Map(), all: new Map(), r4Names: new Map() };
  const sediment = readJson<{ rows: { chemicalId: string; name: string }[] }>(
    join(generatedDir, SEDIMENT_DIR, 'benchmarks.json'),
  );
  for (const r of sediment.rows) {
    addTo(idx.us, normName(r.name), r.chemicalId);
    addTo(idx.r4Names, r.chemicalId, r.name);
  }
  for (const f of ['aquatic.json', 'human-health.json']) {
    const file = readJson<{ rows: { id: string; name: string }[] }>(
      join(generatedDir, NRWQC_DIR, f),
    );
    for (const r of file.rows) addTo(idx.us, normName(r.name), r.id);
  }
  for (const id of CRITERIA_SET_IDS) {
    for (const file of SET_CSV[id]) {
      for (const r of csvRows(rawDir, file)) {
        if ((r.cas ?? '') === '') continue;
        const { cas } = cleanCas(r.cas ?? '', `${file} ${r.name_printed ?? ''}`);
        if (cas !== null) addTo(idx.all, normName(r.name_printed ?? ''), cas);
      }
    }
  }
  return idx;
};

interface Resolved {
  chemicalId: string;
  idBy: IdBy;
}

const resolveId = (
  set: CriteriaSetId,
  name: string,
  cas: string | null,
  idx: NameIndex,
): Resolved => {
  if (cas !== null) return { chemicalId: cas, idBy: 'cas' };
  if (set === 'macdonald2000') {
    const alias = MACDONALD_ALIASES[name];
    if (alias !== undefined) {
      if (!idx.r4Names.get(alias.id)?.has(alias.r4Name)) {
        throw new Error(`${name}: the Region 4 file has no ${alias.id} named "${alias.r4Name}"`);
      }
      return { chemicalId: alias.id, idBy: 'name-join' };
    }
  }
  const n = normName(name);
  const us = idx.us.get(n);
  if (us?.size === 1) return { chemicalId: [...us][0]!, idBy: 'name-join' };
  const all = idx.all.get(n);
  if (all?.size === 1 && !(us && us.size > 1))
    return { chemicalId: [...all][0]!, idBy: 'name-join' };
  return { chemicalId: slug(name), idBy: 'name' };
};

/** CCME prints a word where there is no single number; these three mean "depends on site chemistry". */
const SITE_WORD = /printed as: (Equation|Variable|Table)$/;

const buildSet = (
  set: CriteriaSetId,
  rawDir: string,
  idx: NameIndex,
  manifest: ReturnType<typeof verifyCriteriaManifest>,
): CriteriaSetFile => {
  const entry = manifest.sets[set];
  const rows: CriteriaRow[] = [];
  const notes: string[] = [];
  const noteIx = new Map<string, number>();
  const omitted: Record<string, number> = {};
  const used = new Set<string>();
  const omit = (why: string): void => {
    omitted[why] = (omitted[why] ?? 0) + 1;
  };

  for (const file of SET_CSV[set]) {
    for (const r of csvRows(rawDir, file)) {
      const where = `${file} ${r.name_printed ?? ''} ${r.medium ?? ''} ${r.basis ?? ''}`;
      const m = MEDIA[r.medium ?? ''];
      if (m === undefined) throw new Error(`${where}: unknown medium ${r.medium ?? ''}`);
      const name = r.name_printed ?? '';
      const basis = r.basis ?? '';
      const rawNote = r.note ?? '';
      const casInfo = cleanCas(r.cas ?? '', where);
      const printedValue = r.value ?? '';
      const extra: string[] = [];
      let value: number | undefined;
      let unit: CriteriaUnit = m.medium === 'surfaceWater' ? 'ug/L' : 'ug/kg';
      let siteSpecific = false;
      const printedUnit = r.unit_printed ?? '';
      if (printedValue === '') {
        if (set === 'ccme' && SITE_WORD.test(rawNote)) siteSpecific = true;
        else {
          omit('no number printed (narrative, framework, range or unreadable cell)');
          continue;
        }
      } else {
        const spec = UNITS.find((u) => u.re.test(printedUnit));
        if (spec === undefined) throw new Error(`${where}: unknown unit "${printedUnit}"`);
        if ((m.medium === 'surfaceWater') !== /L$/i.test(spec.unit)) {
          throw new Error(`${where}: unit ${printedUnit} does not match the medium`);
        }
        unit = spec.unit;
        value = convert(printedValue, spec);
        if (spec.note !== undefined) extra.push(spec.note);
      }
      const noteText = [...extra, rawNote].filter((s) => s !== '').join('; ');
      let note: number | undefined;
      if (noteText !== '') {
        note = noteIx.get(noteText);
        if (note === undefined) {
          note = notes.length;
          notes.push(noteText);
          noteIx.set(noteText, note);
        }
      }
      const { chemicalId, idBy } = resolveId(set, name, casInfo.cas, idx);
      const base = `${set}:${chemicalId}:${m.medium}:${m.waterType}:${slug(basis)}`;
      let id = base;
      for (let k = 2; used.has(id); k++) id = `${base}#${k}`;
      used.add(id);
      const row: CriteriaRow = {
        id,
        set,
        chemicalId,
        idBy,
        name,
        cas: casInfo.cas,
        ...(casInfo.casPrinted !== undefined ? { casPrinted: casInfo.casPrinted } : {}),
        ...(casInfo.casUnverified ? { casUnverified: true as const } : {}),
        medium: m.medium,
        waterType: m.waterType,
        basis,
        basisLabel: basisLabel(set, basis),
        endpoint: `${set}-${m.medium === 'sediment' ? 'sediment-' : ''}${m.waterType}-${slug(basis)}`,
        ...(value !== undefined ? { value } : {}),
        unit,
        ...(printedValue !== '' ? { printedValue } : {}),
        printedUnit,
        ...(siteSpecific ? { siteSpecific: true as const } : {}),
        table: r.table_or_page ?? '',
        ...(note !== undefined ? { note } : {}),
        ...(r.reliability ? { reliability: r.reliability } : {}),
        ...(yearOf(set, r, rawNote) !== undefined ? { year: yearOf(set, r, rawNote)! } : {}),
      };
      rows.push(row);
    }
  }
  const media = (['surfaceWater', 'sediment'] as const).filter((md) =>
    rows.some((r) => r.medium === md),
  );
  return {
    set,
    edition: manifest.edition,
    label: SET_LABEL[set],
    media,
    source: entry.source,
    notes,
    omitted,
    rows,
  };
};

const yearOf = (
  set: CriteriaSetId,
  r: Record<string, string>,
  note: string,
): number | undefined => {
  if (set === 'anzg' && /^\d{4}$/.test(r.publish_year ?? '')) return Number(r.publish_year);
  if (set === 'ccme') {
    const m = /guideline year (\d{4})/.exec(note);
    if (m) return Number(m[1]);
  }
  return undefined;
};

/**
 * Builds the five international sets from the committed CSVs. Verifies every committed file against the
 * manifest first and never touches the network. `generatedDir` is read for the Region 4 and NRWQC chemical ids
 * the sets join to.
 */
export const buildCriteria = (rawDir: string, generatedDir: string): CriteriaBuild => {
  const manifest = verifyCriteriaManifest(rawDir);
  const idx = buildNameIndex(rawDir, generatedDir);
  const sets = Object.fromEntries(
    CRITERIA_SET_IDS.map((id) => [id, buildSet(id, rawDir, idx, manifest)]),
  ) as Record<CriteriaSetId, CriteriaSetFile>;
  return { edition: manifest.edition, sets };
};
