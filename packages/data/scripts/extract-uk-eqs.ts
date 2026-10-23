// Manual use only, when the Directions are re-fetched. Never run by the gate or CI (needs pdftotext).
//
//   tsx scripts/extract-uk-eqs.ts [path/to/directions-2015.pdf]
//
// Reads the Water Framework Directive (Standards and Classification) Directions (England and Wales)
// 2015 (the "other document" attached to SI 2015/1623 on legislation.gov.uk, as made) with
// `pdftotext -layout` and writes into raw/uk-eqs/:
//   eqs.csv        Schedule 3 Part 2 Table 1 (specific pollutants) and Part 3 Table 1 (priority
//                  substances and other pollutants), one row per printed water value
//   zinc-abc.csv   Schedule 3 Part 2 Table 2 (ambient background concentrations for dissolved zinc)
// Blank cells and cells printed "not applicable" or "see footnote" produce no row; biota cells are
// left out. Columns are placed by the horizontal position of each printed token. The copper, zinc
// and manganese rows, whose cells are equations or multi-line text, and the cadmium class values are
// read as text and checked against the page before they are written.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvLine } from '../src/sediment/csv.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(pkg, 'raw/uk-eqs');
const pdf = process.argv[2] ?? join(dir, 'directions-2015.pdf');

const text = execFileSync('pdftotext', ['-layout', pdf, '-'], {
  encoding: 'utf8',
  maxBuffer: 1 << 28,
});
const pages = text.split('\f').map((p) => p.split('\n'));

interface Tok {
  s: string;
  x: number;
}
const toks = (line: string): Tok[] =>
  [...line.matchAll(/\S+/g)].map((m) => ({ s: m[0], x: m.index ?? 0 }));
const isPageNumber = (l: string): boolean => /^\s*\d{1,3}\s*$/.test(l);

interface Out {
  cas: string;
  name: string;
  medium: string;
  basis: string;
  value: string;
  unit: string;
  where: string;
  note: string;
}
const out: Out[] = [];
const skipped = { part2: 0, part3: 0 };

// ---- footnote collection -------------------------------------------------------------------
const collectFootnotes = (lines: string[], marker: RegExp, stop: RegExp): Map<string, string> => {
  const map = new Map<string, string>();
  let key: string | null = null;
  for (const l of lines) {
    if (stop.test(l)) break;
    if (isPageNumber(l)) continue;
    const m = marker.exec(l);
    if (m) {
      key = m[1]!;
      map.set(key, '');
    } else if (key !== null && l.trim() !== '') {
      map.set(key, `${map.get(key)} ${l.trim()}`.trim());
    }
  }
  return map;
};

// ================= Part 2: specific pollutants =================================================
const p2Pages: { page: number; lines: string[] }[] = pages
  .map((lines, i) => ({ page: i + 1, lines }))
  .filter(
    ({ lines }) => lines.some((l) => /Standards\(i\) for specific pollutants/.test(l)) || false,
  );
const p2First = p2Pages[0]?.page;
if (p2First === undefined) throw new Error('Part 2 Table 1 not found');
// Part 2 table runs from its first page to the footnote "(i)" line of the first page that has one.
const part2Lines: { page: number; line: string }[] = [];
let inP2 = false;
let p2Footnote: string[] = [];
for (let pi = p2First - 1; pi < pages.length; pi++) {
  const lines = pages[pi]!;
  let idx = 0;
  if (!inP2) {
    idx = lines.findIndex((l) => /^\s*\(Mean\)\s+\(95 percentile\)/.test(l)) + 1;
    if (idx === 0) continue;
    inP2 = true;
  }
  for (; idx < lines.length; idx++) {
    const l = lines[idx]!;
    if (/^\(i\)\s*$/.test(l)) {
      p2Footnote = [...lines.slice(idx), ...(pages[pi + 1] ?? [])];
      inP2 = false;
      break;
    }
    part2Lines.push({ page: pi + 1, line: l });
  }
  if (!inP2) break;
}
if (p2Footnote.length === 0) throw new Error('Part 2 footnotes not found');
const p2Notes = collectFootnotes(p2Footnote, /^\(([ivx]+)\)\s*$/, /^Table 2\s*$/);

