import { StaleMark } from '../project/StaleMark';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { CleanupOutcome } from './compute';
import { vaporSourceLevels } from './vaporLevels';

const fmt = (si: number | null, fromSi: number): string => {
  if (si === null) return 'not quantified';
  const x = si * fromSi;
  if (x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6)) {
    const [m, e] = x.toExponential(2).split('e');
    return `${Number(m)}e${Number(e)}`;
  }
  return String(Number(x.toPrecision(3)));
};

const BASIS = { linear: 'Linear coefficient', solve: 'Solved' } as const;

/**
 * The groundwater, soil gas, pore water or soil levels that give each indoor and outdoor air level above,
 * for the chemical the vapor screen was run for: the air level over the vapor run's air-over-source
 * coefficient where the air is proportional to the source, and the source whose forward air equals the
 * air level (a solve) where it is not. Each row says which.
 */
export function VaporPanel(props: {
  outcome: CleanupOutcome;
  feed: VaporRiskFeed;
  names: Record<string, string>;
}) {
  const { outcome, feed, names } = props;
  const rows = vaporSourceLevels(outcome, feed);
  if (rows.length === 0) return null;
  const warnings = [...new Set(rows.flatMap((r) => r.warnings))];
  return (
    <section className="panel" aria-label="Vapor source levels">
      <h2>
        Vapor source levels{' '}
        <small>
          {names[feed.chemicalId] ?? feed.chemicalId}, {feed.label}
        </small>
      </h2>
      <p className="muted">
        <StaleMark feed="vaporRisk" chemicalId={feed.chemicalId} /> Each level is the source that
        alone just meets the indoor or outdoor air level above. Where the vapor run showed the air
        proportional to the source, it is that air level divided by the run's air-over-source
        coefficient. Where it is not (a TPH mixture in the soil, an oxygen option that sets the
        aerobic depth from the source, a soil source past the residual-phase limit), it is solved:
        the source whose forward air equals the air level, found with the same root solve as the
        modeled cleanup, up to the solubility, saturation or residual-phase limit. A level the model
        does not reach by then is listed with that limit and no level. The last column says which
        way each level was found.
      </p>
      <div className="cleanup-table-wrap">
        <table className="sat cleanup-table">
          <caption className="sr-only">
            Source levels behind the indoor and outdoor air levels
          </caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Vapor method</th>
              <th scope="col">Receptor method</th>
              <th scope="col">Level</th>
              <th scope="col">Limiting</th>
              <th scope="col">Cancer level</th>
              <th scope="col">Noncancer level</th>
              <th scope="col">Level from</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.method}|${r.what}`}>
                <th scope="row" data-label="Source">
                  {r.what}
                </th>
                <td data-label="Vapor method">{r.vaporMethod ?? 'not recorded'}</td>
                <td data-label="Receptor method">{r.method === 'legacy' ? 'Legacy' : 'Modern'}</td>
                <td data-label="Level" className="level">
                  <strong>
                    {fmt(r.level, r.fromSi)} {r.level === null ? '' : r.unit}
                  </strong>
                  {r.reason && <div className="muted">{r.reason}</div>}
                </td>
                <td data-label="Limiting">{r.limiting ?? 'none'}</td>
                <td data-label="Cancer level">{fmt(r.cancerLevel, r.fromSi)}</td>
                <td data-label="Noncancer level">{fmt(r.noncancerLevel, r.fromSi)}</td>
                <td data-label="Level from">{r.basis === null ? 'none' : BASIS[r.basis]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
