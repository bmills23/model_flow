// Manual use only (needs pdftotext from poppler); never run by the gate or CI.
//
//   tsx scripts/extract-macdonald2000.ts <path/to/article-copy.pdf>
//
// Reads Tables 2 (TEC) and 3 (PEC) of MacDonald, Ingersoll and Berger 2000 from a text-layer copy of the
// article with `pdftotext -layout` and writes raw/macdonald2000/consensus-tec-pec.csv. Only the
// "Consensus-Based" column (the last number on each row) is taken; the individual source guidelines
// printed beside it are not transcribed. Values are kept as printed, thousands separators removed.
// The article prints no CAS numbers, so the cas column stays empty. Table 2 prints 29 TEC rows and
// Table 3 prints 28 PEC rows (Dibenz[a,h]anthracene has a TEC only); the script reports both counts.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvLine } from '../src/sediment/csv.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(pkg, 'raw/macdonald2000/consensus-tec-pec.csv');
const pdf = process.argv[2];
if (!pdf) throw new Error('usage: extract-macdonald2000.ts <article.pdf>');

const text = execFileSync('pdftotext', ['-layout', pdf, '-'], {
  encoding: 'utf8',
  maxBuffer: 1 << 28,
});
const lines = text.split(/\r?\n/);

const METALS = new Set([
  'Arsenic',
  'Cadmium',
  'Chromium',
  'Copper',
  'Lead',
  'Mercury',
  'Nickel',
  'Zinc',
]);
const NUM = /^\d[\d,]*(\.\d+)?$/;

interface Row {
  name: string;
  value: string;
}

const readTable = (startRe: RegExp, endRe: RegExp): Row[] => {
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) throw new Error(`table start not found: ${startRe}`);
  const rows: Row[] = [];
  for (let i = start + 1; i < lines.length && !endRe.test(lines[i]!); i++) {
    const l = lines[i]!;
    if (!/^\s{2}\S/.test(l)) continue; // data rows are indented two spaces; headings are flush left
    const m = /^\s+(.+?)\s{2,}(.+)$/.exec(l);
    if (!m) continue;
    const toks = m[2]!.trim().split(/\s+/);
    const last = toks[toks.length - 1]!;
    if (!NUM.test(last)) throw new Error(`no consensus number on row: ${l}`);
    rows.push({ name: m[1]!.trim(), value: last.replace(/,/g, '') });
  }
  return rows;
};

const tec = readTable(/^Table 2\. Sediment quality guidelines/, /^TEL\s/);
const pec = readTable(/^Table 3\. Sediment quality guidelines/, /^PEL\s/);
console.log(`TEC rows ${tec.length}, PEC rows ${pec.length}`);

const header = [
  'cas',
  'name_printed',
  'medium',
  'basis',
  'value',
  'unit_printed',
  'table_or_page',
  'note',
];
const body: string[] = [];
const add = (basis: 'TEC' | 'PEC', rows: Row[]) => {
  for (const r of rows) {
    const nameOut = r.name === 'Heptachlor Epoxide' ? 'Heptachlor epoxide' : r.name;
    const unit = METALS.has(nameOut) ? 'mg/kg DW' : 'µg/kg DW';
    const table =
      basis === 'TEC'
        ? 'Table 2, Arch Environ Contam Toxicol 39(1):23'
        : 'Table 3, Arch Environ Contam Toxicol 39(1):24';
    const note =
      basis === 'TEC' && nameOut === 'Dibenz[a,h]anthracene'
        ? 'dry weight; the article prints no PEC for this substance'
        : 'dry weight';
    body.push(csvLine(['', nameOut, 'sediment-freshwater', basis, r.value, unit, table, note]));
  }
};
add('TEC', tec);
add('PEC', pec);

const comments = [
  '# MacDonald, Ingersoll and Berger 2000, Arch Environ Contam Toxicol 39(1):20-31, Tables 2 and 3, consensus-based columns.',
  '# Transcribed by scripts/extract-macdonald2000.ts from a text-layer copy of the article (see manifest.json); value is as printed with thousands separators removed.',
  '# The article prints no CAS numbers; cas is empty. Table 2 has 29 TEC rows, Table 3 has 28 PEC rows.',
];
writeFileSync(out, [...comments, csvLine(header), ...body].join('\n') + '\n');
console.log(`wrote ${out}`);
