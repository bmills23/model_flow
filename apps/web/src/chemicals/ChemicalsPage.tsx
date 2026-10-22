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
  nextProjectUserId,
  removeProjectChemical,
  subscribeChemicals,
  updateChemical,
} from '../project/store';
import { copiedValues, isUserChemical, userBrowseRecords } from '../overrides/userChemicals';
import {
  UserChemicalEditor,
  type UserChemicalDraft,
  type UserChemicalResult,
} from './UserChemicalEditor';
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
  // the chemical being defined or edited: `id` is set when an existing user chemical is edited
  const [editing, setEditing] = useState<{
    id: string | null;
    title: string;
    draft: UserChemicalDraft;
  } | null>(null);

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
    const mineAsRecords = userBrowseRecords(project);
    const all = make('chemical-database', 'all chemicals', [...db.records, ...mineAsRecords]);
    return filtered && hits.length > 0
      ? [make('chemical-database-matching', 'matching chemicals', hits), all]
      : [all];
  }, [db, hits, filtered, project]);

  // CAS numbers already taken: the database's and the other user chemicals' (not the one being edited)
  const knownCas = [
    ...(db?.records ?? []),
    ...project.filter((c) => isUserChemical(c) && c.id !== editing?.id),
  ].map((c) => ({ cas: c.cas, name: c.name }));
  const save = (r: UserChemicalResult): void => {
    if (editing === null) return;
    const entry = {
      id: editing.id ?? nextProjectUserId(),
      name: r.name,
      ...(r.cas === undefined ? {} : { cas: r.cas }),
      values: r.values,
    };
    if (editing.id === null) addChemical(entry);
    else updateChemical(entry);
    setEditing(null);
  };

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
        {db ? `, retrieved ${db.retrieved}` : ''}. This EPA list is read only: it shows the values
        the calculations use, each with its source. Search by name or CAS number, open a chemical to
        see its values, and download them as a table.
      </p>
      <section className="panel project-chemicals" aria-labelledby="project-chemicals-heading">
        <h2 id="project-chemicals-heading">Project chemicals</h2>
        <p className="muted">
          The chemicals of this project. The exposure and risk and the cleanup levels screens take
          every one of them as a row; the fate screens pick one of them. Add a chemical from the
          list below, or with a search on those screens, or define one of your own.
        </p>
        <p>
          <button
            type="button"
            className="btn"
            disabled={!db || editing !== null}
            onClick={() =>
              setEditing({
                id: null,
                title: 'Define a new chemical',
                draft: { name: '', cas: '', values: {} },
              })
            }
          >
            Define a new chemical
          </button>
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
                {isUserChemical(c) && <span className="muted">defined by you </span>}
                {isUserChemical(c) && (
                  <button
                    type="button"
                    className="btn"
                    aria-label={`Edit ${c.name}`}
                    disabled={editing !== null}
                    onClick={() =>
                      setEditing({
                        id: c.id,
                        title: `Edit ${c.name}`,
                        draft: { name: c.name, cas: c.cas ?? '', values: { ...c.values } },
                      })
                    }
                  >
                    Edit
                  </button>
                )}{' '}
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
        {editing && (
          <UserChemicalEditor
            key={editing.id ?? 'new'}
            title={editing.title}
            draft={editing.draft}
            knownCas={knownCas}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
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
            <button
              type="button"
              className="btn"
              aria-label={`Copy as a new chemical: ${r.name}`}
              disabled={editing !== null}
              onClick={() =>
                setEditing({
                  id: null,
                  title: `New chemical, copied from ${r.name}`,
                  draft: {
                    name: `${r.name} (copy)`,
                    cas: '',
                    values: copiedValues(r, db?.edition ?? '').values,
                  },
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
