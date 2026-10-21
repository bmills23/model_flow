import type { StaleFeedKey } from '../project/store';
import { DownloadCsv } from '../export/DownloadCsv';
import { cleanupUncertaintyTables } from '../uncertainty/csv';
import type { CleanupRun } from '../uncertainty/headless';
import { CdfChart, HistogramChart, SpearmanChart } from '../uncertainty/ResultsCharts';
import { empiricalCdf, fmtNum, histogram } from '../uncertainty/resultsData';

/**
 * The results of a probabilistic cleanup run, shared by the direct-source and modeled-source panels:
 * the run line, warnings, the protective level table, the CDF and histogram of the solved levels,
 * the Spearman ranking and the CSV download.
 */
export function ProbabilisticResults(props: {
  run: CleanupRun;
  label: string;
  /** The inputs changed after this run. */
  stale: boolean;
  /** Extra words for the run line, for example the pool size. */
  runNote?: string;
  /** Feeds from other screens the run's inputs were taken from; a stale one marks the CSV. */
  feeds?: readonly StaleFeedKey[];
}) {
  const { run, label, stale } = props;
  const conv = (x: number): number => x * run.fromSi;
  const solvedLevels = run.result.iterationLevels.filter(
    (v, i) => Number.isFinite(v) && !run.result.censoredRows.includes(i),
  );
  const levelsScreen = solvedLevels.map(conv);
  const detScreen = run.deterministic != null ? conv(run.deterministic) : undefined;
  return (
    <div className="u-results" aria-label="Probabilistic cleanup results">
      <h3>Results: {label}</h3>
      {stale && (
        <p className="alert" role="status">
          The scenario inputs changed after this run. Run again to update the results.
        </p>
      )}
      <p>
        {run.result.succeeded} of {run.result.n} iterations ran (Latin hypercube sampling, seed{' '}
        <code>{run.result.seed}</code>, {run.result.forwardRuns} forward runs
        {props.runNote ? `, ${props.runNote}` : ''}).{' '}
        {run.deterministic !== null ? (
          <>
            The deterministic cleanup level is{' '}
            <strong>
              {fmtNum(conv(run.deterministic))} {run.unit}
            </strong>
            .
          </>
        ) : (
          'The deterministic target is not reachable.'
        )}
      </p>
      {run.result.warnings.length > 0 && (
        <ul className="warnings">
          {run.result.warnings.map((w) => (
            <li key={`${w.code}-${w.message}`}>
              <code>{w.code}</code>: {w.message}
            </li>
          ))}
        </ul>
      )}
      <div className="table-wrap">
        <table aria-label="Protective cleanup levels">
          <caption>Level that protects a fraction of the sampled population ({run.unit})</caption>
          <thead>
            <tr>
              <th scope="col">Protected</th>
              <th scope="col">Cleanup level ({run.unit})</th>
            </tr>
          </thead>
          <tbody>
            {run.result.levels.map((l) => (
              <tr key={l.p}>
                <th scope="row">
                  {Number((l.p * 100).toFixed(4))} percent
                  {l.p === run.result.protection.p ? ' (chosen)' : ''}
                </th>
                <td>{l.level === null ? 'not reachable below the cap' : fmtNum(conv(l.level))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {levelsScreen.length > 0 ? (
        <>
          <CdfChart points={empiricalCdf(levelsScreen)} base={detScreen} unit={run.unit} />
          <HistogramChart hist={histogram(levelsScreen)} base={detScreen} unit={run.unit} />
        </>
      ) : (
        <p className="muted">No iteration reached the target, so there is nothing to chart.</p>
      )}
      <h3>Which inputs matter</h3>
      <SpearmanChart rows={run.spearman} />
      <DownloadCsv
        tables={cleanupUncertaintyTables({
          label,
          unit: run.unit,
          fromSi: run.fromSi,
          levels: run.result.levels,
          chosen: run.result.protection.p,
          iterationLevels: run.result.iterationLevels,
          censored: run.result.censoredRows,
          spearman: run.spearman,
        }).map((t) => ({ ...t, ...(props.feeds ? { feeds: props.feeds } : {}) }))}
      />
    </div>
  );
}
