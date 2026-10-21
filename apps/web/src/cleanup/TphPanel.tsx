import { StaleMark } from '../project/StaleMark';
import type { TphRiskFeed } from '../plantsEco/feeds';
import { DownloadCsv } from '../export/DownloadCsv';
import { tphCsvTables } from './csv';

const fmtMgKg = (x: number | null): string => {
  if (x === null) return 'not entered';
  if (x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6)) {
    const [m, e] = x.toExponential(2).split('e');
    return `${Number(m)}e${Number(e)}`;
  }
  return String(Number(x.toPrecision(3)));
};

/**
 * The total petroleum hydrocarbon soil level the plants, ecology and TPH screen worked out from the
 * fraction composition, shown with the chemical levels. It is a hazard index level (the fractions have no
 * cancer endpoint here), held from that screen, not recomputed by the cleanup screen.
 */
export function TphPanel(props: { feed: TphRiskFeed }) {
  const { feed } = props;
  return (
    <section className="panel" aria-label="Total TPH level">
      <h2>
        Total TPH level <small>{feed.methodId}</small>
      </h2>
      <p className="muted">
        <StaleMark feed="tph" /> Soil level of total petroleum hydrocarbons that meets a hazard
        index of {fmtMgKg(feed.targetHazardIndex)}, from the fraction composition and the fraction
        levels entered on the plants, ecology and TPH screen. Fractions with no RSL surrogate are
        left out of the total.
      </p>
      <dl className="readouts">
        <div className="readout">
          <dt>Total TPH level (mg/kg)</dt>
          <dd>
            <strong>{fmtMgKg(feed.totalMgPerKg)}</strong>
          </dd>
        </div>
      </dl>
      <div className="cleanup-table-wrap">
        <table className="sat cleanup-table">
          <caption className="sr-only">Fractions behind the total TPH level</caption>
          <thead>
            <tr>
              <th scope="col">Fraction</th>
              <th scope="col">Family</th>
              <th scope="col">Mass fraction</th>
              <th scope="col">Level for a hazard quotient of one (mg/kg)</th>
              <th scope="col">In the total</th>
            </tr>
          </thead>
          <tbody>
            {feed.fractions.map((f) => (
              <tr key={f.label}>
                <th scope="row" data-label="Fraction">
                  {f.label}
                </th>
                <td data-label="Family">{f.family}</td>
                <td data-label="Mass fraction">{fmtMgKg(f.massFraction)}</td>
                <td data-label="Level for a hazard quotient of one (mg/kg)">
                  {fmtMgKg(f.levelMgPerKg)}
                </td>
                <td data-label="In the total">{f.mapped ? 'yes' : 'no surrogate, left out'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {feed.warnings.length > 0 && (
        <ul className="warnings">
          {feed.warnings.map((w) => (
            <li key={`${w.code}:${w.message}`}>
              <code>{w.code}</code>
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}
      <DownloadCsv tables={tphCsvTables(feed)} />
    </section>
  );
}
