/**
 * Shared CSV writer for the per-screen exports. RFC 4180: comma separated, CRLF row ends, UTF-8
 * without a BOM, one header row with units in the column names, numbers at full double precision,
 * and spreadsheet formula injection defused on every text cell.
 */

export interface CsvColumn {
  /** Property read from each row. */
  key: string;
  /** Column name without the unit. */
  header: string;
  /** Unit, written into the header as `header (unit)`. */
  unit?: string;
}

export type CsvCell = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvCell>;

const FORMULA_START = /^[=+\-@\t\r]/;

/** Prefix a quote so a spreadsheet reads text starting with = + - @ tab or CR as text. */
export function defuseFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** Shortest decimal string that parses back to the same double; empty for NaN and infinities. */
export function formatCsvNumber(n: number): string {
  return Number.isFinite(n) ? String(n) : '';
}

export function csvHeader(column: CsvColumn): string {
  return column.unit ? `${column.header} (${column.unit})` : column.header;
}

function escapeField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cellText(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return formatCsvNumber(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return defuseFormula(value);
}

export function exportCsv(rows: readonly CsvRow[], columns: readonly CsvColumn[]): string {
  const lines = [columns.map((c) => escapeField(defuseFormula(csvHeader(c)))).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeField(cellText(row[c.key]))).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** Trigger a browser download of CSV text. */
export function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
