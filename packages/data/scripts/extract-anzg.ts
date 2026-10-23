// Manual use only, when Water Quality Australia republishes the toxicant default guideline value (DGV)
// master table. Never run by the gate or CI (it needs the `unzip` command).
//
//   tsx scripts/extract-anzg.ts <path/to/toxicants-dgvs-mastertable.xlsx>
//
// The master table is one worksheet, one row per toxicant and medium, with columns for the 99, 95, 90
// and 80 percent species protection values and one for a value of unknown protection level. This
// script writes raw/anzg/anzg-2018-dgv.csv (one row per printed value) and raw/anzg/manifest.json. The
// references live in packages/engine/src/references/references.json. Every value is read from the worksheet cells; nothing is typed in.
//
// The workbook is NOT committed (the department's default terms of use do not allow redistribution of
// material that carries no open licence mark, see the manifest), so only the values ship, as facts with
// the citation.
//
// Deterministic normalisations, all listed in the manifest:
//   - medium "Marine Water" and "Marine water" become "marine", "Freshwater" becomes "freshwater";
//   - names and reliability words are trimmed; the printed misspelling "Very Hihj" reads "Very High";
//   - a CAS number the workbook stored as a mangled date ("0107-06-02") is restored to digits-by-group
//     ("107-06-2") and kept only when the CAS check digit then verifies, otherwise the script fails;
//   - a printed CAS of "-" becomes blank; a CAS followed by a name keeps the number, the name goes to the note;
//   - a cell holding a comma list ("1.9, 1.5") is split into one row per entry, labelled from the
//     row's own comment text ("apply to Australia and New Zealand, respectively");
//   - the long dash in comment text becomes a colon and space (project style);
//   - the two stock sentences about the reliability update and about the technical brief are dropped
//     from the general comment, everything else in it is kept;
//   - rows with no value in any protection column are listed in the manifest and produce no CSV row.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { casCheckDigitValid } from '../src/nrwqc/parse.js';
import { csvLine } from '../src/sediment/csv.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(pkg, 'raw/anzg');

export const SOURCE_URL =
  'https://www.waterquality.gov.au/sites/default/files/documents/toxicants-dgvs-mastertable.xlsx';
export const PAGE_URL =
  'https://www.waterquality.gov.au/anz-guidelines/guideline-values/default/water-quality-toxicants/search/master-table';
export const COPYRIGHT_URL = 'https://www.waterquality.gov.au/anz-guidelines/copyright';
export const RETRIEVED = '2026-10-23';

export const CSV_HEADER = [
  'cas',
  'name_printed',
  'medium',
  'basis',
  'value',
  'unit_printed',
  'table_or_page',
  'note',
  'reliability',
  'publish_year',
] as const;

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

const unzipMember = (file: string, member: string): string =>
  execFileSync('unzip', ['-p', file, member], { encoding: 'utf8', maxBuffer: 1 << 28 });

export interface SheetRow {
  n: number;
  cells: Record<string, string>;
}

/** Reads the first worksheet into rows of column letter to text. Also returns the sheet name. */
export const readSheet = (file: string): { sheetName: string; rows: SheetRow[] } => {
  const shared = [
    ...unzipMember(file, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map((m) =>
    decodeXml([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]!).join('')),
  );
  const workbook = unzipMember(file, 'xl/workbook.xml');
  const sheetName = decodeXml(/<sheet [^>]*name="([^"]*)"/.exec(workbook)?.[1] ?? '');
  const sheet = unzipMember(file, 'xl/worksheets/sheet1.xml');
  const rows: SheetRow[] = [];
  for (const r of sheet.matchAll(/<row [^>]*>[\s\S]*?<\/row>/g)) {
    const n = Number(/ r="(\d+)"/.exec(r[0])![1]);
    const cells: Record<string, string> = {};
    for (const c of r[0].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const body = c[3];
      if (!body) continue;
      const v = /<v>([\s\S]*?)<\/v>/.exec(body);
      let val: string;
      if (v) val = c[2]!.includes('t="s"') ? (shared[Number(v[1])] ?? '') : v[1]!;
      else val = decodeXml(/<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? '');
      cells[c[1]!] = val;
    }
    rows.push({ n, cells });
  }
  return { sheetName, rows };
};

