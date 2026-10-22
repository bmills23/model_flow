import { StaleMark } from '../project/StaleMark';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { CleanupOutcome } from './compute';
import { fmtSource as fmt } from './format';
import { surfaceWaterSourceLevels } from './surfaceWaterLevels';

/**
 * The dissolved groundwater source level that gives each surface water level above, for the surface
 * water run that was sent: the surface water level over the run's coefficient (peak surface water per
 * unit of the groundwater source). A level the chain cannot trace linearly is shown as not quantified
 * with its reason.
 */
export function SurfaceWaterPanel(props: {
  outcome: CleanupOutcome;
  feed: SurfaceWaterFeed;
  names: Record<string, string>;
}) {
  const { outcome, feed, names } = props;
  const rows = surfaceWaterSourceLevels(outcome, feed, names);
  if (rows.length === 0) return null;
  const reasons = [...new Set(rows.flatMap((r) => (r.reason ? [r.reason] : [])))];
  const warnings = [...new Set(rows.flatMap((r) => r.warnings))];
  return (
    <section className="panel" aria-label="Surface water source levels">
      <h2>
        Surface water source levels <small>{feed.label}</small>
      </h2>
      <p className="muted">
        <StaleMark feed="surfaceWater" chemicalId={feed.chemicalId} /> Each level is the surface
        water level above divided by the peak surface water concentration the run gives per unit of
        dissolved groundwater source, so a groundwater source at this level alone just meets the
        target. The run is the one sent from the surface water screen; use it for the chemical it
        was run for.
      </p>
      <div className="cleanup-table-wrap">
        <table className="sat cleanup-table">
          <caption className="sr-only">
            Groundwater source levels behind the surface water levels
          </caption>
          <thead>
            <tr>
              <th scope="col">Chemical</th>
              <th scope="col">Surface water method</th>
              <th scope="col">Receptor method</th>
              <th scope="col">Surface water level</th>
              <th scope="col">Groundwater source level</th>
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
                  {fmt(r.mediumLevel, r.fromSi)} {r.mediumLevel === null ? '' : r.unit}
                </td>
                <td data-label="Groundwater source level" className="level">
                  <strong>
                    {fmt(r.level, r.fromSi)} {r.level === null ? '' : r.unit}
                  </strong>
                </td>
                <td data-label="Limiting">{r.limiting ?? 'none'}</td>
                <td data-label="Cancer level">{fmt(r.cancerLevel, r.fromSi)}</td>
                <td data-label="Noncancer level">{fmt(r.noncancerLevel, r.fromSi)}</td>
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
