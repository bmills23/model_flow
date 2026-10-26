import { useMemo, useState, type ReactNode } from 'react';
import { DownloadCsv, type CsvTable } from '../export/DownloadCsv';
import type { ProjectChemical } from '../project/chemicals';
import { addChemical } from '../project/store';
import { copiedValues, userBrowseRecords } from '../overrides/userChemicals';
import {
  browseCsvColumns,
  browseCsvRows,
  filterBrowse,
  MAX_PROJECT_CHEMICALS,
  type BrowseDb,
  type BrowseRecord,
} from './browse';
import type { UserChemicalDraft } from './UserChemicalEditor';

const PAGE = 25;

export interface DatabaseBrowserProps {
  db: BrowseDb | null;
  error: string | null;
  project: readonly ProjectChemical[];
  heading: string;
  intro?: ReactNode;
  /** An editor is open: copying a chemical is off. */
  editing: boolean;
  onCopy: (title: string, draft: UserChemicalDraft) => void;
}

/** Search by name or CAS (the exact name first), open a chemical's values, Add to the project, and download the table. */
export function DatabaseBrowser({
  db,
  error,
  project,
  heading,
  intro,
  editing,
  onCopy,
}: DatabaseBrowserProps) {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const hits = useMemo(() => (db ? filterBrowse(db, query) : []), [db, query]);
  const filtered = query.trim() !== '';
  const full = project.length >= MAX_PROJECT_CHEMICALS;
  const tables = useMemo((): CsvTable[] => {
    if (!db) return [];
    const make = (name: string, label: string, recs: readonly BrowseRecord[]): CsvTable => ({
      name,
      label,
      editions: ['rsl'],
      rows: browseCsvRows(recs),
      columns: browseCsvColumns,
    });
    const all = make('chemical-database', 'all chemicals', [
      ...db.records,
      ...userBrowseRecords(project),
    ]);
    return filtered && hits.length > 0
      ? [make('chemical-database-matching', 'matching chemicals', hits), all]
      : [all];
  }, [db, hits, filtered, project]);

  const status = error
    ? `The chemical data could not be loaded: ${error}`
    : !db
      ? 'Loading the chemical data...'
      : hits.length === 0
        ? 'No chemical matches that search.'
        : filtered
          ? `${hits.length} of ${db.records.length} chemicals match.`
          : `${db.records.length} chemicals.`;

  return (
    <section className="database-browser" aria-labelledby="database-browser-heading">
      <h2 id="database-browser-heading">{heading}</h2>
      {intro}
      <label className="field">
        <span className="field-label">Search by name or CAS number</span>
        <input
          type="search"
          autoComplete="off"
          value={query}
          disabled={!db}
          placeholder="benzene, 71-43-2"
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
        />
      </label>
      <p className="muted" role="status">
        {status}
      </p>
      {db && <DownloadCsv tables={tables} />}
      <ul className="chem-list">
        {hits.slice(0, shown).map((r) => (
          <li key={r.id}>
            <details className="chem-card">
              <summary>
                {r.name}
                {r.cas ? ` (${r.cas})` : ''}
              </summary>
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label={`${r.name}, scrollable`}
              >
                <table className="chem-table">
                  <caption className="sr-only">
                    Values for {r.name}, each with its unit and source
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Property</th>
                      <th scope="col">Value</th>
                      <th scope="col">Unit</th>
                      <th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((x) => (
                      <tr key={x.key}>
                        <th scope="row">{x.label}</th>
                        <td>{x.text}</td>
                        <td>{x.unit}</td>
                        <td>{x.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <button
              type="button"
              className="btn"
              aria-label={`Copy as a new chemical: ${r.name}`}
              disabled={editing || full}
              onClick={() =>
                onCopy(`New chemical, copied from ${r.name}`, {
                  name: `${r.name} (copy)`,
                  cas: '',
                  values: copiedValues(r, db?.edition ?? '').values,
                })
              }
            >
              Copy as a new chemical
            </button>{' '}
            {project.some((c) => c.id === r.id) ? (
              <button
                type="button"
                className="btn"
                disabled
                aria-label={`In the project: ${r.name}`}
              >
                In the project
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={full}
                aria-label={`Add to project: ${r.name}`}
                title={full ? 'The project holds 50 chemicals. Remove one first.' : undefined}
                onClick={() => addChemical({ id: r.id, name: r.name })}
              >
                Add to project
              </button>
            )}
          </li>
        ))}
      </ul>
      {hits.length > shown && (
        <p>
          <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({hits.length - shown} not shown)
          </button>
        </p>
      )}
    </section>
  );
}
