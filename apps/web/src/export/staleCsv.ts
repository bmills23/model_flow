import type { StaleFeedKey } from '../project/store';
import { staleSentence } from '../project/staleFeeds';
import type { CsvTable } from './DownloadCsv';

/** The column that carries the mark, and the file name suffix, when a table reads a stale feed. */
export const STALE_COLUMN = { key: 'staleInputs', header: 'stale inputs' } as const;
export const STALE_NAME_SUFFIX = '-stale-inputs';

/**
 * The table as it should be written now. A table that reads no stale feed is returned unchanged, so a
 * current file is exactly what it always was. A stale one gains a last column `stale inputs`, the same
 * text on every row, and a `-stale-inputs` file name suffix, so the mark survives being opened in a
 * spreadsheet or renamed.
 */
export function markStaleTable(t: CsvTable, stale: readonly StaleFeedKey[]): CsvTable {
  if (stale.length === 0) return t;
  const text = staleSentence(stale).replace(/^Out of date/, 'out of date');
  return {
    ...t,
    name: `${t.name}${STALE_NAME_SUFFIX}`,
    columns: [...t.columns, STALE_COLUMN],
    rows: t.rows.map((r) => ({ ...r, [STALE_COLUMN.key]: text })),
  };
}
