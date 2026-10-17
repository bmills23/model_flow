import type { ConversionFactor, CriterionCell, TissueValue } from './types.js';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The page's "Last updated on <Month> <day>, <year>" line as an ISO date. */
export const pageDate = (html: string): string => {
  const m = /Last updated on ([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(html);
  const month = m ? MONTHS.indexOf(m[1]!) : -1;
  if (!m || month < 0) throw new Error('NRWQC page has no "Last updated on" date');
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
};

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
  ndash: '\u2013',
  mdash: '\u2014',
  micro: '\u00b5',
};

const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return String.fromCodePoint(code);
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });

/** Text of a cell: block tags become spaces, inline tags vanish, an em dash is replaced (no em dash is stored). */
export const cellText = (html: string): string =>
  decode(html.replace(/<\/?(?:br|p|div|li|ul|ol)\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\u00a0/g, ' ')
    .replace(/\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/** The tables of a page, each as rows of cell texts. Table order follows the page. */
export const readTables = (html: string): { attrs: string; rows: string[][] }[] => {
  const out: { attrs: string; rows: string[][] }[] = [];
  for (const t of html.matchAll(/<table([^>]*)>([\s\S]*?)<\/table>/gi)) {
    const rows: string[][] = [];
    for (const r of t[2]!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...r[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
        cellText(c[1]!),
      );
      rows.push(cells);
    }
    out.push({ attrs: t[1]!, rows });
  }
  return out;
};

/** Check digit of a hyphenated CAS number: the weighted sum of the other digits, mod 10. */
export const casCheckDigitValid = (cas: string): boolean => {
  const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec(cas);
  if (!m) return false;
  const digits = (m[1]! + m[2]!).split('').reverse();
  const sum = digits.reduce((s, d, i) => s + (i + 1) * Number(d), 0);
  return sum % 10 === Number(m[3]);
};

const hyphenate = (digits: string): string | undefined => {
  if (digits.length < 5 || digits.length > 10) return undefined;
  return `${digits.slice(0, -3)}-${digits.slice(-3, -1)}-${digits.slice(-1)}`;
};

/**
 * CAS numbers of a cell. The tables print them without hyphens ("7440666"), some rows list several
 * separated by semicolons, and one row runs two together. Every number returned has a valid check digit;
 * anything else throws.
 */
export const parseCas = (raw: string): string[] => {
  const text = raw.trim();
  if (text === '' || /^[-\u2013\u2014\s]+$/.test(text)) return [];
  const out: string[] = [];
  for (const token of text.split(/[;,\s]+/).filter((t) => t !== '')) {
    if (token.includes('-')) {
      if (!casCheckDigitValid(token))
        throw new Error(`CAS number ${token} has a bad format or check digit`);
      out.push(token);
      continue;
    }
    if (!/^\d+$/.test(token)) throw new Error(`CAS entry ${JSON.stringify(token)} is not digits`);
    const single = hyphenate(token);
    if (single && casCheckDigitValid(single)) {
      out.push(single);
      continue;
    }
    let split: string[] | undefined;
    for (let k = 5; k <= token.length - 5; k++) {
      const a = hyphenate(token.slice(0, k));
      const b = hyphenate(token.slice(k));
      if (a && b && casCheckDigitValid(a) && casCheckDigitValid(b)) {
        if (split)
          throw new Error(`CAS entry ${token} splits into valid numbers in more than one way`);
        split = [a, b];
      }
    }
    if (!split) throw new Error(`CAS number ${token} fails the check digit`);
    out.push(...split);
  }
  return out;
};

const NUM = String.raw`\d[\d,]*(?:\.\d+)?(?:E[+-]?\d+)?`;
const toNumber = (s: string): number => Number(s.replace(/,/g, ''));
const NONE = /^(?:[-\u2013\u2014]+)?$/;

const unitOf = (raw: string, fallback: string): string | undefined => {
  const u = raw.trim().replace(/^[\u00b5\u03bc]g\/L$/, 'ug/L');
  if (u === '') return fallback;
  if (/^ug\/L$/i.test(u)) return 'ug/L';
  if (/^mg\/kg$/i.test(u)) return 'mg/kg';
  if (/^million fibers\/L$/i.test(u)) return 'million fibers/L';
  return undefined;
};

/** A criterion cell as printed, in the column's unit unless the cell states one. */
export const parseCell = (raw: string, columnUnit = 'ug/L'): CriterionCell => {
  const text = raw.trim();
  if (NONE.test(text)) return { status: 'none' };
  if (/^vacated$/i.test(text)) return { status: 'vacated' };

  const water = new RegExp(`^(${NUM}) in water\\s+(.+)$`).exec(text);
  if (water) {
    const tissue: TissueValue[] = [];
    for (const t of water[2]!.matchAll(
      new RegExp(`(${NUM}) (mg\\/kg) (.+?)(?=\\s+${NUM} mg\\/kg|$)`, 'g'),
    )) {
      tissue.push({ value: toNumber(t[1]!), unit: t[2]!, description: t[3]!.trim() });
    }
    if (tissue.length === 0)
      throw new Error(`cannot read tissue values in ${JSON.stringify(text)}`);
    return { status: 'value', value: toNumber(water[1]!), unit: columnUnit, tissue };
  }

  const range = new RegExp(`^(${NUM})\\s*[-\\u2013]\\s*(${NUM})$`).exec(text);
  if (range) {
    return {
      status: 'value',
      value: toNumber(range[1]!),
      valueHigh: toNumber(range[2]!),
      unit: columnUnit,
    };
  }

  const single = new RegExp(`^(${NUM})\\s*(.*)$`).exec(text);
  if (single) {
    const unit = unitOf(single[2]!, columnUnit);
    if (unit) return { status: 'value', value: toNumber(single[1]!), unit };
  }
  return { status: 'text', text };
};

const PAT_BRACKET =
  /^(\d+(?:\.\d+)?)\s*-\s*\[\(\s*ln\s*hardness\s*\)\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*\]$/i;

/** A conversion factor of Appendix A or B: a number, or `a-[(ln hardness)(b)]`, or a dash. */
export const parseConversionFactor = (raw: string): ConversionFactor | null => {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (NONE.test(text)) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) return { constant: Number(text) };
  const m = PAT_BRACKET.exec(text.replace(/ln\s*hardness/i, 'ln hardness'));
  if (!m) throw new Error(`cannot read the conversion factor ${JSON.stringify(raw)}`);
  return { intercept: Number(m[1]), slope: -Number(m[2]) };
};
