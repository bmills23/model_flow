import type { HouseholdRiskFeed } from '../household/feeds';
import type { CleanupOutcome } from './compute';
import { householdSourceLevels } from './householdLevels';

const fmt = (si: number | null, fromSi: number): string => {
  if (si === null) return 'not quantified';
  const x = si * fromSi;
  if (x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6)) {
    const [m, e] = x.toExponential(2).split('e');
    return `${Number(m)}e${Number(e)}`;
  }
  return String(Number(x.toPrecision(3)));
};

/**
 * The tap water, irrigation water and soil levels that give each air level above, for the chemical the
 * household screen was run for: the air level over the model's linear coefficient.
 */
export function HouseholdPanel(props: {
  outcome: CleanupOutcome;
  feed: HouseholdRiskFeed;
  names: Record<string, string>;
}) {
  const { outcome, feed, names } = props;
  const rows = householdSourceLevels(outcome, feed);
  if (rows.length === 0) return null;
  const warnings = [...new Set(rows.flatMap((r) => r.warnings))];
  return (
    <section className="panel" aria-label="Household source levels">
      <h2>
        Household source levels{' '}
        <small>
          {names[feed.chemicalId] ?? feed.chemicalId}, {feed.label}
        </small>
      </h2>
      <p className="muted">
        Each level is the shower, sprinkler or particulate air level above divided by the model
        coefficient of the household run, so a source at this level alone just meets the target.
      </p>
      <div className="cleanup-table-wrap">
        <table className="sat cleanup-table">
          <caption className="sr-only">Source levels behind the household air levels</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Method</th>
              <th scope="col">Level</th>
              <th scope="col">Limiting</th>
              <th scope="col">Cancer level</th>
              <th scope="col">Noncancer level</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.method}|${r.what}`}>
                <th scope="row" data-label="Source">
                  {r.what}
                </th>
                <td data-label="Method">{r.method === 'legacy' ? 'Legacy' : 'Modern'}</td>
                <td data-label="Level" className="level">
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
