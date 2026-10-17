import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { casCheckDigitValid } from '../nrwqc/parse.js';
import { parseCsv } from './csv.js';
import { verifySedimentManifest } from './manifest.js';
import { LETTERS_2A, LETTERS_2B, LETTERS_2C, type LetterInfo } from './sources.js';
import type {
  BenchmarkFile,
  BenchmarkRow,
  SedimentBasis,
  SedimentEndpoint,
  SedimentUnit,
} from './types.js';

export type SedimentBuild = BenchmarkFile;

export const serialize = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';

const EDITION = '2026-10-16';
const R4_LICENCE = 'U.S. government work, public domain in the United States.';

const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * A CAS number the report prints with its digits transposed. The corrected number is the registry
 * number of the chemical named in the row (sulfide) and passes the check digit; the printed form is
 * kept in the row (`casPrinted`) and the correction is recorded in DECISIONS.md.
 */
const CAS_CORRECTIONS: Record<string, string> = { '18946-25-8': '18496-25-8' };

const checkedCas = (printed: string, where: string): string => {
  const cas = CAS_CORRECTIONS[printed] ?? printed;
  if (!/^\d{2,7}-\d{2}-\d$/.test(cas) || !casCheckDigitValid(cas)) {
    throw new Error(`${where}: CAS number ${cas} is malformed or fails its check digit`);
  }
  return cas;
};

const chemicalId = (cas: string, code: string, name: string): string =>
  cas !== '' ? cas : code !== '' ? `code-${code.toLowerCase()}` : slug(name);

const variantOf = (name: string): string | null => {
  const m = /\(([^()]*)\)\s*$/.exec(name);
  return m && /aquatic life|wildlife/i.test(m[1]!) ? m[1]!.trim().toLowerCase() : null;
};

interface Basis {
  basis: SedimentBasis;
  inferred: boolean;
}

/**
 * The basis of one Region 4 value, from the fill of its cell (DECISIONS.md, M8 slice D2). The notes
 * under Tables 2a and 2b say a gray cell is ug/kg dry weight, and the organic section headings read
 * "ug/kg @ 1% OC unless denoted by shading", so a gray cell is dry weight and an unshaded cell under
 * such a heading is at 1 percent organic carbon. A tan cell (some PAH totals) is shaded but not in the
 * legend's gray: dry weight, flagged. A value is also flagged when the note of its own source letter
 * states the other unit, since the report then contradicts itself. Under a heading that states no
 * basis ("Other SVOCs - ug/kg") an unshaded value takes the unit its letter's note states.
 */
const basisOf = (
  table: '2a' | '2b',
  letter: string,
  fallbackLetter: string,
  name: string,
  unit: SedimentUnit,
  sectionBasis: string,
  /** The fill of the value cell read by scripts/read-r4-shading.ts: none, gray or tan. */
  shade: string,
  where: string,
): Basis => {
  // Inorganic sections (mg/kg dry weight) are never organic carbon normalized, whatever the letter.
  if (unit === 'mg/kg') return { basis: 'dw', inferred: false };
  if (shade !== 'none' && shade !== 'gray' && shade !== 'tan') {
    throw new Error(`${where}: no cell shade recorded (run scripts/read-r4-shading.ts)`);
  }
  const letters: Record<string, LetterInfo> = table === '2a' ? LETTERS_2A : LETTERS_2B;
  /** The unit the note of a letter states, or null when the note states none. */
  const noted = (l: string): SedimentBasis | null => {
    const info = letters[l];
    if (info === undefined || info.inferred) return null;
    // Table 2a note l: a NYDEC wildlife number is ug/kg at 1% OC, the rest are dry weight.
    if (table === '2a' && l === 'l' && /wildlife/i.test(name)) return 'oc1pct';
    return info.basis;
  };
  const own = letter !== '' ? noted(letter) : null;
  if (shade === 'gray') return { basis: 'dw', inferred: own === 'oc1pct' };
  if (shade === 'tan') return { basis: 'dw', inferred: true };
  if (sectionBasis === 'oc1pct') return { basis: 'oc1pct', inferred: own === 'dw' };
  if (own !== null) return { basis: own, inferred: false };
  const fallback = noted(fallbackLetter);
  return { basis: fallback ?? 'dw', inferred: true };
};

const num = (s: string): number | null => {
  if (s === '' || s === '*') return null;
  const v = Number(s);
  if (!Number.isFinite(v)) throw new Error(`value ${s} is not a number`);
  return v;
};

const COLUMNS: {
  endpoint: SedimentEndpoint;
  value: string;
  src: string;
  water: 'fresh' | 'salt';
}[] = [
  { endpoint: 'region4-freshwater-screening', value: 'fwEsv', src: 'fwEsvSrc', water: 'fresh' },
  { endpoint: 'region4-freshwater-refinement', value: 'fwRsv', src: 'fwRsvSrc', water: 'fresh' },
  { endpoint: 'region4-marine-screening', value: 'mEsv', src: 'mEsvSrc', water: 'salt' },
  { endpoint: 'region4-marine-refinement', value: 'mRsv', src: 'mRsvSrc', water: 'salt' },
];

