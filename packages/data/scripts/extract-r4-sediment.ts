// Manual use only, when EPA publishes a new Region 4 ERA supplemental guidance. Never run by the gate
// or CI (it needs pdftotext from poppler).
//
//   tsx scripts/extract-r4-sediment.ts [path/to/report.pdf]
//
// Reads Tables 2a, 2b and 2c from the committed PDF with `pdftotext -layout` and writes
// raw/sediment/epa-r4-2018/table-2{a,b,c}.csv. Values and source letters are kept as printed; the
// page of each row is the PDF page number. Blank cells are placed by the horizontal position of each
// printed token against the column headings of its page. Then run scripts/read-r4-shading.ts, which
// adds the cell fill (the report's unit marker) as shade columns. Review the printed anomalies and the
// diff of the CSVs, then refresh manifest.json (scripts/build-sediment.ts --manifest).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvLine } from '../src/sediment/csv.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(pkg, 'raw/sediment/epa-r4-2018');
const pdf = process.argv[2] ?? join(dir, 'report.pdf');

const text = execFileSync('pdftotext', ['-layout', pdf, '-'], {
  encoding: 'utf8',
  maxBuffer: 1 << 28,
});
const pages = text.split('\f');

interface Tok {
  s: string;
  x0: number;
  x1: number;
  c: number;
}
const tokens = (line: string): Tok[] => {
  const out: Tok[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    out.push({ s: m[0], x0: m.index, x1: m.index + m[0].length, c: m.index + m[0].length / 2 });
  }
  return out;
};

const NUM = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$|^\*$/;
const CAS_IN_LINE = /(?<=\s)(\d{2,7})-(\d{2})\s?-\s?(\d)(?=\s)/;
const CODE = /\s{2,}(?:[A-Z]\d?\s+)?(DDTR|DDD|DDE|DDT)\s{2,}(?=[\d*])/;
const MODE = /^(R|N2|N3|U|C|A|H|F|E)$/;
const anomalies: string[] = [];

const near = (x: number, centres: number[]): number => {
  let best = 0;
  centres.forEach((c, i) => {
    if (Math.abs(c - x) < Math.abs(centres[best]! - x)) best = i;
  });
  return best;
};

interface Parsed {
  page: number;
  section: string;
  unit: string;
  sectionBasis: string;
  chemical: string;
  cas: string;
  code: string;
  mode: string;
  both: boolean;
  cells: { v: string; src: string }[];
}

const sectionOf = (line: string): { section: string; unit: string; basis: string } | null => {
  if (!/(?:mg|µg)\/kg/.test(line)) return null;
  const section = line.trim().replace(/\s+/g, ' ');
  return {
    section,
    unit: /mg\/kg/.test(section) ? 'mg/kg' : 'ug/kg',
    basis: /1% ?OC/.test(section) ? 'oc1pct' : 'dw',
  };
};

