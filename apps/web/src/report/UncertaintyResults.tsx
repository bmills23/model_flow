import { useEffect, useRef, useState } from 'react';
import { UncertaintyError } from '@model-flow/engine';
import type { Project } from '../project';
import { formatDuration, type Projection } from '../uncertainty/budget';
import type { ExposureRun } from '../uncertainty/headless';
import { RunCancelledError, type Progress, type WorkerFactory } from '../uncertainty/pool';
import {
  CdfChart,
  HistogramChart,
  SobolChart,
  SpearmanChart,
  SummaryTable,
  TornadoChart,
} from '../uncertainty/ResultsCharts';
import {
  empiricalCdf,
  fmtNum,
  histogram,
  sobolRows,
  summaryRows,
  tornadoRows,
} from '../uncertainty/resultsData';
import { TablesAlwaysOpen } from '../vadose/tablesOpen';
import {
  planUncertainty,
  runUncertaintyPlan,
  type UncertaintyPlan,
  type UncertaintyReportRuns,
} from './uncertaintyReport';
import '../uncertainty/uncertainty.css';

function Warnings({ items }: { items: { code: string; message: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="report-warnings">
      {items.map((w) => (
        <li key={`${w.code}-${w.message}`}>
          <code>{w.code}</code> {w.message}
        </li>
      ))}
    </ul>
  );
}

function ExposureResults({ run }: { run: ExposureRun }) {
  const base = run.tornado.baseOutput;
  return (
    <section className="report-uncertainty" aria-label="Exposure uncertainty results">
      <h4>Exposure and risk: {run.output.label}</h4>
      <p>
        {run.succeeded} of {run.n} iterations ran (
        {run.kind === 'srs' ? 'simple random' : 'Latin hypercube'} sampling, seed{' '}
        <code>{run.seed}</code>). The deterministic base value is <strong>{fmtNum(base)}</strong>{' '}
        {run.output.unit}.
      </p>
      <Warnings items={run.warnings} />
      {run.summary ? (
        <>
          <SummaryTable rows={summaryRows(run.summary)} unit={run.output.unit} />
          <CdfChart points={empiricalCdf(run.values)} base={base} unit={run.output.unit} />
          <HistogramChart hist={histogram(run.values)} base={base} unit={run.output.unit} />
        </>
      ) : (
        <p className="muted">No iteration ran, so there is nothing to summarise.</p>
      )}
      <h5>Which inputs matter</h5>
      <TornadoChart
        rows={tornadoRows(run.tornado, run.labels)}
        base={base}
        unit={run.output.unit}
      />
      <SpearmanChart rows={run.spearman} />
      {run.sobol && (
        <>
          <SobolChart rows={sobolRows(run.sobol, run.labels)} />
          <p className="muted">
            Sobol: N = {run.sobol.n}, {run.sobol.runs} runs, indices on the{' '}
            {run.sobol.scale === 'log10' ? 'log10' : 'raw'} scale of the output.
          </p>
        </>
      )}
    </section>
  );
}

function CleanupResults({ run }: { run: NonNullable<UncertaintyReportRuns['cleanup']> }) {
  const conv = (x: number): number => x * run.fromSi;
  const censored = new Set(run.result.censoredRows);
  const solved = run.result.iterationLevels
    .filter((v, i) => Number.isFinite(v) && !censored.has(i))
    .map(conv);
  const det = run.deterministic != null ? conv(run.deterministic) : undefined;
  return (
    <section className="report-uncertainty" aria-label="Probabilistic cleanup results">
      <h4>Probabilistic cleanup level: {run.label}</h4>
      <p>
        {run.result.succeeded} of {run.result.n} iterations ran (Latin hypercube sampling, seed{' '}
        <code>{run.result.seed}</code>, {run.result.forwardRuns} forward runs).{' '}
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
      <Warnings items={run.result.warnings} />
      <div className="table-wrap">
        <table className="result-table" aria-label="Protective cleanup levels">
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
      {solved.length > 0 ? (
        <>
          <CdfChart points={empiricalCdf(solved)} base={det} unit={run.unit} />
          <HistogramChart hist={histogram(solved)} base={det} unit={run.unit} />
        </>
      ) : (
        <p className="muted">No iteration reached the target, so there is nothing to chart.</p>
      )}
      <h5>Which inputs matter</h5>
      <SpearmanChart rows={run.spearman} />
    </section>
  );
}

/** The uncertainty results of a report, drawn with the screens' own tables and charts. */
export function UncertaintyReportView({ runs }: { runs: UncertaintyReportRuns }) {
  return (
    <TablesAlwaysOpen.Provider value={true}>
      <div className="report-uncertainty-results">
        {runs.exposure && <ExposureResults run={runs.exposure} />}
        {runs.cleanup && <CleanupResults run={runs.cleanup} />}
      </div>
    </TablesAlwaysOpen.Provider>
  );
}

type Phase =
  | { name: 'idle' }
  | { name: 'planning' }
  | { name: 'running'; progress: Progress | null }
  | { name: 'done'; runs: UncertaintyReportRuns; notes: string[] }
  | { name: 'error'; message: string };

/**
 * The "include uncertainty results" control. It is off until the reader asks, because a run can take
 * up to the run budget; once on, it repeats each panel's run from the saved setup and seed, with
 * progress and a cancel, the exposure sample on the worker pool.
 */
export function ReportUncertainty(props: {
  project: Project;
  /** Replaces the real worker pool in tests. */
  makeWorker?: WorkerFactory;
  workers?: number;
}) {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [confirm, setConfirm] = useState<{ p: Projection; answer: (ok: boolean) => void } | null>(
    null,
  );
  const abort = useRef<AbortController | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      abort.current?.abort();
    };
  }, []);

  const start = async (): Promise<void> => {
    const ctl = new AbortController();
    abort.current = ctl;
    setPhase({ name: 'planning' });
    try {
      const plan: UncertaintyPlan = await planUncertainty(props.project);
      if (!live.current) return;
      if (!plan.exposure && !plan.cleanup) {
        setPhase({
          name: 'done',
          runs: { exposure: null, cleanup: null },
          notes:
            plan.notes.length > 0
              ? plan.notes
              : [
                  'No panel has an input with a distribution in the saved setup, so there is nothing to run.',
                ],
        });
        return;
      }
      setPhase({ name: 'running', progress: null });
      const runs = await runUncertaintyPlan(plan, {
        signal: ctl.signal,
        onProgress: (p) => live.current && setPhase({ name: 'running', progress: p }),
        ...(props.makeWorker ? { makeWorker: props.makeWorker } : {}),
        ...(props.workers !== undefined ? { workers: props.workers } : {}),
        confirm: (p) =>
          new Promise<boolean>((resolve) => {
            setConfirm({
              p,
              answer: (ok) => {
                setConfirm(null);
                resolve(ok);
              },
            });
          }),
      });
      if (live.current) setPhase({ name: 'done', runs, notes: plan.notes });
    } catch (e) {
      if (!live.current) return;
      setPhase({
        name: 'error',
        message:
          e instanceof RunCancelledError
            ? 'The run was cancelled.'
            : e instanceof UncertaintyError || e instanceof Error
              ? e.message
              : String(e),
      });
    } finally {
      setConfirm(null);
      abort.current = null;
    }
  };

  const cancel = (): void => {
    confirm?.answer(false);
    abort.current?.abort();
  };

  const busy = phase.name === 'planning' || phase.name === 'running';
  return (
    <div className="report-uncertainty-block">
      <div className="report-noprint">
        <label className="check">
          <input
            type="checkbox"
            checked={phase.name !== 'idle' && phase.name !== 'error'}
            disabled={busy}
            onChange={(e) => {
              if (e.target.checked) void start();
              else setPhase({ name: 'idle' });
            }}
          />
          <span>Include uncertainty results</span>
        </label>
        <p className="muted">
          Repeats each analysis from the setup above and its seed, which gives the same numbers as
          the screens. It can take a while for a large iteration count. The exposure sample runs in
          the background and can be cancelled; the one-at-a-time, Sobol and cleanup solves run in
          the page itself, so it may stop responding until they finish and they cannot be cancelled
          once started.
        </p>
        {busy && (
          <div className="u-progress" role="status">
            {phase.name === 'running' && phase.progress ? (
              <>
                <progress
                  max={phase.progress.total}
                  value={phase.progress.done}
                  aria-label="Uncertainty run progress"
                />
                <span>
                  {phase.progress.done} of {phase.progress.total} iterations
                </span>
              </>
            ) : (
              <span>Preparing the run...</span>
            )}
            <button type="button" className="btn" onClick={cancel}>
              Cancel run
            </button>
          </div>
        )}
        {confirm && (
          <div className="alert" role="alertdialog" aria-label="Long run">
            <p>
              <strong>This run is projected to take {formatDuration(confirm.p.projectedMs)}</strong>{' '}
              ({confirm.p.totalRows} iterations at {confirm.p.msPerRow.toFixed(1)} ms each). Run it
              anyway, or cancel and reduce the iteration count on the screen.
            </p>
            <button type="button" className="btn" onClick={() => confirm.answer(true)}>
              Run anyway
            </button>{' '}
            <button type="button" className="btn" onClick={() => confirm.answer(false)}>
              Cancel
            </button>
          </div>
        )}
        {phase.name === 'error' && (
          <div className="alert" role="alert">
            {phase.message}
          </div>
        )}
      </div>
      {phase.name === 'done' && (
        <>
          {phase.notes.length > 0 && (
            <ul className="report-notes">
              {phase.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <UncertaintyReportView runs={phase.runs} />
        </>
      )}
    </div>
  );
}
