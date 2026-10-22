import { useState } from 'react';
import type { FeedRef } from '../project/staleFeeds';
import { StaleMark } from '../project/StaleMark';
import { DownloadCsv, type CsvTable } from '../export/DownloadCsv';
import { modeledCsvTablesAll } from './csv';
import type { ModeledRowBuild } from './modeledBuild';
import { requestKey, type ModeledProgress } from './useModeled';
import type { ModeledItem } from './modeledSolve';
import type { ModeledRequest } from './modeledTypes';
import { ModeledResults } from './ModeledSection';
import { ModeledSourceUncertainty } from './ModeledSourceUncertainty';

/** A chemical's last solve with the request it answers. */
export interface ModeledSolved {
  req: ModeledRequest;
  item: ModeledItem;
}

interface FeedRead {
  feed: string;
  chemicalId?: string | undefined;
}

/** The feed reads that belong to one chemical (its own slots), so another chemical's stale slot does not mark it. */
const feedsOfChemical = (feeds: readonly FeedRef[], id: string): FeedRef[] =>
  feeds.filter((f) => typeof f !== 'string' && (f as FeedRead).chemicalId === id);

/**
 * The modeled cleanup results, one block per cleanup chemical (wave P slice P3): the chemical's own
 * problem when its chain could not be built, its own solve, its own stale mark, and a progress line
 * per chemical while the worker solves them in turn. A chemical that could not be built does not stop
 * the others from being solved.
 */
export function ModeledRowsView(props: {
  rows: readonly ModeledRowBuild[];
  solved: ReadonlyMap<string, ModeledSolved>;
  computing: boolean;
  progress: ModeledProgress | null;
  solveError: string | null;
  feeds: readonly FeedRef[];
}) {
  const { rows, solved, computing, progress, solveError, feeds } = props;
  const multi = rows.length > 1;
  const anyBuilt = rows.some((r) => r.result.ok);
  // a chemical's held solve is current while it answers the request the chemical builds now; one that
  // does not is being solved again (or cannot be built) and is the only one greyed
  const isCurrent = (r: ModeledRowBuild): boolean => {
    const s = solved.get(r.id);
    return r.result.ok && s !== undefined && requestKey(s.req) === requestKey(r.result.request);
  };
  const csvEntries = rows.flatMap((r) => {
    const s = solved.get(r.id);
    return r.result.ok && s?.item.ok ? [{ id: r.id, name: r.name, outcome: s.item.outcome }] : [];
  });
  // the file holds the current chemicals' tables; the ones being solved again join it once they land.
  // With none current the buttons stay but are disabled, as before.
  const currentIds = new Set(rows.filter(isCurrent).map((r) => r.id));
  const allTables = modeledCsvTablesAll(csvEntries);
  const currentTables = allTables.filter((t) => currentIds.has(t.chemicalId));
  const tables: CsvTable[] = (currentTables.length > 0 ? currentTables : allTables).map(
    ({ chemicalId, ...t }) => ({ ...t, feeds: feedsOfChemical(feeds, chemicalId) }),
  );
  return (
    <>
      {rows.length === 0 && (
        <p className="muted">The cleanup level appears here once a chemical is added.</p>
      )}
      {computing && anyBuilt && (
        <p className="muted" role="status">
          Solving through the transport chain...
        </p>
      )}
      {computing && progress !== null && progress.total > 1 && (
        <div className="u-progress">
          <progress max={progress.total} value={progress.done} aria-label="Chemicals solved" />
          <span role="status">
            {progress.done} of {progress.total} chemicals solved
            {progress.unbuilt > 0 && ` (${progress.unbuilt} cannot be solved yet, see below)`}
          </span>
        </div>
      )}
      {solveError !== null && (
        <div className="alert" role="alert">
          The solve failed: {solveError}
        </div>
      )}
      {rows.map((row) => {
        const s = solved.get(row.id);
        const built = row.result.ok ? row.result : null;
        const stale = !isCurrent(row);
        return (
          <div key={row.id} className="modeled-chemical">
            {multi && <h2>{row.name}</h2>}
            {!row.result.ok && (
              <div className="alert" role="alert">
                <strong>
                  {multi
                    ? `Needed before the level of ${row.name} can be solved:`
                    : 'Needed before the level can be solved:'}
                </strong>
                <ul>
                  {row.result.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {s && !s.item.ok && (
              <div className="alert" role="alert">
                The solve failed{multi ? ` for ${row.name}` : ''}: {s.item.error}
              </div>
            )}
            {s?.item.ok && (
              <div className={stale ? 'stale' : undefined}>
                <StaleMark feed={feedsOfChemical(feeds, row.id)} />
                <ModeledResults
                  outcome={s.item.outcome}
                  name={row.name}
                  notes={built ? built.notes : []}
                  {...(multi ? { named: true } : {})}
                />
              </div>
            )}
          </div>
        );
      })}
      {tables.length > 0 && <DownloadCsv disabled={currentTables.length === 0} tables={tables} />}
    </>
  );
}

/**
 * The probabilistic cleanup level of a modeled source, for one solved chemical at a time: with several
 * chemicals a select picks which one the panel samples (each keeps its own result for the report).
 */
export function ModeledUncertaintyView(props: {
  rows: readonly ModeledRowBuild[];
  solved: ReadonlyMap<string, ModeledSolved>;
  pending: boolean;
  feeds: readonly FeedRef[];
}) {
  const { rows, solved, pending, feeds } = props;
  const [chosen, setChosen] = useState('');
  const ready = rows.filter((r) => r.result.ok && solved.get(r.id)?.item.ok === true);
  if (ready.length === 0) return null;
  const row = ready.find((r) => r.id === chosen) ?? ready[0]!;
  const s = solved.get(row.id)!;
  if (!s.item.ok) return null;
  return (
    <>
      {ready.length > 1 && (
        <label className="field">
          <span className="field-label">Chemical for the probabilistic cleanup level</span>
          <select className="u-select" value={row.id} onChange={(e) => setChosen(e.target.value)}>
            {ready.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <ModeledSourceUncertainty
        key={row.id}
        request={s.req}
        outcome={s.item.outcome}
        name={row.name}
        pending={pending}
        feeds={feedsOfChemical(feeds, row.id)}
      />
    </>
  );
}
