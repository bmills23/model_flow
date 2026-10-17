/** Minimal CSV for the committed sediment tables: quoted fields, `#` comment lines, header row. */

export const parseCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
};

export const csvField = (v: string | number | boolean | null | undefined): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const csvLine = (
  fields: readonly (string | number | boolean | null | undefined)[],
): string => fields.map(csvField).join(',');

/** Rows keyed by the header; blank lines and lines starting with `#` are skipped. */
export const parseCsv = (text: string): Record<string, string>[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.startsWith('#'));
  const header = parseCsvLine(lines[0] ?? '');
  return lines.slice(1).map((l) => {
    const cells = parseCsvLine(l);
    if (cells.length !== header.length) {
      throw new Error(`CSV row has ${cells.length} fields, header has ${header.length}: ${l}`);
    }
    return Object.fromEntries(header.map((h, i) => [h, cells[i]!]));
  });
};

/** The `#` comment lines at the top of a file, without the marker. */
export const csvComments = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .filter((l) => l.startsWith('#'))
    .map((l) => l.replace(/^#\s?/, ''));
