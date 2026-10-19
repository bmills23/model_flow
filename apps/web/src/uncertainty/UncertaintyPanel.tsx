import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_N,
  DEFAULT_SEED,
  DEFAULT_SOBOL_N,
  UncertaintyError,
  buildSampleMatrix,
  runSobol,
  runTornado,
  spearmanWithOutput,
  summarizeSample,
  type SampleSummary,
  type SamplingKind,
  type SobolResult,
  type TornadoResult,
  type UncertainInput,
  type UncertainModel,
  type UncertaintySpec,
  type Warning,
} from '@model-flow/engine';
import { Field, Seg } from '../ui/controls';
import { DistributionEditor, type UnitDisplay } from './DistributionEditor';
import type { EditorSpec } from './editor';
import {
  RunCancelledError,
  createWorkerFactory,
  runPooled,
  type Progress,
  type WorkerFactory,
} from './pool';
import { formatDuration, type Projection } from './budget';
import { pathExtractor } from './protocol';
import {
  CdfChart,
  HistogramChart,
  SobolChart,
  SpearmanChart,
  SummaryTable,
  TornadoChart,
} from './ResultsCharts';
import {
  empiricalCdf,
  fmtNum,
  histogram,
  sobolRows,
  summaryRows,
  tornadoRows,
} from './resultsData';
import './uncertainty.css';

/** What the panel needs of a method: its declared inputs and a run. */
export type PanelModel<I> = UncertainModel<I, unknown>;

export interface PanelOutput {
  id: string;
  label: string;
  unit: string;
  /** Property path from the model result to the scalar output. */
  path: readonly string[];
}

export interface UncertaintyPanelProps<I> {
  model: PanelModel<I>;
  /** Registry id the workers resolve the model by. */
  modelId: string;
  base: I;
  outputs: readonly PanelOutput[];
  displays?: Readonly<Record<string, UnitDisplay>>;
  /** Defaults to the real module worker pool. */
  makeWorker?: WorkerFactory;
  /** Pool size override (tests); default min(4, cores - 1). */
  workers?: number;
}

interface RunResult {
  output: PanelOutput;
  kind: SamplingKind;
  n: number;
  seed: string;
  succeeded: number;
  summary: SampleSummary | null;
  values: number[];
  spearman: { label: string; rho: number }[];
  tornado: TornadoResult;
  sobol: SobolResult | null;
  warnings: Warning[];
  workers: number;
  base: unknown;
}

function message(e: unknown): string {
  if (e instanceof RunCancelledError) return 'The run was cancelled.';
  return e instanceof Error ? e.message : String(e);
}

