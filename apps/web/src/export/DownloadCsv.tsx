import { downloadCsv, exportCsv, type CsvColumn, type CsvRow } from './csv';

/** One downloadable table: the rows and columns of an exportCsv call plus the file stem. */
export interface CsvTable {
  /** File name without extension, e.g. `transport-results`. */
  name: string;
  /** Short label for the control, e.g. `results`. */
  label: string;
  rows: readonly CsvRow[];
  columns: readonly CsvColumn[];
}

/** "Download CSV" controls, one button per table. Renders nothing when there are no tables. */
export function DownloadCsv(props: { tables: readonly CsvTable[]; disabled?: boolean }) {
  if (props.tables.length === 0) return null;
  return (
    <p className="csv-downloads">
      {props.tables.map((t) => (
        <button
          key={t.name}
          type="button"
          className="btn"
          disabled={props.disabled}
          onClick={() => downloadCsv(`${t.name}.csv`, exportCsv(t.rows, t.columns))}
        >
          Download CSV{props.tables.length > 1 ? `: ${t.label}` : ''}
        </button>
      ))}
    </p>
  );
}