const ROMAN_REF = /\(([ivx]+)\)/g;
const P2_SKIP_NOTES = new Set<string>();
const colOf = (x: number): number => (x < 41 ? 0 : x < 60 ? 1 : x < 80 ? 2 : 3);
const P2_COLS = [
  { medium: 'freshwater', basis: 'long-term (mean)' },
  { medium: 'freshwater', basis: 'short-term (95 percentile)' },
  { medium: 'marine', basis: 'long-term (mean)' },
  { medium: 'marine', basis: 'short-term (95 percentile)' },
];
const TITLE = 'Sch 3 Pt 2 Table 1';

interface P2Row {
  page: number;
  name: string;
  cells: (string | null)[];
}
const p2Rows: P2Row[] = [];
for (const { page, line } of part2Lines) {
  if (isPageNumber(line) || line.trim() === '') continue;
  const t = toks(line);
  const nameToks = t.filter((k) => k.x < 30);
  const valToks = t.filter((k) => k.x >= 30);
  if (nameToks.length === 0) continue;
  const name = nameToks.map((k) => k.s).join(' ');
  if (valToks.length === 0) {
    const last = p2Rows[p2Rows.length - 1];
    if (last) last.name += ` ${name}`;
    continue;
  }
  const cells: (string | null)[] = [null, null, null, null];
  for (const v of valToks) {
    const c = colOf(v.x);
    cells[c] = cells[c] === null ? v.s : `${cells[c]} ${v.s}`;
  }
  p2Rows.push({ page, name, cells });
}

