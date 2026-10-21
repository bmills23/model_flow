import { csvFileName } from './csvFileName';
import type { CURRENT_EDITIONS } from '../report/methodsRun';
import { downloadCsv, exportCsv, type CsvColumn, type CsvRow } from './csv';
import type { StaleFeedKey } from '../project/store';
import { staleAmong, staleSentence, useStaleFeeds } from '../project/staleFeeds';
import { markStaleTable } from './staleCsv';

/** One downloadable table: the rows and columns of an exportCsv call plus the file stem. */
export interface CsvTable {
  /** File name without extension, e.g. `transport-results`. */
  name: string;
  /** Short label for the control, e.g. `results`. */
  label: string;
  /** Datasets the table's numbers read; their editions go in the file name. */
  editions?: readonly (keyof typeof CURRENT_EDITIONS)[];
  rows: readonly CsvRow[];
  columns: readonly CsvColumn[];
  /**
   * Feeds from other screens the table's numbers read. While any is stale the file gains a
   * `stale inputs` column and a `-stale-inputs` name suffix (see `markStaleTable`).
   */
  feeds?: readonly StaleFeedKey[];
}

/** "Download CSV" controls, one button per table. Renders nothing when there are no tables. */
export function DownloadCsv(props: {
  tables: readonly CsvTable[];
  disabled?: boolean;
  /** Name the table in the button even when it is the only one. */
  showLabel?: boolean;
}) {
  const staleNow = useStaleFeeds();
  if (props.tables.length === 0) return null;
  const staleOf = props.tables.map((t) => staleAmong(t.feeds ?? [], staleNow));
  const allStale = [...new Set(staleOf.flat())];
  const tables = props.tables.map((t, i) => markStaleTable(t, staleOf[i]!));
  return (
    <>
      <p className="csv-downloads">
        {tables.map((t) => (
          <button
            key={t.name}
            type="button"
            className="btn"
            disabled={props.disabled}
            onClick={() => downloadCsv(csvFileName(t), exportCsv(t.rows, t.columns))}
          >
            Download CSV{props.tables.length > 1 || props.showLabel ? `: ${t.label}` : ''}
          </button>
        ))}
      </p>
      {allStale.length > 0 && (
        <p className="muted" role="note">
          {staleSentence(allStale)}. The file keeps the values and marks them in a stale inputs
          column.
        </p>
      )}
    </>
  );
}