const clean = (s: string | undefined): string =>
  (s ?? '')
    .replace(/[\u200b\r]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

const LEVELS: { col: string; commentCol: string; basis: string }[] = [
  { col: 'G', commentCol: 'M', basis: '99 percent species protection' },
  { col: 'H', commentCol: 'N', basis: '95 percent species protection' },
  { col: 'I', commentCol: 'O', basis: '90 percent species protection' },
  { col: 'J', commentCol: 'P', basis: '80 percent species protection' },
  { col: 'K', commentCol: 'Q', basis: 'unknown level of protection' },
];

const EXPECTED_HEADER: Record<string, string> = {
  A: 'Toxicant name',
  C: 'Tox CAS',
  D: 'Tox Medium',
  E: 'Tox Reliability',
  F: 'Publish date',
  G: 'Tox LOSP 99',
  H: 'Tox LOSP 95',
  I: 'Tox LOSP 90',
  J: 'Tox LOSP 80',
  K: 'Tox LOSP unknown',
  L: 'Tox LOSP Unit',
  R: 'General comments',
};

export const normaliseCas = (printed: string): { cas: string; note: string } => {
  const p = clean(printed);
  if (p === '' || p === '-') return { cas: '', note: 'no CAS number printed' };
  const named = /^(\d+-\d\d-\d)\s*\((.*)\)$/.exec(p);
  if (named) {
    const bad = casCheckDigitValid(named[1]!) ? '' : '; the number as printed fails the CAS check';
    return { cas: named[1]!, note: `CAS printed with the name (${named[2]})${bad}` };
  }
  if (/^\d+-\d\d-\d$/.test(p)) {
    // A printed number that fails the CAS check is kept as printed and flagged, never corrected.
    return casCheckDigitValid(p)
      ? { cas: p, note: '' }
      : { cas: p, note: `CAS ${p} as printed fails the CAS check` };
  }
  const mangled = /^(\d+)-(\d\d)-(\d\d)$/.exec(p);
  if (mangled) {
    const fixed = `${Number(mangled[1])}-${mangled[2]}-${Number(mangled[3])}`;
    if (!casCheckDigitValid(fixed))
      throw new Error(`CAS ${p} restored to ${fixed} fails its check digit`);
    return {
      cas: fixed,
      note: `CAS stored in the workbook as the date-like text ${p}, restored to ${fixed}`,
    };
  }
  throw new Error(`unrecognised CAS text ${JSON.stringify(p)}`);
};

const STOCK = [
  /The reliability of the DGVs? has been updated according to the classification in Warne et al\. \(\d{4}\)\.\s*/g,
  /These DGVs? and the information in the corresponding DGVs? technical brief for this toxicant should be used in accordance with the detailed guidance provided on the Australian and New Zealand Guidelines for Fresh and Marine Water Quality website\.\s*/g,
];

const generalNote = (r: string | undefined): string => {
  let s = clean(r)
    .replace(/\u2014/g, ': ')
    .replace(/\n+/g, ' ')
    .replace(/[ ]{2,}/g, ' ');
  for (const re of STOCK) s = s.replace(re, '');
  return s.trim();
};

const normaliseReliability = (r: string | undefined): string => {
  const t = clean(r);
  return t === 'Very Hihj' ? 'Very High' : t;
};

const normaliseValue = (printed: string): string => {
  const n = Number(printed);
  if (!Number.isFinite(n)) throw new Error(`value ${JSON.stringify(printed)} is not a number`);
  return String(n);
};

/** Labels for a comma-list cell, taken from the row's own comment text. */
const listLabels = (name: string, count: number, comments: string): string[] => {
  if (count === 2 && /apply to Australia and New Zealand, respectively/.test(comments))
    return ['Australia', 'New Zealand'];
  if (
    count === 3 &&
    /soft water \(< 30 mg\/L CaCO3\), moderately hard water \(30–150 mg\/L CaCO3\) and hard water \(> 150 mg\/L CaCO3\), respectively/.test(
      comments,
    )
  )
    return [
      'soft water (< 30 mg/L CaCO3)',
      'moderately hard water (30–150 mg/L CaCO3)',
      'hard water (> 150 mg/L CaCO3)',
    ];
  throw new Error(`${name}: a ${count}-entry list with no label sentence in its comments`);
};

export interface AnzgRow {
  cas: string;
  name_printed: string;
  medium: 'freshwater' | 'marine';
  basis: string;
  value: string;
  unit_printed: string;
  table_or_page: string;
  note: string;
  reliability: string;
  publish_year: string;
}

export const extractRows = (
  file: string,
): {
  sheetName: string;
  rows: AnzgRow[];
  skipped: { row: number; name: string; medium: string; reason: string }[];
  sourceRows: number;
} => {
  const { sheetName, rows: sheet } = readSheet(file);
  const head = sheet[0];
  if (!head || head.n !== 1) throw new Error('worksheet has no header row');
  for (const [col, text] of Object.entries(EXPECTED_HEADER))
    if (clean(head.cells[col]) !== text)
      throw new Error(`header ${col} is ${JSON.stringify(head.cells[col])}, expected ${text}`);
  const out: AnzgRow[] = [];
  const skipped: { row: number; name: string; medium: string; reason: string }[] = [];
  for (const { n, cells } of sheet.slice(1)) {
    const name = clean(cells.A);
    const mediumPrinted = clean(cells.D);
    const medium = /^fresh/i.test(mediumPrinted)
      ? 'freshwater'
      : /^marine/i.test(mediumPrinted)
        ? 'marine'
        : null;
    if (!name || medium === null) throw new Error(`row ${n}: bad name or medium`);
    const hasValue = LEVELS.some((l) => clean(cells[l.col]) !== '');
    if (!hasValue) {
      skipped.push({ row: n, name, medium, reason: 'no value printed in any protection column' });
      continue;
    }
    const unit = clean(cells.L);
    if (unit === '') throw new Error(`row ${n} ${name}: value with no unit`);
    const { cas, note: casNote } = normaliseCas(cells.C ?? '');
    const general = generalNote(cells.R);
    const publishYear = clean(cells.F);
    const origin =
      publishYear === '2000'
        ? 'published 2000 (ANZECC and ARMCANZ 2000 value carried forward)'
        : `published ${publishYear}`;
    for (const lv of LEVELS) {
      const printed = clean(cells[lv.col]);
      if (printed === '') continue;
      const levelComment = clean(cells[lv.commentCol]);
      const parts = printed.split(',').map((s) => s.trim());
      const allComments = [cells.M, cells.N, cells.O, cells.P, cells.Q].map(clean).join(' ');
      const labels = parts.length === 1 ? [''] : listLabels(name, parts.length, allComments);
      parts.forEach((part, i) => {
        const noteBits = [origin, casNote, levelComment, general].filter((s) => s !== '');
        out.push({
          cas,
          name_printed: name,
          medium,
          basis: labels[i] ? `${lv.basis}, ${labels[i]}` : lv.basis,
          value: normaliseValue(part),
          unit_printed: unit,
          table_or_page: `master table worksheet "${sheetName}", row ${n}, column ${lv.col}`,
          note: noteBits.join(' | '),
          reliability: normaliseReliability(cells.E),
          publish_year: publishYear,
        });
      });
    }
  }
  return { sheetName, rows: out, skipped, sourceRows: sheet.length - 1 };
};

export const toCsv = (rows: AnzgRow[]): string =>
  [csvLine([...CSV_HEADER]), ...rows.map((r) => csvLine(CSV_HEADER.map((h) => r[h])))].join('\n') +
  '\n';

const main = (): void => {
  const file = process.argv[2];
  if (!file)
    throw new Error('usage: tsx scripts/extract-anzg.ts <toxicants-dgvs-mastertable.xlsx>');
  const bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const { sheetName, rows, skipped, sourceRows } = extractRows(file);
  const csv = toCsv(rows);
  writeFileSync(join(outDir, 'anzg-2018-dgv.csv'), csv);
  const byLevel: Record<string, number> = {};
  for (const r of rows)
    byLevel[r.basis.split(',')[0]!] = (byLevel[r.basis.split(',')[0]!] ?? 0) + 1;
  const manifest = {
    set: 'anzg',
    edition: 'Toxicant default guideline values master table, page last modified 10 September 2026',
    retrieved: RETRIEVED,
    source: {
      url: SOURCE_URL,
      landingPage: PAGE_URL,
      file: 'toxicants-dgvs-mastertable.xlsx',
      bytes: bytes.length,
      sha256,
      worksheet: sheetName,
      publicationDetails:
        'Australian and New Zealand governments, and Australian state and territory governments, 2026',
      committed: false,
    },
    terms: {
      url: COPYRIGHT_URL,
      summary:
        'The page marks the master table with no Creative Commons logo. Under the department copyright notice, material not available under a licence may be downloaded for personal non-commercial use or use within an organisation, and may not otherwise be copied, changed or supplied to another person. The workbook is therefore not committed. The values ship as facts with the citation.',
      attribution:
        'ANZG 2018. Australian and New Zealand Guidelines for Fresh and Marine Water Quality. Australian and New Zealand Governments and Australian state and territory governments, Canberra, ACT, Australia. Viewed 2026-10-23, ' +
        PAGE_URL,
    },
    extractor: 'packages/data/scripts/extract-anzg.ts',
    csv: {
      file: 'anzg-2018-dgv.csv',
      bytes: Buffer.byteLength(csv),
      sha256: createHash('sha256').update(csv).digest('hex'),
      rows: rows.length,
      sourceRows,
      rowsByProtectionLevel: byLevel,
    },
    provenance:
      'Column publish_year 2000 marks values the workbook says come from ANZECC and ARMCANZ (2000) and ANZG 2018 carries forward, with the reliability reclassified per Warne et al. (2018). Any other year is a value derived under the revised method and published by ANZG in that year. Sediment DGVs are a separate ANZG document and are not in this set.',
    normalisations: [
      'medium Marine Water and Marine water become marine; Freshwater becomes freshwater',
      'names and reliability words trimmed; the printed misspelling "Very Hihj" reads Very High',
      'CAS numbers stored as date-like text restored to digit groups and kept only when the check digit verifies',
      'a printed CAS of "-" becomes blank; a CAS followed by a name keeps the number and the name goes to the note',
      'comma-list cells split into one row per entry, labelled from the row own comment text',
      'two stock sentences (reliability update, technical brief pointer) dropped from the general comment',
      'a long dash in the general comment (four rows) becomes a colon and a space, per project style',
    ],
    rowsWithoutValues: skipped,
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `${rows.length} values from ${sourceRows} source rows; ${skipped.length} rows without values`,
  );
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