const readCsv = (dir: string, file: string): Record<string, string>[] =>
  parseCsv(readFileSync(join(dir, file), 'utf8'));

function region4Rows(dir: string): BenchmarkRow[] {
  const rows: BenchmarkRow[] = [];
  for (const table of ['2a', '2b'] as const) {
    for (const r of readCsv(dir, `table-${table}.csv`)) {
      const name = r['chemical']!;
      const cas = r['cas']! === '' ? '' : checkedCas(r['cas']!, `Table ${table} ${name}`);
      const unit = r['unit'] as SedimentUnit;
      const rowLetter = COLUMNS.map((c) => r[c.src]!).find((l) => l !== '') ?? '';
      for (const c of COLUMNS) {
        const value = num(r[c.value]!);
        if (value === null) continue;
        const letter = r[c.src]!;
        const b = basisOf(
          table,
          letter,
          rowLetter,
          name,
          unit,
          r['sectionBasis']!,
          r[`${c.value}Shade`]!,
          `Table ${table} ${name} ${c.value}`,
        );
        rows.push({
          id: '',
          chemicalId: chemicalId(cas, r['code']!, name),
          name,
          cas: cas === '' ? null : cas,
          ...(r['cas']! !== '' && cas !== r['cas']! ? { casPrinted: r['cas']! } : {}),
          code: r['code']! === '' ? null : r['code']!,
          variant: variantOf(name),
          medium: 'sediment',
          source: 'epa2018r4era',
          table,
          page: Number(r['page']),
          section: r['section']!,
          endpoint: c.endpoint,
          value,
          unit,
          basis: b.basis,
          ...(b.basis === 'oc1pct' ? { ocBasis: 0.01 } : {}),
          ...(b.inferred ? { basisInferred: true as const } : {}),
          ...(letter !== '' ? { sourceLetter: letter } : {}),
          waterType: c.water,
          ...(r['mode']! !== '' ? { modeOfAction: r['mode']! } : {}),
          ...(r['bothReceptors']! === 'yes' ? { bothReceptors: true as const } : {}),
          recordSource: 'database',
        });
      }
    }
  }
  for (const r of readCsv(dir, 'table-2c.csv')) {
    const name = r['chemical']!;
    const cas = r['cas']! === '' ? '' : checkedCas(r['cas']!, `Table 2c ${name}`);
    const value = num(r['rsv']!);
    if (value === null) continue;
    // Table 2c prints every value unshaded under its "ug/kg @ 1% OC" heading (PDF pages 88 and 89).
    if (r['rsvShade'] !== 'none') {
      throw new Error(`Table 2c ${name}: cell shade ${r['rsvShade']}, expected none`);
    }
    rows.push({
      id: '',
      chemicalId: chemicalId(cas, '', name),
      name,
      cas: cas === '' ? null : cas,
      code: null,
      variant: null,
      medium: 'sediment',
      source: 'epa2018r4era',
      table: '2c',
      page: Number(r['page']),
      section: r['section']!,
      endpoint: 'region4-pah-toxic-unit-refinement',
      value,
      unit: 'ug/kg',
      basis: 'oc1pct',
      ocBasis: 0.01,
      sourceLetter: r['rsvSrc']!,
      recordSource: 'database',
    });
  }
  return rows;
}

const assignIds = (rows: BenchmarkRow[]): void => {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const base = `${r.table}:${r.chemicalId}:${r.variant === null ? '' : slug(r.variant)}:${r.endpoint}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    r.id = n === 1 ? base : `${base}#${n}`;
  }
};

/** Verifies both manifests, then builds the benchmark file from the committed CSVs. */
export function buildSediment(rawDir: string): SedimentBuild {
  const r4Dir = join(rawDir, 'epa-r4-2018');
  const r4 = verifySedimentManifest(r4Dir);
  const report = r4.files.find((f) => f.role === 'report');
  if (report === undefined) throw new Error('the Region 4 manifest lists no report');
  const rows = [...region4Rows(r4Dir)];
  assignIds(rows);
  return {
    edition: EDITION,
    sources: {
      epa2018r4era: {
        reference: 'epa2018r4era',
        ...(report.url !== undefined ? { url: report.url } : {}),
        pageDate: report.pageDate ?? '',
        retrieved: r4.retrieved,
        licence: R4_LICENCE,
      },
    },
    units: {
      concentration:
        'mg/kg for metals and other inorganics, ug/kg for organics, as each row states',
      ocBasis:
        'basis oc1pct means the value is published at 1 percent organic carbon (ocBasis 0.01); dw is dry weight',
    },
    sourceLetters: { '2a': LETTERS_2A, '2b': LETTERS_2B, '2c': LETTERS_2C },
    rows,
  };
}
