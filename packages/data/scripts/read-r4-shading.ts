// Manual use only, after scripts/extract-r4-sediment.ts. Never run by the gate or CI (it needs pdftoppm
// and pdftotext from poppler).
//
//   tsx scripts/read-r4-shading.ts [path/to/report.pdf]
//
// The Region 4 tables mark the unit of a value by the fill of its cell: the notes under Tables 2a and
// 2b say a gray shaded cell is ug/kg dry weight, and the section headings say "ug/kg @ 1% OC unless
// denoted by shading". This script renders each table page at 150 dpi, finds every printed value of
// the committed CSVs by its word box, reads the fill behind it and writes the fill into the shade
// columns of raw/sediment/epa-r4-2018/table-2{a,b,c}.csv: `none` (white), `gray` (the legend's gray)
// or `tan` (the darker fill of the section heading rows, used on some totals; the legend does not
// name it). Review the diff, then refresh manifest.json (scripts/build-sediment.ts --manifest).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvComments, csvLine, parseCsv } from '../src/sediment/csv.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(pkg, 'raw/sediment/epa-r4-2018');
const pdf = process.argv[2] ?? join(dir, 'report.pdf');
const DPI = 150;

interface Word {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  s: string;
}

const bbox = execFileSync('pdftotext', ['-bbox', '-f', '81', '-l', '89', pdf, '-'], {
  encoding: 'utf8',
  maxBuffer: 1 << 28,
});
const pageWords = new Map<number, { w: number; words: Word[] }>();
bbox.split('<page ').forEach((chunk, i) => {
  if (i === 0) return;
  const width = Number(/width="([\d.]+)"/.exec(chunk)![1]);
  const words: Word[] = [];
  const re =
    /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk)) !== null) {
    words.push({ x0: +m[1]!, y0: +m[2]!, x1: +m[3]!, y1: +m[4]!, s: m[5]! });
  }
  pageWords.set(80 + i, { w: width, words });
});

interface Image {
  w: number;
  h: number;
  px: Buffer;
}
const tmp = mkdtempSync(join(tmpdir(), 'r4-shade-'));
const images = new Map<number, Image>();
const imageOf = (page: number): Image => {
  const hit = images.get(page);
  if (hit) return hit;
  const base = join(tmp, `p${page}`);
  execFileSync('pdftoppm', [
    '-r',
    String(DPI),
    '-f',
    `${page}`,
    '-l',
    `${page}`,
    '-singlefile',
    pdf,
    base,
  ]);
  const buf = readFileSync(`${base}.ppm`);
  // P6 header: magic, width, height, maxval, each followed by whitespace.
  const head = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(buf.subarray(0, 40).toString('latin1'))!;
  const img = { w: +head[1]!, h: +head[2]!, px: buf.subarray(head[0].length) };
  images.set(page, img);
  return img;
};

type Shade = 'none' | 'gray' | 'tan';

/** The fill behind a word: the majority class of the light pixels in a band around it. */
const shadeOf = (page: number, w: Word): Shade => {
  const img = imageOf(page);
  const s = img.w / pageWords.get(page)!.w;
  const counts: Record<Shade, number> = { none: 0, gray: 0, tan: 0 };
  const x0 = Math.round((w.x0 - 5) * s);
  const x1 = Math.round((w.x1 + 5) * s);
  const y0 = Math.round((w.y0 + 2) * s);
  const y1 = Math.round((w.y1 - 2) * s);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const o = (y * img.w + x) * 3;
      const r = img.px[o]!;
      const g = img.px[o + 1]!;
      const b = img.px[o + 2]!;
      if (r > 245 && g > 245 && b > 245) counts.none++;
      else if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r > 195 && r < 240) counts.gray++;
      else if (r - b > 25 && r > 160 && r < 235 && g > 150) counts.tan++;
    }
  }
  const best = (Object.keys(counts) as Shade[]).sort((a, b) => counts[b] - counts[a])[0]!;
  if (counts[best] === 0) throw new Error(`page ${page} ${w.s}: no background pixels`);
  return best;
};

const norm = (s: string): string => s.replace(/,/g, '');

/** Finds the word of one printed value: same text, nearest its column centre, at or below `minY`. */
const locate = (
  page: number,
  value: string,
  centre: number,
  minY: number,
  lineY?: number,
): Word => {
  const words = pageWords
    .get(page)!
    .words.filter(
      (w) =>
        norm(w.s) === value &&
        Math.abs((w.x0 + w.x1) / 2 - centre) < 30 &&
        w.y0 >= minY - 0.5 &&
        (lineY === undefined || Math.abs(w.y0 - lineY) < 9),
    );
  words.sort((a, b) => a.y0 - b.y0);
  if (words.length === 0) throw new Error(`page ${page}: value ${value} not found below ${minY}`);
  return words[0]!;
};

const columnCentres = (page: number, n: number): number[] => {
  const heads = pageWords
    .get(page)!
    .words.filter((w) => (w.s === 'ESV' || w.s === 'RSV') && w.y0 < 200)
    .map((w) => (w.x0 + w.x1) / 2)
    .sort((a, b) => a - b);
  if (heads.length !== n) throw new Error(`page ${page}: ${heads.length} column headings`);
  return heads;
};

const rewrite = (file: string, valueCols: string[], shadeCols: string[]): void => {
  const path = join(dir, file);
  const text = readFileSync(path, 'utf8');
  const rows = parseCsv(text);
  const header = Object.keys(rows[0]!).filter((h) => !shadeCols.includes(h));
  let page = 0;
  let minY = 0;
  for (const r of rows) {
    const p = Number(r['page']);
    if (p !== page) {
      page = p;
      minY = 0;
    }
    const centres = columnCentres(p, valueCols.length);
    let lineY: number | undefined;
    valueCols.forEach((c, i) => {
      const v = r[c]!;
      if (v === '') {
        r[shadeCols[i]!] = '';
        return;
      }
      const w = locate(p, v, centres[i]!, minY, lineY);
      lineY ??= w.y0;
      r[shadeCols[i]!] = shadeOf(p, w);
    });
    if (lineY !== undefined) minY = lineY + 4;
  }
  const comments = csvComments(text).filter((l) => !/shade column|basis of a value/.test(l));
  comments.push(
    'unit and sectionBasis come from the section heading above the row; each shade column is the fill of the value cell read from the page by scripts/read-r4-shading.ts (none, gray, or tan), and the build decides the basis of a value from it.',
  );
  const cols = [...header, ...shadeCols];
  const out = comments.map((l) => `# ${l}`);
  out.push(csvLine(cols));
  for (const r of rows) out.push(csvLine(cols.map((c) => r[c])));
  writeFileSync(path, out.join('\n') + '\n');
  const tally: Record<string, number> = {};
  for (const r of rows) for (const c of shadeCols) if (r[c]) tally[r[c]!] = (tally[r[c]!] ?? 0) + 1;
  console.log(file, JSON.stringify(tally));
};

try {
  rewrite(
    'table-2a.csv',
    ['fwEsv', 'fwRsv', 'mEsv', 'mRsv'],
    ['fwEsvShade', 'fwRsvShade', 'mEsvShade', 'mRsvShade'],
  );
  rewrite(
    'table-2b.csv',
    ['fwEsv', 'fwRsv', 'mEsv', 'mRsv'],
    ['fwEsvShade', 'fwRsvShade', 'mEsvShade', 'mRsvShade'],
  );
  rewrite('table-2c.csv', ['rsv'], ['rsvShade']);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
