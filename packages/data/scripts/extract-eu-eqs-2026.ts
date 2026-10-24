// Manual use only, when the consolidated Directive 2008/105/EC is re-fetched. Never run by the gate or CI.
//
//   tsx scripts/extract-eu-eqs-2026.ts [path/to/consolidated.xhtml [path/to/eqs.csv]]
//
// Reads the Publications Office consolidated text of Directive 2008/105/EC as amended by Directive (EU)
// 2026/805 (version 10.05.2026): Annex I Part A (priority substances, 13 columns) and Annex II Part C (the
// six substances moved out of Part A, which keep their values as Union-level river basin specific pollutant
// EQS). It writes raw/eu-eqs-2026/eqs.csv: one row per printed water value, in the columns of
// raw/eu-eqs/eqs.csv. The biota column and every cell printed "not applicable", "not derived", "see footnote"
// or blank are left out and counted in the stderr summary. Values are copied from the printed cells; only the
// decimal comma and the printed power of ten are normalised (the printed form stays in the note).
//
// The dates of application come from the same file: Article 3(1a)(iii) names the entries with revised EQS and
// Article 3(1a)(iv) the newly identified entries, each with its date of effect and its good-status year.
// The earlier layout (8 columns, 2013) is read by extract-eu-eqs.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvLine } from '../src/sediment/csv.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(pkg, 'raw/eu-eqs-2026');
const src = process.argv[2] ?? join(dir, 'consolidated-02008L0105-20260510.xhtml');
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
const plain = decode(html);

const tableRows = (segment: string): string[][] =>
  [...segment.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => decode(c[1]!)),
  );

// Annex I Part A runs from its heading to Part B; Annex II Part C from its heading to Annex III.
const at = (re: RegExp, from = 0): number => {
  const i = html.slice(from).search(re);
  return i < 0 ? -1 : from + i;
};
const aStart = at(/PART A:\s*(<[^>]+>\s*)*ENVIRONMENTAL QUALITY STANDARDS/);
const aEnd = at(/PART B:\s*(<[^>]+>\s*)*APPLICATION OF THE EQS/, aStart);
const cStart = at(/PART C: REPOSITORY OF HARMONISED/, aEnd);
const cEnd = at(/ANNEX\s+III/, cStart);
if (aStart < 0 || aEnd < 0 || cStart < 0 || cEnd < 0) throw new Error('annex part not found');
const aRows = tableRows(html.slice(aStart, aEnd));
const cRows = tableRows(html.slice(cStart, cEnd));

/** Footnotes of one annex table: a single row "( 1 ) CAS ... ( 2 ) EU number ...". */
const footnotesOf = (rows: string[][]): Map<number, string> => {
  const fnRow = rows.find((r) => r.length === 1 && r[0]!.startsWith('( 1 ) CAS'));
  if (!fnRow) throw new Error('footnote row not found');
  const out = new Map<number, string>();
  for (const m of fnRow[0]!.matchAll(/\(\s(\d+)\s\)\s(.*?)(?=\s\(\s\d+\s\)\s|$)/g)) {
    // The text after a "(*)" mark is the note to an asterisk in footnote 6, not part of the last footnote.
    out.set(Number(m[1]), m[2]!.split(/\s\(\*\)\s/)[0]!.trim());
  }
  return out;
};
const footA = footnotesOf(aRows);
const footC = footnotesOf(cRows);
// Footnotes that describe the column headings or qualify only the biota, sediment or hazard cells.
const NOT_ROW_NOTES_A = new Set([1, 2, 3, 4, 5, 6, 8, 10, 16, 18, 21]);
const NOT_ROW_NOTES_C = new Set([1, 2, 3, 4, 5, 6]);

