// Manual use only, when the consolidated Directive 2008/105/EC is re-fetched. Never run by the gate or CI.
//
//   tsx scripts/extract-eu-eqs.ts [path/to/consolidated.xhtml [path/to/eqs.csv]]
//
// With no arguments it reads raw/eu-eqs/consolidated-02008L0105-20130913.xhtml and writes raw/eu-eqs/eqs.csv.
// The 2026 revision has a different annex layout and its own script, extract-eu-eqs-2026.ts.
//
// Reads Annex I Part A (Environmental quality standards) of the consolidated text of Directive
// 2008/105/EC as amended by Directive 2013/39/EU (consolidated version 13.09.2013, fetched from the
// Publications Office), and writes raw/eu-eqs/eqs.csv: one row per printed water value. The biota
// column (mug/kg wet weight) and every cell printed "not applicable", "see footnote" or blank are
// left out; they are counted in the stderr summary. Values are copied from the printed cells, only
// the decimal comma and the printed power of ten are normalised (the printed form is kept in note).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvLine } from '../src/sediment/csv.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(pkg, 'raw/eu-eqs');
const src = process.argv[2] ?? join(dir, 'consolidated-02008L0105-20130913.xhtml');
const dest = process.argv[3] ?? join(dir, 'eqs.csv');

const decode = (s: string): string =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const html = readFileSync(src, 'utf8');
const start = html.indexOf('ANNEX I');
const end = html.indexOf('PART B', start);
if (start < 0 || end < 0) throw new Error('Annex I Part A not found');

const rows = [...html.slice(start, end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
  [...m[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => decode(c[1]!)),
);

const fnRow = rows.find((r) => r.length === 1 && r[0]!.startsWith('( 1 ) CAS'));
if (!fnRow) throw new Error('footnote row not found');
const footnotes = new Map<number, string>();
for (const m of fnRow[0]!.matchAll(/\(\s(\d+)\s\)\s(.*?)(?=\s\(\s\d+\s\)\s|$)/g)) {
  footnotes.set(Number(m[1]), m[2]!.trim());
}
// Footnotes that describe the column headings or are about the biota or indicative parameter only.
const NOT_ROW_NOTES = new Set([1, 2, 3, 4, 8, 10, 12, 14]);

/** `1,7 × 10 –4` to `0.00017`; `0,3` to `0.3`; a leading ≤, Σ = or a footnote reference is dropped. */
const num = (printed: string): string => {
  const p = printed
    .replace(/\s*\(\s*\d+\s*\)\s*$/, '')
    .replace(/^≤\s*/, '')
    .replace(/^Σ\s*=\s*/, '')
    .trim();
  const m = /^(\d+(?:,\d+)?)(?:\s*×\s*10\s*[–-](\d+))?$/.exec(p);
  if (!m) throw new Error(`unparsed value ${printed}`);
  const base = m[1]!.replace(',', '.');
  return m[2] ? String(Number(`${base}e-${m[2]}`)) : base;
};
const fnRefs = (s: string): number[] => [...s.matchAll(/\(\s(\d+)\s\)/g)].map((m) => Number(m[1]));
const stripRefs = (s: string): string =>
  s
    .replace(/\s*\(\s*\d+\s*\)/g, '')
    .replace(/[\s,]+$/, '')
    .trim();
const isNa = (s: string): boolean => /^(not applicable|see footnote)/i.test(s) || s === '';

const CLASS_TEXT = [
  '< 40 mg CaCO3/l',
  '40 to < 50 mg CaCO3/l',
  '50 to < 100 mg CaCO3/l',
  '100 to < 200 mg CaCO3/l',
  '>= 200 mg CaCO3/l',
];
const COLS = [
  { medium: 'freshwater', basis: 'AA-EQS inland' },
  { medium: 'marine', basis: 'AA-EQS other surface waters' },
  { medium: 'freshwater', basis: 'MAC-EQS inland' },
  { medium: 'marine', basis: 'MAC-EQS other surface waters' },
];

interface Out {
  cas: string;
  name: string;
  medium: string;
  basis: string;
  value: string;
  note: string;
}
const out: Out[] = [];
let skipped = 0;

for (const r of rows) {
  let nameCell: string;
  let casCell: string;
  let cells: string[];
  if (r.length === 8 && /^\(\d+[a-z]?\)$/.test(r[0]!) && !/^\(\d+\)$/.test(r[1]!)) {
    nameCell = r[1]!;
    casCell = r[2]!;
    cells = r.slice(3, 7);
  } else if (r.length === 7 && /^\d+-\d\d-\d$/.test(r[1]!)) {
    // PAH and DDT sub-rows carry no item number
    nameCell = r[0]!;
    casCell = r[1]!;
    cells = r.slice(2, 6);
  } else continue;
  const name = stripRefs(nameCell);
  const nameRefs = fnRefs(nameCell);
  const cas = /^\d/.test(casCell) ? casCell.split(/\s+/).join(';') : '';
  const notes = (lead: string[], cellRefs: number[]): string => {
    const parts = [...lead];
    for (const n of [...new Set([...nameRefs, ...cellRefs])]) {
      const t = footnotes.get(n);
      if (t && !NOT_ROW_NOTES.has(n)) parts.push(`footnote ${n}: ${t}`);
    }
    if (cas === '') parts.push(`CAS printed: ${casCell}`);
    return parts.join('; ');
  };
  cells.forEach((cell, i) => {
    const spec = COLS[i]!;
    if (isNa(cell)) {
      skipped++;
      return;
    }
    const classes = [...cell.matchAll(/(≤\s*)?(\d+(?:,\d+)?)\s*\(Class (\d)\)/g)];
    if (classes.length > 0) {
      for (const cm of classes) {
        const cls = Number(cm[3]);
        out.push({
          cas,
          name,
          medium: spec.medium,
          basis: `${spec.basis}, hardness class ${cls}`,
          value: num(cm[2]!),
          note: notes(
            [
              `hardness class ${cls} (${CLASS_TEXT[cls - 1]})`,
              `printed ${cm[0].replace(/\s+/g, ' ')}`,
            ],
            [],
          ),
        });
      }
      return;
    }
    const lead: string[] = [];
    if (/Σ/.test(cell)) lead.push(`printed ${stripRefs(cell)}, a sum over the listed substances`);
    else if (/×/.test(cell)) lead.push(`printed ${stripRefs(cell)}`);
    out.push({
      cas,
      name,
      medium: spec.medium,
      basis: spec.basis,
      value: num(cell),
      note: notes(lead, fnRefs(cell)),
    });
  });
}

const lines = [
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
  ...out.map((o) =>
    csvLine([o.cas, o.name, o.medium, o.basis, o.value, 'μg/l', 'Annex I Part A table', o.note]),
  ),
];
writeFileSync(dest, lines.join('\n') + '\n');
process.stderr.write(`wrote ${out.length} rows; ${skipped} water cells not applicable or blank\n`);
