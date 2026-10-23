import { StaleMark } from '../project/StaleMark';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { CleanupOutcome } from './compute';
import { fmtSource as fmt } from './format';
import type { SurfaceSolves } from './surfaceSolve';
import { SOURCE_UNITS } from './surfaceSolved';
import { surfaceWaterSourceLevels } from './surfaceWaterLevels';
import type { SurfaceTargetLevel } from './surfaceWaterTarget';

interface Progress {
  done: number;
  total: number;
}

/** What the solving state of a panel says: the run in the worker, or the worker's failure. */
function SolveNote(props: { pending: boolean; progress: Progress | null; error: string | null }) {
  const { pending, progress, error } = props;
  if (error !== null) {
    return (
      <p className="alert" role="alert">
        The source levels could not be solved: {error}
      </p>
    );
  }
  if (!pending) return null;
  return (
    <p className="muted" role="status">
      Solving the source levels against the surface water model in the background
      {progress !== null && progress.total > 1
        ? ` (${progress.done} of ${progress.total} done)`
        : ''}
      . A linked run takes a few seconds to a minute.
    </p>
  );
}

const pathText = (path: 'linear' | 'solved' | null, solver: string | null): string =>
  path === null ? '' : path === 'linear' ? 'Linear' : `Solved${solver ? ` (${solver})` : ''}`;

/**
 * The source level that meets each chemical's surface water target (an NRWQC criterion or the user's
 * value) for the chemical's own surface water run. A run that is linear in its dissolved groundwater
 * source gives the target over the run's coefficient; one that is not (an upstream background, a plume
 * fed by a vadose or saturated source screen) and a soil source of the cleanup are solved against the
 * forward model. The target is shown in ug/L; the source level in mg/L (groundwater) or mg/kg (soil).
 */