// Dates of application: Article 3(1a)(iii) revised entries, (iv) newly identified entries.
const entryList = (s: string): number[] => {
  const range = /^(\d+) to (\d+)$/.exec(s.trim());
  if (range) {
    const [lo, hi] = [Number(range[1]), Number(range[2])];
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
  return s.split(/,\s*|\s+and\s+/).map((n) => Number(n.trim()));
};
const lastMatch = (re: RegExp, what: string): RegExpMatchArray => {
  const all = [...plain.matchAll(re)];
  const m = all[all.length - 1];
  if (!m) throw new Error(`${what} not found`);
  return m;
};
const rev = lastMatch(
  /the substances numbered ([\d, and]+) in Part A of Annex I, for which revised EQS are set, with effect from (\d+ \w+ \d{4}), with the aim of achieving good surface water chemical status in relation to those substances by (\d+ \w+ \d{4})/g,
  'Article 3(1a)(iii)',
);
const nw = lastMatch(
  /the newly identified substances numbered (\d+ to \d+) in Part A of Annex I, with effect from (\d+ \w+ \d{4}), with the aim of achieving good surface water chemical status in relation to those substances by (\d+ \w+ \d{4})/g,
  'Article 3(1a)(iv)',
);
const dated = new Map<number, string>();
for (const n of entryList(rev[1]!)) {
  dated.set(
    n,
    `revised EQS, with effect from ${rev[2]}, good surface water chemical status to be achieved by ${rev[3]} (Article 3(1a)(iii))`,
  );
}
for (const n of entryList(nw[1]!)) {
  dated.set(
    n,
    `newly identified substance, with effect from ${nw[2]}, good surface water chemical status to be achieved by ${nw[3]} (Article 3(1a)(iv))`,
  );
}
const art31b =
  /shall take effect from the beginning of the following river basin management plan period after the date the EQS was set/.exec(
    plain,
  );
if (!art31b) throw new Error('Article 3(1b) wording not found');

/** One printed number: `1,7 × 10 –4` to `0.00017`; `0,3` to `0.3`; `1,6 × 10 3` to `1600`. */
const NUM = String.raw`\d+(?:,\d+)?(?:\s*[×x]\s*10\s*[–−-]?\d+)?`;
const num = (printed: string): string => {
  const p = printed
    .replace(/\s*\(\s*\d+\s*\)\s*$/, '')
    .replace(/^≤\s*/, '')
    .replace(/^Σ\s*=\s*/, '')
    .replace(/^Sum of [^\d]*?(?=\d)/, '')
    .trim();
  const m = /^(\d+(?:,\d+)?)(?:\s*[×x]\s*10\s*([–−-]?)(\d+))?$/.exec(p);
  if (!m) throw new Error(`unparsed value ${printed}`);
  const base = m[1]!.replace(',', '.');
  if (!m[3]) return base;
  return String(Number(`${base}e${m[2] ? '-' : ''}${m[3]}`));
};
const fnRefs = (s: string): number[] => [...s.matchAll(/\(\s(\d+)\s\)/g)].map((m) => Number(m[1]));
const stripRefs = (s: string): string =>
  s
    .replace(/\s*\(\s*\d+\s*\)/g, '')
    .replace(/[\s,]+$/, '')
    .trim();
// A cell is left out only when all of it says so: "not applicable ( 24 ) 398,6 ( 25 )" still has a value.
const isNa = (s: string): boolean =>
  /^(not applicable|not derived)(\s*\(\s*\d+\s*\))?$/i.test(s) ||
  /^see footnote/i.test(s) ||
  s === '';
const normCas = (cell: string): string =>
  /^\d/.test(cell) ? cell.split(/\s*\/\s*|\s+/).join(';') : '';

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
/** Footnote-keyed qualifiers where one cell prints two values, each tagged with a footnote. */
const FN_BASIS: Record<number, string> = {
  24: 'drinking water abstraction',
  25: 'not drinking water abstraction',
};

interface Out {
  cas: string;
  name: string;
  medium: string;
  basis: string;
  value: string;
  where: string;
  note: string;
}
const out: Out[] = [];
const skipped = { cells: 0, noValueRows: [] as string[] };

/** The water values of one cell, as [basis suffix, value, lead-in note parts]. */
const cellValues = (
  cell: string,
): { suffix: string; value: string; lead: string[]; refs: number[] }[] => {
  const classes = [...cell.matchAll(/(≤\s*)?(\d+(?:,\d+)?)\s*\(Class (\d)\)/g)];
  if (classes.length > 0) {
    return classes.map((cm) => {
      const cls = Number(cm[3]);
      return {
        suffix: `, hardness class ${cls}`,
        value: num(cm[2]!),
        lead: [
          `hardness class ${cls} (${CLASS_TEXT[cls - 1]})`,
          `printed ${cm[0].replace(/\s+/g, ' ')}`,
        ],
        refs: [],
      };
    });
  }
  const salinity = [...cell.matchAll(/(\d+(?:,\d+)?)\s*\((\d+‰) salinity\)/g)];
  if (salinity.length > 0) {
    return salinity.map((sm) => ({
      suffix: `, ${sm[2]} salinity`,
      value: num(sm[1]!),
      lead: [`printed ${sm[0].replace(/\s+/g, ' ')}`],
      refs: [],
    }));
  }
  const tagged = [
    ...cell.matchAll(
      new RegExp(String.raw`(not applicable|not derived|${NUM})\s*\(\s*(\d+)\s*\)`, 'g'),
    ),
  ];
  if (tagged.length >= 2) {
    const res: { suffix: string; value: string; lead: string[]; refs: number[] }[] = [];
    for (const tm of tagged) {
      if (!/^\d/.test(tm[1]!)) continue;
      const fn = Number(tm[2]);
      const suffix = FN_BASIS[fn];
      if (!suffix) throw new Error(`unexpected tagged value ${cell}`);
      res.push({
        suffix: `, ${suffix}`,
        value: num(tm[1]!),
        lead: [`printed ${tm[0].replace(/\s+/g, ' ')}`],
        refs: [fn],
      });
    }
    return res;
  }
  const lead: string[] = [];
  if (/^Sum of/.test(cell))
    lead.push(`printed ${stripRefs(cell)}, a sum over the listed substances`);
  else if (/Σ/.test(cell))
    lead.push(`printed ${stripRefs(cell)}, a sum over the listed substances`);
  else if (/[×x]\s*10/.test(cell)) lead.push(`printed ${stripRefs(cell)}`);
  return [{ suffix: '', value: num(cell), lead, refs: fnRefs(cell) }];
};

const emit = (opts: {
  entry: string;
  name: string;
  nameRefs: number[];
  casCell: string;
  cells: string[];
  where: string;
  foot: Map<number, string>;
  skipNotes: Set<number>;
  extra: string[];
  date: string | undefined;
}): void => {
  const cas = normCas(opts.casCell);
  opts.cells.forEach((cell, i) => {
    const spec = COLS[i]!;
    if (isNa(cell)) {
      skipped.cells++;
      return;
    }
    const vals = cellValues(cell);
    if (vals.length === 0) {
      skipped.cells++;
      return;
    }
    for (const v of vals) {
      const parts = [`entry ${opts.entry}`, ...opts.extra];
      if (opts.date) parts.push(opts.date);
      parts.push(...v.lead);
      for (const n of [...new Set([...opts.nameRefs, ...v.refs])]) {
        const t = opts.foot.get(n);
        if (t && !opts.skipNotes.has(n)) parts.push(`footnote ${n}: ${t}`);
      }
      if (cas === '') parts.push(`CAS printed: ${opts.casCell}`);
      out.push({
        cas,
        name: opts.name,
        medium: spec.medium,
        basis: `${spec.basis}${v.suffix}`,
        value: v.value,
        where: opts.where,
        note: parts.join('; '),
      });
    }
  });
};

// Part A.
const moved = new Map<string, string>();
const covered: string[] = [];
let entry = '';
for (const r of aRows) {
  const isEntry = /^\(\d+[a-z]?\)$/.test(r[0] ?? '');
  if (r.length === 2 && isEntry && /has been moved to Part C of Annex II/.test(r[1]!)) {
    const name = /^The substance (.*) has been moved/.exec(r[1]!)![1]!;
    moved.set(name, r[0]!.slice(1, -1));
    continue;
  }
  if (r.length === 6 && isEntry && /^Covered by substance group/.test(r[5]!)) {
    covered.push(`${r[0]!.slice(1, -1)} ${stripRefs(r[1]!)}: ${r[5]}`);
    continue;
  }
  let nameCell: string;
  let casCell: string;
  let cells: string[];
  if (r.length === 13 && isEntry && !/^\(\d+\)$/.test(r[1]!)) {
    entry = r[0]!.slice(1, -1);
    nameCell = r[1]!;
    casCell = r[3]!;
    cells = r.slice(5, 9);
  } else if (
    r.length >= 11 &&
    r.length <= 13 &&
    !isEntry &&
    r.some((c) => /^\d+-\d\d-\d$/.test(c))
  ) {
    // PAH and DDT sub-rows: merged cells shift the columns, so the CAS cell is the anchor.
    const k = r.findIndex((c) => /^\d+-\d\d-\d$/.test(c));
    nameCell = r.slice(0, k).find((c) => c !== '') ?? '';
    casCell = r[k]!;
    cells = r.slice(k + 2, k + 6);
  } else continue;
  emit({
    entry,
    name: stripRefs(nameCell),
    nameRefs: fnRefs(nameCell),
    casCell,
    cells,
    where: 'Annex I Part A table',
    foot: footA,
    skipNotes: NOT_ROW_NOTES_A,
    extra: [],
    date: /^\d+$/.test(entry) ? dated.get(Number(entry)) : undefined,
  });
}

// Annex II Part C: the substances moved out of Part A.
for (const r of cRows) {
  if (r.length !== 10 || !/^\d+$/.test(r[0]!)) continue;
  const name = stripRefs(r[1]!);
  const was = moved.get(name);
  if (!was) throw new Error(`${name} in Part C but not marked moved in Part A`);
  emit({
    entry: `${r[0]} of Annex II Part C`,
    name,
    nameRefs: fnRefs(r[1]!),
    casCell: r[3]!,
    cells: r.slice(5, 9),
    where: 'Annex II Part C table',
    foot: footC,
    skipNotes: NOT_ROW_NOTES_C,
    extra: [
      `moved from Annex I Part A (entry ${was})`,
      'harmonised EQS for river basin specific pollutants (Annex II Part C heading)',
      `Article 3(1b) reads: ${art31b[0]}`,
    ],
    date: undefined,
  });
}
for (const name of moved.keys()) {
  if (!out.some((o) => o.name === name && o.where === 'Annex II Part C table')) {
    throw new Error(`${name} marked moved but absent from Part C`);
  }
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
  ...out.map((o) => csvLine([o.cas, o.name, o.medium, o.basis, o.value, 'μg/l', o.where, o.note])),
];
writeFileSync(dest, lines.join('\n') + '\n');
process.stderr.write(
  `wrote ${out.length} rows (${out.filter((o) => o.where.startsWith('Annex I Part A')).length} Part A, ${
    out.filter((o) => o.where.startsWith('Annex II Part C')).length
  } Part C); ${skipped.cells} water cells not applicable, not derived or blank; moved to Part C: ${[
    ...moved.values(),
  ].join(', ')}; no water row: ${covered.join(' | ')}\n`,
);
