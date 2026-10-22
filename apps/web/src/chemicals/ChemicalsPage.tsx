import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { DownloadCsv, type CsvTable } from '../export/DownloadCsv';
import {
  browseCsvColumns,
  browseCsvRows,
  filterBrowse,
  type BrowseDb,
  type BrowseRecord,
} from './browse';
import { loadBrowse } from './load';
import { HelpLink } from '../docs/HelpLink';
import {
  addChemical,
  getChemicals,
  removeProjectChemical,
  subscribeChemicals,
} from '../project/store';
import { RemoveChemicalConfirm } from '../project/RemoveChemicalConfirm';

const PAGE = 25;

/** Read-only browser over the EPA Regional Screening Level chemical data: every value with its source. */
export function ChemicalsPage() {
  const [db, setDb] = useState<BrowseDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const project = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let live = true;
    loadBrowse().then(
      (d) => live && setDb(d),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, []);

  const hits = useMemo(() => (db ? filterBrowse(db, query) : []), [db, query]);
  const filtered = query.trim() !== '';
  const tables = useMemo((): CsvTable[] => {
    if (!db) return [];
    const make = (name: string, label: string, recs: readonly BrowseRecord[]): CsvTable => ({
      name,
      label,
      editions: ['rsl'],
      rows: browseCsvRows(recs),
      columns: browseCsvColumns,
    });
    const all = make('chemical-database', 'all chemicals', db.records);
    return filtered && hits.length > 0
      ? [make('chemical-database-matching', 'matching chemicals', hits), all]
      : [all];
  }, [db, hits, filtered]);

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
    <section aria-labelledby="chemicals-heading" className="vadose chemicals">
      <h1 id="chemicals-heading">Chemical database</h1>
      <HelpLink target="chemicals" />
      <p className="muted">
        EPA Regional Screening Level chemical data, edition {db?.edition ?? '2024-11'}
        {db ? `, retrieved ${db.retrieved}` : ''}. This list is read only: it shows the values the
        calculations use, each with its source. Search by name or CAS number, open a chemical to see
        its values, and download them as a table.
      </p>
      <section className="panel project-chemicals" aria-labelledby="project-chemicals-heading">
        <h2 id="project-chemicals-heading">Project chemicals</h2>
        <p className="muted">
          The chemicals of this project. The exposure and risk and the cleanup levels screens take
          every one of them as a row; the fate screens pick one of them. Add a chemical from the
          list below, or with a search on those screens.
        </p>
        {project.length === 0 ? (
          <p className="muted">
            No chemicals in the project yet. Search below and choose Add to project.
          </p>
        ) : (
          <ul className="chem-list">
            {project.map((c) => (
              <li key={c.id}>
                <span>{c.name}</span> {c.name !== c.id && <span className="muted">({c.id})</span>}{' '}
                <button
                  type="button"
                  className="btn remove"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => setRemoving({ id: c.id, name: c.name })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {removing && (
          <RemoveChemicalConfirm
            id={removing.id}
            name={removing.name}
            onCancel={() => setRemoving(null)}
            onConfirm={() => {
              removeProjectChemical(removing.id);
              setRemoving(null);
            }}
          />
        )}
      </section>
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
                aria-label={`Add to project: ${r.name}`}
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
