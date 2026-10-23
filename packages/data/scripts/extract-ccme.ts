// Manual use only, never run by the gate or CI.
//
//   tsx scripts/extract-ccme.ts path/to/summary-table.csv
//
// Reads the CSV that the CCME summary table page (https://ccme.ca/en/summary-table) exports for
// every chemical and writes raw/ccme/ccme.csv: the aquatic life water guidelines (freshwater and
// marine, long-term and short-term) and the aquatic life sediment guidelines (freshwater and
// marine, ISQG and PEL). Values are kept as printed apart from thousands separators and trailing
// unit text; cells that hold a word (Equation, Variable, Table, Narrative) become rows with an empty
// value and the printed word in the note; "No data", "Insufficient data", "NRG" and "Not assessed"
// produce no row. The fetched file itself is not committed (CCME states no reuse licence).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvLine, parseCsvLine } from '../src/sediment/csv.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) throw new Error('usage: extract-ccme.ts <summary-table.csv>');

const text = readFileSync(input, 'utf8').replace(new RegExp('^' + String.fromCharCode(0xfeff)), '');
// Split records on newlines outside quotes.
const records: string[] = [];
{
  let cur = '';
  let q = false;
  for (const ch of text) {
    if (ch === '"') q = !q;
    if (ch === '\n' && !q) {
      records.push(cur.replace(/\r$/, ''));
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) records.push(cur);
}
const rows = records.map(parseCsvLine);
const header = rows[1]!;
const body = rows.slice(2);

const find = (needle: string): number => {
  const i = header.indexOf(needle);
  if (i < 0) throw new Error(`column not found: ${needle}`);
  return i;
};
const allIdx = (h: string): number[] =>
  header.map((x, i) => (x === h ? i : -1)).filter((i) => i >= 0);
const fwDates = allIdx('(Freshwater) Date');
const mDates = allIdx('(Marine) Date');
if (fwDates.length !== 2 || mDates.length !== 2) throw new Error('unexpected date columns');

const W = '(Freshwater) Concentration (µg/L)';
const WM = '(Marine) Concentration (µg/L)';
const S = '(Freshwater) Concentration (µg/kg dry weight)';
const SM = '(Marine) Concentration (µg/kg dry weight)';
interface Col {
  idx: number;
  medium: string;
  basis: string;
  unit: string;
  dateIdx: number;
}
const cols: Col[] = [
  {
    idx: find(`${W} Long Term`),
    medium: 'freshwater',
    basis: 'long-term',
    unit: 'µg/L',
    dateIdx: fwDates[0]!,
  },
  {
    idx: find(`${W} Short Term`),
    medium: 'freshwater',
    basis: 'short-term',
    unit: 'µg/L',
    dateIdx: fwDates[0]!,
  },
  {
    idx: find(`${WM} Long Term`),
    medium: 'marine',
    basis: 'long-term',
    unit: 'µg/L',
    dateIdx: mDates[0]!,
  },
  {
    idx: find(`${WM} Short Term`),
    medium: 'marine',
    basis: 'short-term',
    unit: 'µg/L',
    dateIdx: mDates[0]!,
  },
  {
    idx: find(`${S} ISQG`),
    medium: 'sediment-freshwater',
    basis: 'ISQG',
    unit: 'µg/kg dry weight',
    dateIdx: fwDates[1]!,
  },
  {
    idx: find(`${S} PEL`),
    medium: 'sediment-freshwater',
    basis: 'PEL',
    unit: 'µg/kg dry weight',
    dateIdx: fwDates[1]!,
  },
  {
    idx: find(`${SM} ISQG`),
    medium: 'sediment-marine',
    basis: 'ISQG',
    unit: 'µg/kg dry weight',
    dateIdx: mDates[1]!,
  },
  {
    idx: find(`${SM} PEL`),
    medium: 'sediment-marine',
    basis: 'PEL',
    unit: 'µg/kg dry weight',
    dateIdx: mDates[1]!,
  },
];

const SKIP = new Set(['No data', 'Insufficient data', 'NRG', 'Not assessed', '']);
const NUM = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$|^\d+(?:\.\d+)?$/;

interface Parsed {
  value: string;
  unit: string | null;
  note: string;
}
const parseValue = (raw: string): Parsed => {
  const s = raw.replaceAll(String.fromCharCode(160), ' ').trim();
  // thousands groups printed with a space, as "17 000"
  const spaced = s.replace(/^\d{1,3}(?: \d{3})+(?=$|[^\d])/, (m) => m.replace(/ /g, ''));
  let m = /^([\d,]+(?:\.\d+)?)\s*([µμ]g\/L)(?:\s+or\s+(.*))?$/.exec(spaced);
  if (m && NUM.test(m[1]!)) {
    const extra = m[3] ? `also printed as: ${m[3].replace(/\s+/g, ' ')}` : '';
    return { value: m[1]!.replace(/,/g, ''), unit: m[2]!, note: extra };
  }
  if (NUM.test(spaced)) return { value: spaced.replace(/,/g, ''), unit: null, note: '' };
  m = /^(\d+(?:\.\d+)?)\s+(ng TEQ\/kg dry weight)$/.exec(spaced);
  if (m) return { value: m[1]!, unit: m[2]!, note: '' };
  m = /^(\d+(?:\.\d+)?)\s*\((.+)\)$/.exec(spaced);
  if (m) return { value: m[1]!, unit: null, note: m[2]! };
  return { value: '', unit: null, note: `no single number, printed as: ${spaced}` };
};

// Two CAS numbers are printed as spreadsheet dates (yyyy-mm-dd for "yy-mm-d"); decoded only when
// the CAS check digit holds.
const casOk = (cas: string): boolean => {
  const d = cas.replace(/-/g, '');
  const digits = d.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[digits.length - 1 - i]) * (i + 1);
  return sum % 10 === Number(d.slice(-1));
};
const fixCas = (raw: string): { cas: string; note: string } => {
  const m = /^(19\d\d|20\d\d)-(\d\d)-(\d\d)$/.exec(raw);
  if (!m) {
    const bad = /^\d+-\d\d-\d$/.test(raw) && !casOk(raw);
    return {
      cas: raw,
      note: bad ? 'CAS as printed in the source fails its check digit; not corrected' : '',
    };
  }
  const cas = `${m[1]!.slice(2)}-${m[2]}-${Number(m[3])}`;
  if (!casOk(cas)) throw new Error(`cannot decode CAS ${raw}`);
  return { cas, note: `CAS printed as the date ${raw}, read as ${cas} (check digit valid)` };
};