function parseTable(table: '2a' | '2b' | '2c'): Parsed[] {
  const rows: Parsed[] = [];
  let cur = { section: '', unit: '', basis: '' };
  const single = table === '2c';
  pages.forEach((pg, idx) => {
    const lines = pg.split('\n');
    const titled = lines.some((l) => l.trim() === `Table ${table}`);
    if (!titled || !lines.some((l) => /Region 4 (Step 3a )?Sediment/.test(l))) return;
    const page = idx + 1;
    const hi = lines.findIndex(
      (l) => /^\s*ESV\s+RSV|^\s*RSV\s*$|\bESV\b.*\bRSV\b/.test(l) && !/Table|Sources|ESV -/.test(l),
    );
    const head = lines.slice(0, hi + 1);
    const hdr = lines[hi]!;
    const colCentres = tokens(hdr)
      .filter((t) => t.s === 'ESV' || t.s === 'RSV')
      .map((t) => t.c);
    const srcLine = head.find((l) => /\bSource\b/.test(l))!;
    const srcCentres = tokens(srcLine)
      .filter((t) => t.s === 'Source')
      .map((t) => t.c);
    const expectCols = single ? 1 : 4;
    if (colCentres.length !== expectCols || srcCentres.length !== (single ? 1 : 2)) {
      throw new Error(`page ${page}: could not read the column headings`);
    }
    for (const line of lines.slice(hi + 1)) {
      if (/Notes?:|Sources:/.test(line)) break;
      if (/^\s*Page \d+ of \d+/.test(line) || line.trim() === '') continue;
      const toks = tokens(line);
      const numAt = toks.findIndex(
        (t, i) => NUM.test(t.s) && t.x0 > 30 && (i === 0 ? true : t.x0 - toks[i - 1]!.x1 >= 3),
      );
      if (numAt < 0) {
        const s = sectionOf(line);
        if (s) cur = s;
        continue;
      }
      const catMatch = CAS_IN_LINE.exec(line);
      const codeMatch = CODE.exec(line);
      let left: string;
      let cas = '';
      let code = '';
      let afterIdx: number;
      if (catMatch) {
        cas = `${catMatch[1]}-${catMatch[2]}-${catMatch[3]}`;
        left = line.slice(0, catMatch.index);
        afterIdx = catMatch.index + catMatch[0].length;
      } else if (codeMatch) {
        code = codeMatch[1]!;
        left = line.slice(0, codeMatch.index + codeMatch[0].indexOf(code));
        afterIdx = codeMatch.index + codeMatch[0].length;
      } else {
        // No CAS number: the name runs to the first number; a lone "-" marks an empty CAS cell (Table 2c).
        left = line.slice(0, toks[numAt]!.x0).replace(/\s+-\s*$/, '');
        afterIdx = toks[numAt]!.x0;
      }
      const ltoks = left.trim().split(/\s+/);
      let mode = '';
      if (ltoks.length > 1 && MODE.test(ltoks[ltoks.length - 1]!)) mode = ltoks.pop()!;
      let chemical = ltoks.join(' ').replace(/\s+-$/, '');
      const both = /\s\*$/.test(chemical);
      chemical = chemical.replace(/\s\*$/, '').trim();
      const rest = tokens(line.slice(afterIdx).padStart(line.length, ' '));
      const nums = rest.filter((t) => NUM.test(t.s));
      const lets = rest.filter((t) => /^[A-Za-z],?$/.test(t.s));
      const stray = rest.filter((t) => !NUM.test(t.s) && !/^[A-Za-z],?$/.test(t.s));
      if (stray.length)
        anomalies.push(`page ${page} ${chemical}: stray tokens ${stray.map((t) => t.s).join(' ')}`);
      const cells: { v: string; src: string }[] = Array.from({ length: expectCols }, () => ({
        v: '',
        src: '',
      }));
      for (const n of nums) cells[near(n.c, colCentres)]!.v = n.s.replace(/,/g, '');
      if (single) {
        cells[0]!.src = lets
          .map((l) => l.s.replace(',', ''))
          .join(',')
          .toLowerCase();
      } else {
        for (const med of [0, 1]) {
          const here = nums.filter((n) => n.s !== '*' && near(n.c, colCentres) >> 1 === med);
          const ls = lets
            .filter((l) => near(l.c, srcCentres) === med)
            .map((l) => l.s.replace(',', '').toLowerCase());
          const slots = [med * 2, med * 2 + 1].filter(
            (i) => cells[i]!.v !== '' && cells[i]!.v !== '*',
          );
          if (ls.length === slots.length) slots.forEach((i, k) => (cells[i]!.src = ls[k]!));
          else if (ls.length === 1 && slots.length === 2) {
            // one source for both values of the medium
            slots.forEach((i) => (cells[i]!.src = ls[0]!));
          } else if (ls.length === 2 && slots.length === 1) {
            // both source letters printed, only one value: the letter in the value's own column
            cells[slots[0]!]!.src = ls[slots[0]! % 2]!;
          } else if (ls.length !== 0 || here.length !== 0) {
            anomalies.push(
              `page ${page} ${chemical}: ${here.length} values but ${ls.length} source letters`,
            );
          }
        }
      }
      rows.push({
        page,
        section: cur.section,
        unit: cur.unit,
        sectionBasis: cur.basis,
        chemical,
        cas,
        code,
        mode,
        both,
        cells,
      });
    }
  });
  return rows;
}

const header = (table: string, pagesUsed: number[]): string[] => [
  `# Region 4 Ecological Risk Assessment Supplemental Guidance, March 2018 Update, Table ${table}`,
  `# Transcribed by scripts/extract-r4-sediment.ts from report.pdf (see manifest.json for the checksum); PDF pages ${Math.min(...pagesUsed)} to ${Math.max(...pagesUsed)}; the page column is the PDF page of each row.`,
  '# Values and source letters are as printed; thousands separators are removed; a blank cell is a value the table does not print. Source letters are the table notes keys.',
  '# unit and sectionBasis come from the section heading above the row; scripts/read-r4-shading.ts adds the shade columns.',
];

for (const table of ['2a', '2b'] as const) {
  const rows = parseTable(table);
  const out = header(
    table,
    rows.map((r) => r.page),
  );
  out.push(
    csvLine([
      'page',
      'section',
      'unit',
      'sectionBasis',
      'chemical',
      'cas',
      'code',
      'mode',
      'bothReceptors',
      'fwEsv',
      'fwEsvSrc',
      'fwRsv',
      'fwRsvSrc',
      'mEsv',
      'mEsvSrc',
      'mRsv',
      'mRsvSrc',
    ]),
  );
  for (const r of rows) {
    out.push(
      csvLine([
        r.page,
        r.section,
        r.unit,
        r.sectionBasis,
        r.chemical,
        r.cas,
        r.code,
        r.mode,
        r.both ? 'yes' : '',
        r.cells[0]!.v,
        r.cells[0]!.src,
        r.cells[1]!.v,
        r.cells[1]!.src,
        r.cells[2]!.v,
        r.cells[2]!.src,
        r.cells[3]!.v,
        r.cells[3]!.src,
      ]),
    );
  }
  writeFileSync(join(dir, `table-${table}.csv`), out.join('\n') + '\n');
  console.log(`table ${table}: ${rows.length} rows`);
}
{
  const rows = parseTable('2c');
  const out = header(
    '2c',
    rows.map((r) => r.page),
  );
  out.push(
    csvLine(['page', 'section', 'unit', 'sectionBasis', 'chemical', 'cas', 'rsv', 'rsvSrc']),
  );
  for (const r of rows) {
    out.push(
      csvLine([
        r.page,
        r.section || 'PAHs - µg/kg @ 1% OC',
        'ug/kg',
        'oc1pct',
        r.chemical,
        r.cas,
        r.cells[0]!.v,
        r.cells[0]!.src,
      ]),
    );
  }
  writeFileSync(join(dir, 'table-2c.csv'), out.join('\n') + '\n');
  console.log(`table 2c: ${rows.length} rows`);
}
for (const a of anomalies) console.log('ANOMALY', a);