export function UncertaintyPanel<I>(props: UncertaintyPanelProps<I>) {
  const { model, base } = props;
  const inputs = useMemo(
    () => (model.uncertainInputs ?? []) as readonly UncertainInput<unknown>[],
    [model],
  );
  const [spec, setSpec] = useState<EditorSpec | null>(null);
  const [kind, setKind] = useState<SamplingKind>('srs');
  const [nText, setNText] = useState('');
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [outId, setOutId] = useState(props.outputs[0]?.id ?? '');
  const [sobol, setSobol] = useState(false);
  const [sobolN, setSobolN] = useState(String(DEFAULT_SOBOL_N));
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    p: Projection;
    answer: (ok: boolean) => void;
  } | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const abort = useRef<AbortController | null>(null);

  const onSpec = useCallback((s: EditorSpec) => setSpec(s), []);
  const sampledCount = spec ? Object.keys(spec.distributions).length : 0;
  const output = props.outputs.find((o) => o.id === outId) ?? props.outputs[0];
  const labels = useMemo(() => Object.fromEntries(inputs.map((u) => [u.id, u.label])), [inputs]);
  const nPlaceholder = String(DEFAULT_N[kind]);
  const canRun = !running && spec !== null && spec.ok && sampledCount > 0 && output !== undefined;

  const run = async (): Promise<void> => {
    if (!spec || !spec.ok || !output) return;
    setError(null);
    setResult(null);
    const n = nText.trim() === '' ? DEFAULT_N[kind] : Number(nText);
    if (!Number.isInteger(n) || n < 1) {
      setError('The number of iterations must be a positive whole number.');
      return;
    }
    const sN = sobolN.trim() === '' ? DEFAULT_SOBOL_N : Number(sobolN);
    if (sobol && (!Number.isInteger(sN) || sN < 2)) {
      setError('The Sobol sample size N must be a whole number of at least 2.');
      return;
    }
    const useSeed = seed.trim() === '' ? DEFAULT_SEED : seed;
    const full: UncertaintySpec<unknown, unknown> = {
      model: model as UncertainModel<unknown, unknown>,
      base,
      distributions: spec.distributions,
      output: pathExtractor(output.path),
      ...(kind === 'lhs' && spec.correlation ? { correlation: spec.correlation } : {}),
      n,
      seed: useSeed,
    };
    const ctl = new AbortController();
    abort.current = ctl;
    setRunning(true);
    setProgress({ done: 0, total: n });
    try {
      const matrix = buildSampleMatrix(kind, full);
      const pooled = await runPooled(
        {
          modelId: props.modelId,
          base,
          ids: matrix.ids,
          rows: matrix.samples,
          outputPath: output.path,
        },
        props.makeWorker ?? createWorkerFactory(),
        {
          onProgress: setProgress,
          signal: ctl.signal,
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
        },
      );
      const finite = pooled.outputs.filter(Number.isFinite);
      const warnings: Warning[] = [...matrix.warnings];
      if (pooled.failures.fraction > 0.01) {
        const codes = Object.entries(pooled.failures.codes)
          .map(([c, k]) => `${c}: ${k}`)
          .join(', ');
        warnings.push({
          code: 'uncertainty.failed-iterations',
          message: `${pooled.failures.count} of ${n} iterations were refused by the deterministic checks (${codes}); the summary uses the ${finite.length} that ran.`,
        });
      }
      // The one-at-a-time and Sobol runs are cheap for the exposure methods and run on this thread.
      const tornado = runTornado(full);
      let sob: SobolResult | null = null;
      if (sobol) {
        sob = runSobol({ ...full, n: sN });
        warnings.push(...sob.warnings);
      }
      const rho = spearmanWithOutput(matrix.samples, pooled.outputs);
      setResult({
        output,
        kind,
        n,
        seed: matrix.seed,
        succeeded: finite.length,
        summary: finite.length > 0 ? summarizeSample(finite) : null,
        values: finite,
        spearman: matrix.ids.map((id, j) => ({ label: labels[id] ?? id, rho: rho[j] as number })),
        tornado,
        sobol: sob,
        warnings,
        workers: pooled.workers,
        base,
      });
    } catch (e) {
      setError(e instanceof UncertaintyError ? e.message : message(e));
    } finally {
      setRunning(false);
      setProgress(null);
      setConfirm(null);
      abort.current = null;
    }
  };

  const cancel = (): void => {
    if (confirm) confirm.answer(false);
    abort.current?.abort();
  };

  const view = result;
  const baseOut = view?.tornado.baseOutput;
  return (
    <section className="panel uncertainty" aria-label="Uncertainty analysis">
      <h2>Uncertainty analysis</h2>
      <p className="muted">
        Give an input a distribution to sample it; every input left as a point value stays at the
        value above. The run repeats the calculation for each draw and shows how much the answer
        could vary and which inputs drive it.
      </p>
      <DistributionEditor
        inputs={inputs}
        {...(props.displays ? { displays: props.displays } : {})}
        onChange={onSpec}
      />
      {spec && !spec.ok && (
        <div className="alert" role="alert">
          <strong>Fix these before running:</strong>
          <ul>
            {spec.issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="u-run">
        <Seg
          legend="Sampling"
          name="u-kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'srs', label: 'Simple random (legacy)' },
            { value: 'lhs', label: 'Latin hypercube with correlation' },
          ]}
        />
        {props.outputs.length > 1 && (
          <label className="field">
            <span className="field-label">Output</span>
            <select value={outId} onChange={(e) => setOutId(e.target.value)} className="u-select">
              {props.outputs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="fields">
          <Field
            label="Iterations"
            value={nText}
            onChange={setNText}
            placeholder={nPlaceholder}
            hint={`Blank uses ${nPlaceholder}.`}
          />
          <Field
            label="Seed"
            value={seed}
            onChange={setSeed}
            hint="The same seed, count and inputs give the same numbers every time."
          />
        </div>
        {kind === 'srs' && spec?.correlation && (
          <p className="muted">
            Simple random sampling ignores the correlations entered above; switch to Latin hypercube
            to use them.
          </p>
        )}
        <label className="check">
          <input type="checkbox" checked={sobol} onChange={(e) => setSobol(e.target.checked)} />
          <span>Also compute Sobol sensitivity indices (N times (inputs + 2) extra runs)</span>
        </label>
        {sobol && (
          <div className="fields">
            <Field
              label="Sobol sample size N"
              value={sobolN}
              onChange={setSobolN}
              hint="Double it if the result is flagged not converged."
            />
          </div>
        )}
        <div className="u-actions">
          <button type="button" className="button" disabled={!canRun} onClick={() => void run()}>
            Run uncertainty analysis
          </button>
          {running && (
            <button type="button" className="button button-quiet" onClick={cancel}>
              Cancel run
            </button>
          )}
        </div>
        {progress && (
          <div className="u-progress">
            <progress max={progress.total} value={progress.done} aria-label="Run progress" />
            <span>
              {progress.done} of {progress.total} iterations
            </span>
          </div>
        )}
      </div>

      {confirm && (
        <div className="alert" role="alertdialog" aria-label="Long run">
          <p>
            <strong>This run is projected to take {formatDuration(confirm.p.projectedMs)}</strong> (
            {confirm.p.totalRows} iterations at {confirm.p.msPerRow.toFixed(1)} ms each on{' '}
            {confirm.p.workers} worker{confirm.p.workers === 1 ? '' : 's'}). Run it anyway, or
            cancel and reduce the iteration count.
          </p>
          <div className="u-actions">
            <button type="button" className="button" onClick={() => confirm.answer(true)}>
              Run anyway
            </button>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => confirm.answer(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {view && (
        <div className="u-results" aria-label="Uncertainty results">
          <h3>Results: {view.output.label}</h3>
          {view.base !== base && (
            <p className="alert" role="status">
              The scenario inputs changed after this run. Run again to update the results.
            </p>
          )}
          <p>
            {view.succeeded} of {view.n} iterations ran (
            {view.kind === 'srs' ? 'simple random' : 'Latin hypercube'} sampling, seed{' '}
            <code>{view.seed}</code>, {view.workers} worker{view.workers === 1 ? '' : 's'}). The
            deterministic base value is <strong>{fmtNum(baseOut ?? Number.NaN)}</strong>{' '}
            {view.output.unit}.
          </p>
          {view.warnings.length > 0 && (
            <ul className="warnings">
              {view.warnings.map((w) => (
                <li key={`${w.code}-${w.message}`}>
                  <code>{w.code}</code>: {w.message}
                </li>
              ))}
            </ul>
          )}
          {view.summary ? (
            <>
              <SummaryTable rows={summaryRows(view.summary)} unit={view.output.unit} />
              <CdfChart points={empiricalCdf(view.values)} base={baseOut} unit={view.output.unit} />
              <HistogramChart
                hist={histogram(view.values)}
                base={baseOut}
                unit={view.output.unit}
              />
            </>
          ) : (
            <p className="muted">No iteration ran, so there is nothing to summarise.</p>
          )}
          <h3>Which inputs matter</h3>
          <TornadoChart
            rows={tornadoRows(view.tornado, labels)}
            base={view.tornado.baseOutput}
            unit={view.output.unit}
          />
          <SpearmanChart rows={view.spearman} />
          {view.sobol && <SobolChart rows={sobolRows(view.sobol, labels)} />}
          {view.sobol && (
            <p className="muted">
              Sobol: N = {view.sobol.n}, {view.sobol.runs} runs, indices on the{' '}
              {view.sobol.scale === 'log10' ? 'log10' : 'raw'} scale of the output.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