const out: string[] = [
  csvLine([
    'cas',
    'name_printed',
    'medium',
    'basis',
    'value',
    'unit_printed',
    'table_or_page',
    'note',
  ]),
];
let skipped = 0;
let n = 0;
const nameIdx = find('Chemical Name');
const casIdx = find('CASRN');
for (const r of body) {
  if (r.length !== header.length) throw new Error(`row width ${r.length}: ${r[0]}`);
  const { cas, note: casNote } = fixCas(r[casIdx]!.trim());
  for (const c of cols) {
    const raw = r[c.idx]!.trim();
    if (SKIP.has(raw)) {
      if (raw !== '') skipped++;
      continue;
    }
    const p = parseValue(raw);
    const date = r[c.dateIdx]!.trim();
    const notes = [date && !SKIP.has(date) ? `guideline year ${date}` : '', p.note, casNote].filter(
      Boolean,
    );
    out.push(
      csvLine([
        cas,
        r[nameIdx]!.trim(),
        c.medium,
        c.basis,
        p.value,
        p.value === '' ? '' : (p.unit ?? c.unit),
        'CCME summary table, aquatic life columns',
        notes.join('; '),
      ]),
    );
    n++;
  }
}
writeFileSync(join(pkg, 'raw/ccme/ccme.csv'), out.join('\n') + '\n');
console.log(`rows written ${n}, cells without a guideline ${skipped}, chemicals ${body.length}`);