const p2Name = (raw: string): { name: string; refs: string[] } => {
  const refs = [...raw.matchAll(ROMAN_REF)].map((m) => m[1]!);
  let name = raw
    .replace(ROMAN_REF, '')
    .replace(/[\s,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const open = (name.match(/\(/g) ?? []).length;
  const close = (name.match(/\)/g) ?? []).length;
  if (open > close) name += ')';
  return { name, refs };
};
const p2NoteText = (refs: string[], extra: string[]): string => {
  const parts = [...extra];
  if (!p2Notes.get('i')?.startsWith('Standards are expressed as total concentrations')) {
    throw new Error('Part 2 footnote (i) changed');
  }
  parts.push(
    'total concentration in the whole water sample unless a footnote says otherwise (footnote i)',
  );
  for (const r of refs) {
    const t = p2Notes.get(r);
    if (t && !P2_SKIP_NOTES.has(r)) parts.push(`footnote (${r}): ${t}`);
  }
  return parts.join('; ');
};
const requireText = (needle: string): void => {
  if (!text.includes(needle)) throw new Error(`expected printed text not found: ${needle}`);
};
const UG = 'µg/l';

for (const row of p2Rows) {
  const { name, refs } = p2Name(row.name);
  const where = `${TITLE}, PDF p.${row.page}`;
  const push = (c: number, value: string, extra: string[], unit = UG): void => {
    out.push({
      cas: '',
      name,
      medium: P2_COLS[c]!.medium,
      basis: P2_COLS[c]!.basis,
      value,
      unit,
      where,
      note: p2NoteText(refs, extra),
    });
  };
  if (/^Copper/.test(name)) {
    requireText('1µg/l');
    requireText('3.76 + (2.677 x');
    requireText('((DOC/2) –');
    push(0, '1', ['printed 1µg/l bioavailable (UKTAG Metal Bioavailability Assessment Tool)']);
    push(2, '3.76', [
      'printed 3.76 µg/l dissolved, where DOC <= 1 mg/l',
      'where DOC > 1 mg/l: 3.76 + (2.677 x ((DOC/2) – 0.5)) µg/l dissolved (DOC is the annual mean dissolved organic carbon in mg/l)',
    ]);
    continue;
  }
  if (/^Zinc/.test(name)) {
    requireText('10.9');
    requireText('6.8 dissolved');
    push(0, '10.9', [
      'printed 10.9 bioavailable plus Ambient Background Concentration (µg/l) dissolved; the concentration is added to the catchment value in zinc-abc.csv',
    ]);
    push(2, '6.8', [
      'printed 6.8 dissolved plus Ambient Background Concentration (µg/l); footnote (xxii) recommends 1.1 µg/l for saltwater',
    ]);
    continue;
  }
  if (/^Manganese/.test(name)) {
    requireText('123');
    push(0, '123', ['printed 123 bioavailable (UKTAG Metal Bioavailability Assessment Tool)']);
    continue;
  }
  row.cells.forEach((cell, c) => {
    if (cell === null) return;
    if (!/^\d+(?:\.\d+)?$/.test(cell)) throw new Error(`Part 2 unparsed ${name}: ${cell}`);
    push(c, cell, []);
  });
}

// ---- Table 2: zinc ambient background concentrations --------------------------------------
{
  const zinc: string[] = [csvLine(['catchment', 'abc_ug_per_l', 'table_or_page'])];
  let on = false;
  let pageNo = 0;
  let count = 0;
  for (let pi = 0; pi < pages.length; pi++) {
    for (const l of pages[pi]!) {
      if (
        /^Table 2\s*$/.test(l) &&
        pages[pi]!.some((x) => /Ambient Background Concentrations\(i\)/.test(x))
      ) {
        on = true;
        pageNo = pi + 1;
        continue;
      }
      if (!on) continue;
      if (/^\(i\)\s*$/.test(l)) {
        on = false;
        break;
      }
      const m = /^(\S.*?)\s{2,}(\d+\.\d+)\s*$/.exec(l);
      if (m && m[1] !== 'Catchment/Group of catchments(ii)') {
        zinc.push(
          csvLine([m[1]!.trim(), m[2]!, `Sch 3 Pt 2 Table 2, PDF p.${pageNo + (pi + 1 - pageNo)}`]),
        );
        count++;
      }
    }
    if (!on && count > 0) break;
  }
  if (count !== 33) throw new Error(`expected 33 zinc ABC rows, found ${count}`);
  writeFileSync(join(dir, 'zinc-abc.csv'), zinc.join('\n') + '\n');
}

// ================= Part 3: priority substances ================================================
const CAS_RE = /^\d{2,7}-\d\d-\d$/;
const t3Start = pages.findIndex((p) =>
  p.some((l) => /Table 1: Environmental quality standards for priority substances/.test(l)),
);
if (t3Start < 0) throw new Error('Part 3 Table 1 not found');
const t3Lines: { page: number; lines: string[] }[] = [];
let p3Footnote: string[] = [];
for (let pi = t3Start; pi < pages.length; pi++) {
  const lines = pages[pi]!;
  const fnIdx = lines.findIndex((l) => /^\s{3,6}\(1\)\s*$/.test(l));
  if (fnIdx >= 0) {
    t3Lines.push({ page: pi + 1, lines: lines.slice(0, fnIdx) });
    p3Footnote = [...lines.slice(fnIdx), ...(pages[pi + 1] ?? [])];
    break;
  }
  t3Lines.push({ page: pi + 1, lines });
}
if (p3Footnote.length === 0) throw new Error('Part 3 footnotes not found');
const p3Notes = collectFootnotes(p3Footnote, /^\s*\((\d+)\)\s*$/, /^\s*PART 4/);
const P3_SKIP_NOTES = new Set(['1', '2', '3', '4', '5', '9', '14']);
const P3_COLS = [
  { medium: 'freshwater', basis: 'AA-EQS inland' },
  { medium: 'marine', basis: 'AA-EQS other surface waters' },
  { medium: 'freshwater', basis: 'MAC-EQS inland' },
  { medium: 'marine', basis: 'MAC-EQS other surface waters' },
];
const CLASS_TEXT = [
  '< 40 mg CaCO3/l',
  '40 to < 50 mg CaCO3/l',
  '50 to < 100 mg CaCO3/l',
  '100 to < 200 mg CaCO3/l',
  '>= 200 mg CaCO3/l',
];

interface P3Row {
  page: number;
  name: string;
  cas: string[];
  rest: string;
  extraLines: string[];
  lines: string[];
}
const p3Rows: P3Row[] = [];
for (const { page, lines } of t3Lines) {
  const allTok = lines.flatMap((l) => toks(l));
  const casTok = allTok.filter((k) => CAS_RE.test(k.s));
  if (casTok.length === 0) continue;
  const casX = Math.min(...casTok.map((k) => k.x));
  // Left of this x is the item number and name; the CAS number and everything right of it follow.
  let started = false;
  for (const l of lines) {
    if (isPageNumber(l) || l.trim() === '') continue;
    const t = toks(l);
    if (t.length === 0) continue;
    const left = t.filter((k) => k.x < casX - 1);
    const right = t.filter((k) => k.x >= casX - 1);
    const nameToks = left.filter((k, i) => !(i === 0 && /^\d+[a-z]?\.?$/.test(k.s) && k.x < 10));
    const rightText = right.map((k) => k.s).join(' ');
    const isStart =
      right.length >= 2 && (/^\d+-\d\d-\d/.test(right[0]!.s) || /^(Not|not|See)/.test(right[0]!.s));
    if (isStart) {
      started = true;
      p3Rows.push({
        page,
        name: nameToks.map((k) => k.s).join(' '),
        cas: [],
        rest: rightText,
        extraLines: [],
        lines: [l],
      });
    } else if (started) {
      const last = p3Rows[p3Rows.length - 1];
      if (!last) continue;
      last.lines.push(l);
      if (nameToks.length > 0) last.name += ` ${nameToks.map((k) => k.s).join(' ')}`;
      const pieces = right.filter((k) => /^\d+-[\d-]*$/.test(k.s));
      if (pieces.length > 0) last.cas.push(...pieces.map((k) => k.s));
      else if (right.length > 0) last.extraLines.push(l);
    }
  }
}

const refsOf = (s: string): string[] => [...s.matchAll(/\((\d+)\)/g)].map((m) => m[1]!);
const cleanName = (s: string): string =>
  s
    .replace(/\(\d+\)(,\s*\(\d+\))*/g, '')
    .replace(/\s*,\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

for (const row of p3Rows) {
  const where = `Sch 3 Pt 3 Table 1, PDF p.${row.page}`;
  const name = cleanName(row.name);
  const nameRefs = refsOf(row.name);
  if (/^Dioxins/.test(name)) {
    skipped.part3 += 4;
    continue;
  }
  if (/^Cadmium/.test(name)) {
    emitCadmium(row, name, where, nameRefs);
    continue;
  }
  let rest = row.rest;
  // CAS
  let cas = '';
  const casM = /^(\d+-\d\d-\d(?:\/\d+-)?)\s*/.exec(rest);
  if (casM) {
    cas = casM[1]!;
    rest = rest.slice(casM[0].length);
    if (cas.endsWith('-')) {
      cas += row.cas.shift() ?? '';
    }
    if (row.cas.length > 0) cas = [cas, ...row.cas].join(';');
  } else {
    rest = rest.replace(/^(Not applicable|not applicable)\s*/, '');
    rest = rest.replace(/^See footnote \d+( in Annex X to Directive 2000\/60\/EC)?\s*/, '');
  }
  const dated = /22\/12\/18/.test(rest);
  rest = rest
    .replace(/22\/12\/18/g, '')
    .replace(/onwards/g, '')
    .replace(/(\d+(?:\.\d+)?)\s*×\s*10\s*[–-](\d+)/g, '$1e-$2')
    .replace(/Σ\s*=\s*/g, '')
    .replace(/see footnote \d+/g, 'NA')
    .replace(/not applicable(\(\d+\))?/g, 'NA')
    .replace(/\bnot\b/g, 'NA')
    .replace(/applicable\(\d+\)/g, '');
  const tk = rest.split(/\s+/).filter((s) => s !== '');
  void dated;
  const sums = /Σ/.test(row.rest);
  let cells: (string | undefined)[];
  if (tk.length >= 5) cells = tk.slice(0, 4);
  else if (tk.length === 4) cells = tk;
  else if (tk.length === 3) cells = [undefined, undefined, tk[0], tk[1]];
  else throw new Error(`Part 3 row ${name}: tokens ${JSON.stringify(tk)}`);
  if (tk.length === 3 && tk[2] === undefined) throw new Error('unreachable');
  // A three-token row is `blank blank MAC-inland MAC-other biota`; re-map with the biota last.
  cells.forEach((cell, c) => {
    if (cell === undefined || cell === 'NA') {
      if (cell === 'NA' || c < 2) skipped.part3++;
      return;
    }
    const m = /^(\d+(?:\.\d+)?(?:e-\d+)?)(?:\((\d+)\))?$/.exec(cell);
    if (!m) throw new Error(`Part 3 unparsed ${name}: ${cell}`);
    const cellRefs = m[2] ? [m[2]] : [];
    const lead: string[] = [];
    if (sums) lead.push('printed with Σ, a sum over the listed substances');
    if (/e-/.test(m[1]!)) lead.push('value printed as a power of ten');
    if (row.rest.includes('22/12/18')) lead.push('applies from 22/12/18 (Sch 3 Pt 3 paragraph 2)');
    const parts = [...lead];
    for (const n of [...new Set([...nameRefs, ...cellRefs])]) {
      const t = p3Notes.get(n);
      if (t && !P3_SKIP_NOTES.has(n)) parts.push(`footnote ${n}: ${t}`);
    }
    if (cas === '') parts.push('CAS not printed as a number for this row');
    out.push({
      cas: cas === '' ? '' : cas,
      name,
      medium: P3_COLS[c]!.medium,
      basis: P3_COLS[c]!.basis,
      value: String(Number(m[1]!)),
      unit: UG,
      where,
      note: parts.join('; '),
    });
  });
}

writeCsv();

function emitCadmium(row: P3Row, name: string, where: string, nameRefs: string[]): void {
  const first = row.lines[0]!;
  const marine = /\(Class 1\)\s+(\d+\.\d+)\s+≤/.exec(first);
  if (!marine) throw new Error('cadmium AA other surface waters value not found');
  const notes = (extra: string[]): string => {
    const parts = [...extra];
    for (const n of nameRefs) {
      const t = p3Notes.get(n);
      if (t && !P3_SKIP_NOTES.has(n)) parts.push(`footnote ${n}: ${t}`);
    }
    return parts.join('; ');
  };
  out.push({
    cas: '7440-43-9',
    name,
    medium: 'marine',
    basis: 'AA-EQS other surface waters',
    value: marine[1]!,
    unit: UG,
    where,
    note: notes([]),
  });
  const seen = new Set<string>();
  for (const l of row.lines) {
    for (const m of l.matchAll(/(≤\s*)?(\d+[.,]\d+)\s*\(Class (\d)\)/g)) {
      const cls = Number(m[3]);
      const col = (m.index ?? 0) < 90 ? 0 : 2;
      const key = `${col}-${cls}`;
      if (seen.has(key)) throw new Error(`duplicate cadmium class ${key}`);
      seen.add(key);
      out.push({
        cas: '7440-43-9',
        name,
        medium: 'freshwater',
        basis: `${P3_COLS[col]!.basis}, hardness class ${cls}`,
        value: m[2]!.replace(',', '.'),
        unit: UG,
        where,
        note: notes([
          `hardness class ${cls} (${CLASS_TEXT[cls - 1]})`,
          `printed ${m[0].replace(/\s+/g, ' ')}`,
          ...(col === 2
            ? ['the MAC-EQS other surface waters cell is not printed for cadmium in this text']
            : []),
        ]),
      });
    }
  }
  if (seen.size !== 10) throw new Error(`expected 10 cadmium class values, found ${seen.size}`);
}

function writeCsv(): void {
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
      csvLine([o.cas, o.name, o.medium, o.basis, o.value, o.unit, o.where, o.note]),
    ),
  ];
  writeFileSync(join(dir, 'eqs.csv'), lines.join('\n') + '\n');
  process.stderr.write(
    `wrote ${out.length} rows (${p2Rows.length} Part 2 substances, ${p3Rows.length} Part 3 rows); skipped cells ${JSON.stringify(skipped)}\n`,
  );
}