export function SurfaceWaterTargetPanel(props: {
  rows: readonly SurfaceTargetLevel[];
  progress?: Progress | null;
  solveError?: string | null;
}) {
  const { rows } = props;
  if (rows.length === 0) return null;
  const reasons = [...new Set(rows.flatMap((r) => (r.reason ? [r.reason] : [])))];
  const warnings = [...new Set(rows.flatMap((r) => r.warnings))];
  return (
    <section className="panel" aria-label="Surface water target source levels">
      <h2>Surface water target source levels</h2>
      <p className="muted">
        {rows.map((r) => (
          <StaleMark key={r.chemicalId} feed="surfaceWater" chemicalId={r.feedChemicalId} />
        ))}{' '}
        Each level is the source concentration whose surface water run just meets the target. Where
        the chemical&apos;s surface water run is linear in a dissolved groundwater source the level
        is the target divided by the peak surface water concentration the run gives per unit of
        source. Where it is not (an upstream background, or a plume fed by a vadose or saturated
        source screen) and for a soil source of this cleanup, the level is solved by running the
        surface water model forward until the peak meets the target. A source that cannot reach the
        target up to its limit is shown as not reached, with the limit.
      </p>
      <SolveNote
        pending={rows.some((r) => r.pending)}
        progress={props.progress ?? null}
        error={props.solveError ?? null}
      />
      <div className="cleanup-table-wrap">
        <table className="sat cleanup-table" aria-busy={rows.some((r) => r.pending)}>
          <caption className="sr-only">Source levels behind the surface water targets</caption>
          <thead>
            <tr>
              <th scope="col">Chemical</th>
              <th scope="col">Target</th>
              <th scope="col">Basis</th>
              <th scope="col">Citation and note</th>
              <th scope="col">Surface water method</th>
              <th scope="col">Source</th>
              <th scope="col">Source level</th>
              <th scope="col">Level path</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.chemicalId}>
                <th scope="row" data-label="Chemical">
                  {r.chemical}
                </th>
                <td data-label="Target">
                  {fmt(r.target, r.targetFromSi)} {r.target === null ? '' : r.targetUnit}
                </td>
                <td data-label="Basis">{r.basis}</td>
                <td data-label="Citation and note">
                  {r.citationKey !== null && r.citation}
                  {r.note !== '' && <>Note: {r.note}</>}
                </td>
                <td data-label="Surface water method">{r.surfaceMethod ?? 'not recorded'}</td>
                <td data-label="Source">{SOURCE_UNITS[r.sourceMedium].label}</td>
                <td data-label="Source level" className="level">
                  <strong>
                    {r.pending ? 'solving...' : fmt(r.level, r.fromSi)}{' '}
                    {r.level === null ? '' : r.unit}
                  </strong>
                </td>
                <td data-label="Level path">{pathText(r.path, r.solver)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reasons.length > 0 && (
        <ul className="warnings">
          {reasons.map((w) => (
            <li key={w}>Not quantified: {w}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The source level that gives each surface water level above, for the surface water run that was sent.
 * Where the run is linear in its dissolved groundwater source the level is the surface water level over the
 * run's coefficient (peak surface water per unit of the source). Where it is not (an upstream background,
 * a plume fed by a vadose or saturated source screen) the level is solved by running the surface water
 * model forward until its peak meets the surface water level: the groundwater concentration of a
 * dissolved source, or the soil concentration of the screen feeding the plume. A level the source cannot
 * reach up to its limit is shown as not reached, with the limit; one that moves nothing to the surface
 * water stays not quantified, with its reason.
 */
export function SurfaceWaterPanel(props: {
  outcome: CleanupOutcome;
  feed: SurfaceWaterFeed;
  names: Record<string, string>;
  solves?: SurfaceSolves;
  csat?: Record<string, number>;
  progress?: Progress | null;
  solveError?: string | null;
}) {
  const { outcome, feed, names } = props;
  const rows = surfaceWaterSourceLevels(outcome, feed, names, props.solves, props.csat);
  if (rows.length === 0) return null;
  const reasons = [...new Set(rows.flatMap((r) => (r.reason ? [r.reason] : [])))];
  const warnings = [...new Set(rows.flatMap((r) => r.warnings))];
  return (
    <section className="panel" aria-label="Surface water source levels">
      <h2>
        Surface water source levels <small>{feed.label}</small>
      </h2>
      <p className="muted">
        <StaleMark feed="surfaceWater" chemicalId={feed.chemicalId} /> Each level is the source
        concentration whose surface water run just meets the surface water level above. A run that
        is linear in its dissolved groundwater source gives the level as the surface water level
        divided by the peak surface water concentration per unit of source. A run with an upstream
        background, or a plume fed by a vadose or saturated source screen, is solved by running the
        model forward until the peak meets the level (the fed plume gives the soil concentration of
        that screen). The run is the one sent from the surface water screen; use it for the chemical
        it was run for.
      </p>
      <SolveNote
        pending={rows.some((r) => r.pending)}
        progress={props.progress ?? null}
        error={props.solveError ?? null}
      />
      <div className="cleanup-table-wrap">
        <table className="sat cleanup-table" aria-busy={rows.some((r) => r.pending)}>
          <caption className="sr-only">Source levels behind the surface water levels</caption>
          <thead>
            <tr>
              <th scope="col">Chemical</th>
              <th scope="col">Surface water method</th>
              <th scope="col">Receptor method</th>
              <th scope="col">Surface water level</th>
              <th scope="col">Source</th>
              <th scope="col">Source level</th>
              <th scope="col">Level path</th>
              <th scope="col">Limiting</th>
              <th scope="col">Cancer level</th>
              <th scope="col">Noncancer level</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.method}|${r.chemical}`}>
                <th scope="row" data-label="Chemical">
                  {names[r.chemical] ?? r.chemical}
                </th>
                <td data-label="Surface water method">{r.surfaceMethod ?? 'not recorded'}</td>
                <td data-label="Receptor method">{r.method === 'legacy' ? 'Legacy' : 'Modern'}</td>
                <td data-label="Surface water level">
                  {fmt(r.mediumLevel, 1e3)} {r.mediumLevel === null ? '' : 'mg/L'}
                </td>
                <td data-label="Source">{SOURCE_UNITS[r.sourceMedium].label}</td>
                <td data-label="Source level" className="level">
                  <strong>
                    {r.pending ? 'solving...' : fmt(r.level, r.fromSi)}{' '}
                    {r.level === null ? '' : r.unit}
                  </strong>
                </td>
                <td data-label="Level path">{pathText(r.path, r.solver)}</td>
                <td data-label="Limiting">{r.limiting ?? 'none'}</td>
                <td data-label="Cancer level">{r.pending ? '' : fmt(r.cancerLevel, r.fromSi)}</td>
                <td data-label="Noncancer level">
                  {r.pending ? '' : fmt(r.noncancerLevel, r.fromSi)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reasons.length > 0 && (
        <ul className="warnings">
          {reasons.map((w) => (
            <li key={w}>Not quantified: {w}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
