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
import { AlertDialog } from '../ui/AlertDialog';
import type { ModeledChemicalEntry, ModeledReportEntry } from './modeledReport';

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

/** The level that protects each fraction of the sampled population, shared by both cleanup blocks. */
function LevelsTable(props: {
  unit: string;
  fromSi: number;
  chosen: number;
  levels: { p: number; level: number | null }[];
}) {
  return (
    <div className="table-wrap">
      <table className="result-table" aria-label="Protective cleanup levels">
        <caption>Level that protects a fraction of the sampled population ({props.unit})</caption>
        <thead>
          <tr>
            <th scope="col">Protected</th>
            <th scope="col">Cleanup level ({props.unit})</th>
          </tr>
        </thead>
        <tbody>
          {props.levels.map((l) => (
            <tr key={l.p}>
              <th scope="row">
                {Number((l.p * 100).toFixed(4))} percent
                {l.p === props.chosen ? ' (chosen)' : ''}
              </th>
              <td>
                {l.level === null ? 'not reachable below the cap' : fmtNum(l.level * props.fromSi)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      <LevelsTable
        unit={run.unit}
        fromSi={run.fromSi}
        chosen={run.result.protection.p}
        levels={run.result.levels}
      />
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

const CLEANUP_SCREEN = (
  <>
    <code>#/cleanup</code> screen
  </>
);

/**
 * The modeled-source result. The report cannot repeat this run (the groundwater chain it solves
 * through is not saved with a project), so it prints the summary the cleanup screen kept this
 * session, or says to run or re-run it there.
 */
function ModeledResults({ entry }: { entry: ModeledReportEntry }) {
  // several cleanup chemicals: one block each, named, with its own state (wave P slice P3)
  if (entry.state === 'many') {
    return (
      <>
        {entry.entries.map((e, i) => {
          // two project chemicals can share a name (a user chemical defined twice): number the
          // later ones so each block stays a uniquely named landmark
          const earlier = entry.entries.slice(0, i).filter((x) => x.chemical === e.chemical).length;
          return (
            <ModeledChemicalResults
              key={`${e.chemical}-${i}`}
              entry={e}
              landmarkSuffix={earlier > 0 ? ` (${earlier + 1})` : ''}
            />
          );
        })}
      </>
    );
  }
  return <ModeledChemicalResults entry={entry} />;
}

function ModeledChemicalResults({
  entry,
  landmarkSuffix = '',
}: {
  entry: ModeledChemicalEntry;
  landmarkSuffix?: string;
}) {
  const heading = 'Probabilistic cleanup level, modeled source';
  const baseLabel = 'Modeled source uncertainty results';
  const label = entry.chemical ? `${baseLabel}: ${entry.chemical}${landmarkSuffix}` : baseLabel;
  if (entry.state === 'none') {
    return (
      <section className="report-uncertainty" aria-label={label}>
        <h4>{entry.chemical ? `${heading}: ${entry.chemical}` : heading}</h4>
        <p>
          No run yet. Run it on the cleanup screen ({CLEANUP_SCREEN}), then return to this report;
          the result is printed here as computed there.
        </p>
      </section>
    );
  }
  const s = entry.summary;
  if (entry.state === 'stale') {
    return (
      <section className="report-uncertainty" aria-label={label}>
        <h4>
          {heading}: {s.label}
        </h4>
        <p role="status">
          The result computed on the cleanup screen is out of date: the cleanup inputs, the
          transport chain or the uncertainty setup changed after it ran, or the chain is no longer
          available. Re-run it on the cleanup screen ({CLEANUP_SCREEN}) to include it. Its numbers
          are not printed.
        </p>
      </section>
    );
  }
  return (
    <section className="report-uncertainty" aria-label={label}>
      <h4>
        {heading}: {s.label}
      </h4>
      <p>
        Computed on the cleanup screen ({CLEANUP_SCREEN}) and not repeated here. {s.succeeded} of{' '}
        {s.n} iterations ran (Latin hypercube sampling, seed <code>{s.seed}</code>, {s.forwardRuns}{' '}
        forward runs, {s.workers} worker{s.workers === 1 ? '' : 's'}).{' '}
        {s.deterministic !== null ? (
          <>
            The deterministic cleanup level is{' '}
            <strong>
              {fmtNum(s.deterministic * s.fromSi)} {s.unit}
            </strong>
            .
          </>
        ) : (
          'The deterministic target is not reachable.'
        )}
      </p>
      <Warnings items={s.warnings} />
      <LevelsTable unit={s.unit} fromSi={s.fromSi} chosen={s.chosen} levels={s.levels} />
      <h5>Which inputs matter</h5>
      <SpearmanChart rows={s.spearman} />
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
        {runs.modeled && <ModeledResults entry={runs.modeled} />}
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
        // nothing to run here; a modeled source's kept result (or the lack of one) is still printed
        setPhase({
          name: 'done',
          runs: { exposure: null, cleanup: null, modeled: plan.modeled },
          notes:
            plan.notes.length > 0 || plan.modeled
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
          once started. A modeled cleanup source is not repeated here: the result computed on the
          cleanup screen this session is printed, while its inputs and setup still match.
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
          <AlertDialog className="alert" label="Long run" onCancel={() => confirm.answer(false)}>
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
          </AlertDialog>
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
