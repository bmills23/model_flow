import {
  DEFAULT_N,
  DEFAULT_SEED,
  DEFAULT_SOBOL_N,
  buildSampleMatrix,
  runSobol,
  runTornado,
  solveCleanupRows,
  sourceLevelSolve,
  spearmanWithOutput,
  summarizeCleanup,
  summarizeSample,
  type CleanupResult,
  type SampleSummary,
  type SamplingKind,
  type SobolResult,
  type TornadoResult,
  type UncertainInput,
  type UncertainModel,
  type UncertaintySpec,
  type Warning,
} from '@model-flow/engine';
import { runCleanupProbabilistic, type ProbabilisticSetup } from '../cleanup/probabilistic';
import { SMALL_TAIL_DRAWS } from '../cleanup/modeledUncertainty';
import type { ModeledSetup } from '../cleanup/modeledSetup';
import { PILOT_ROWS, assertWithinBudget, projectRun, type Projection } from './budget';
import { buildEditorSpec, type EditorSpec } from './editor';
import {
  RunCancelledError,
  createWorkerFactory,
  runPooled,
  type Progress,
  type WorkerFactory,
} from './pool';
import { pathExtractor } from './protocol';
import type { UncertaintySetup } from './project';
import type { UnitDisplay } from './DistributionEditor';

/**
 * The runs behind the uncertainty panels, with no component state, so the exposure screen, the
 * cleanup screen and the report all repeat a run the same way: from a saved setup and its seed.
 * The exposure run samples on the worker pool; nothing here touches the DOM.
 */

/** One output the exposure run can report: a property path from the model result to a scalar. */
export interface RunOutput {
  id: string;
  label: string;
  unit: string;
  path: readonly string[];
}

export interface RunHooks {
  /** Defaults to the real module worker pool. */
  makeWorker?: WorkerFactory;
  workers?: number;
  onProgress?: (p: Progress) => void;
  /** Asked when the run is projected over 60 s; return false to stop. */
  confirm?: (p: Projection) => boolean | Promise<boolean>;
  signal?: AbortSignal;
}

export type Settings<T> = { ok: true; value: T } | { ok: false; error: string };

/** Entered-unit to SI factors of the editor rows. */
export function factorsOf(
  displays: Readonly<Record<string, UnitDisplay>> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, d] of Object.entries(displays ?? {})) out[id] = d.factor;
  return out;
}

/** The distributions and correlation a saved setup describes, built as the distribution editor builds them. */
export function specFromSetup(
  inputs: readonly UncertainInput<unknown>[],
  setup: Pick<UncertaintySetup, 'rows' | 'correlation'>,
  displays?: Readonly<Record<string, UnitDisplay>>,
): EditorSpec {
  return buildEditorSpec(inputs, setup.rows, factorsOf(displays), setup.correlation);
}

export interface ExposureSettings {
  kind: SamplingKind;
  n: number;
  seed: string;
  sobol: boolean;
  sobolN: number;
}

/** Reads the iteration count, seed and Sobol size as typed; blank takes the default. */
export function exposureSettings(
  setup: Pick<UncertaintySetup, 'sampling' | 'iterations' | 'seed' | 'sobol' | 'sobolN'>,
): Settings<ExposureSettings> {
  const kind = setup.sampling;
  const n = setup.iterations.trim() === '' ? DEFAULT_N[kind] : Number(setup.iterations);
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: 'The number of iterations must be a positive whole number.' };
  }
  const sN = setup.sobolN.trim() === '' ? DEFAULT_SOBOL_N : Number(setup.sobolN);
  if (setup.sobol && (!Number.isInteger(sN) || sN < 2)) {
    return { ok: false, error: 'The Sobol sample size N must be a whole number of at least 2.' };
  }
  return {
    ok: true,
    value: {
      kind,
      n,
      seed: setup.seed.trim() === '' ? DEFAULT_SEED : setup.seed,
      sobol: setup.sobol,
      sobolN: sN,
    },
  };
}

export interface ExposureRun {
  output: RunOutput;
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
  /** Input labels by id, for the tornado and Sobol rows. */
  labels: Record<string, string>;
}

/**
 * Runs the exposure-style analysis: the sample on the worker pool (pilot timing, run budget, progress,
 * cancel), then the one-at-a-time and optional Sobol runs on this thread. Same setup and seed, same numbers.
 */
export async function runExposureAnalysis<I>(
  args: {
    model: UncertainModel<I, unknown>;
    modelId: string;
    base: I;
    output: RunOutput;
    spec: EditorSpec;
    settings: ExposureSettings;
    labels: Record<string, string>;
  },
  hooks: RunHooks = {},
): Promise<ExposureRun> {
  const { model, base, output, spec, settings, labels } = args;
  const { kind, n } = settings;
  const full: UncertaintySpec<unknown, unknown> = {
    model: model as UncertainModel<unknown, unknown>,
    base,
    distributions: spec.distributions,
    output: pathExtractor(output.path),
    ...(kind === 'lhs' && spec.correlation ? { correlation: spec.correlation } : {}),
    n,
    seed: settings.seed,
  };
  hooks.onProgress?.({ done: 0, total: n });
  const matrix = buildSampleMatrix(kind, full);
  const pooled = await runPooled(
    {
      modelId: args.modelId,
      base,
      ids: matrix.ids,
      rows: matrix.samples,
      outputPath: output.path,
    },
    hooks.makeWorker ?? createWorkerFactory(),
    {
      ...(hooks.onProgress ? { onProgress: hooks.onProgress } : {}),
      ...(hooks.signal ? { signal: hooks.signal } : {}),
      ...(hooks.workers !== undefined ? { workers: hooks.workers } : {}),
      ...(hooks.confirm ? { confirm: hooks.confirm } : {}),
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
  let sobol: SobolResult | null = null;
  if (settings.sobol) {
    sobol = runSobol({ ...full, n: settings.sobolN });
    warnings.push(...sobol.warnings);
  }
  const rho = spearmanWithOutput(matrix.samples, pooled.outputs);
  return {
    output,
    kind,
    n,
    seed: matrix.seed,
    succeeded: finite.length,
    summary: finite.length > 0 ? summarizeSample(finite) : null,
    values: finite,
    spearman: matrix.ids.map((id, j) => ({ label: labels[id] ?? id, rho: rho[j] as number })),
    tornado,
    sobol,
    warnings,
    workers: pooled.workers,
    labels,
  };
}

export interface CleanupSettings {
  n: number;
  seed: string;
  /** Protected fraction, 0 to 1. */
  protection: number;
}

/** Reads the cleanup panel's iteration count, seed and protected percentage as typed. */
export function cleanupSettings(
  setup: Pick<UncertaintySetup, 'iterations' | 'seed' | 'protection'>,
  defaultN: number = DEFAULT_N.lhs,
): Settings<CleanupSettings> {
  const n = setup.iterations.trim() === '' ? defaultN : Number(setup.iterations);
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: 'The number of iterations must be a positive whole number.' };
  }
  const percent = Number(setup.protection);
  if (!(Number.isFinite(percent) && percent > 0 && percent < 100)) {
    return {
      ok: false,
      error: 'The protected fraction must be a percentage between 0 and 100, not including either.',
    };
  }
  return {
    ok: true,
    value: {
      n,
      seed: setup.seed.trim() === '' ? DEFAULT_SEED : setup.seed,
      protection: percent / 100,
    },
  };
}

export interface CleanupHooks {
  /** Clock in milliseconds, replaceable in tests. */
  now?: () => number;
  /** Asked when the run is projected over 60 s; return false to stop. */
  confirm?: (p: Projection) => boolean | Promise<boolean>;
  /** Lets the page paint before the solve starts; default a zero-delay timeout. */
  yieldToUi?: () => Promise<void>;
}

export interface CleanupRun {
  result: CleanupResult;
  unit: string;
  fromSi: number;
  deterministic: number | null;
  spearman: { label: string; rho: number }[];
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * The probabilistic cleanup level of an already built setup: pilot rows timed against the run budget,
 * then the whole sample solved. The solve is synchronous, so the run is bounded by the budget check.
 */
export async function runCleanupAnalysis(
  setup: ProbabilisticSetup,
  spec: EditorSpec,
  settings: CleanupSettings,
  labels: Record<string, string>,
  hooks: CleanupHooks = {},
): Promise<CleanupRun> {
  const now = hooks.now ?? ((): number => performance.now());
  const yieldToUi = hooks.yieldToUi ?? tick;
  const { n, seed } = settings;
  await yieldToUi();
  const full: UncertaintySpec<unknown, unknown> = {
    model: setup.model as UncertainModel<unknown, unknown>,
    base: setup.base,
    distributions: spec.distributions,
    output: () => 0,
    ...(spec.correlation ? { correlation: spec.correlation } : {}),
    n,
    seed,
  };
  // The pilot times the first rows alone; the run budget (ruling 11) is projected from it.
  const matrix = buildSampleMatrix('lhs', full);
  const pilotRows = matrix.samples.slice(0, Math.min(PILOT_ROWS, n));
  const t0 = now();
  solveCleanupRows(setup.model, setup.base, matrix.ids, pilotRows, (i) =>
    sourceLevelSolve(setup.problem(i)),
  );
  const projection = projectRun({
    pilotMs: now() - t0,
    pilotRows: pilotRows.length,
    totalRows: n,
    workers: 1,
  });
  assertWithinBudget(projection);
  if (projection.decision === 'confirm') {
    const ok = hooks.confirm ? await hooks.confirm(projection) : false;
    if (!ok) throw new RunCancelledError();
    await yieldToUi();
  }
  const result = runCleanupProbabilistic(setup, {
    distributions: spec.distributions,
    ...(spec.correlation ? { correlation: spec.correlation } : {}),
    n,
    seed,
    protection: settings.protection,
  });
  return {
    result,
    unit: setup.unit,
    fromSi: setup.fromSi,
    deterministic: setup.deterministic,
    spearman: levelSpearman(result, labels),
  };
}

/** Spearman of each sampled input with the solved levels (censored and failed rows left out). */
function levelSpearman(
  result: CleanupResult,
  labels: Record<string, string>,
): { label: string; rho: number }[] {
  const censored = new Set(result.censoredRows);
  const rho = spearmanWithOutput(
    result.samples,
    result.iterationLevels.map((v, i) => (censored.has(i) ? Number.NaN : v)),
  );
  return result.ids.map((id, j) => ({ label: labels[id] ?? id, rho: rho[j] as number }));
}

export interface ModeledCleanupRun extends CleanupRun {
  workers: number;
}

/** Draws at or below the definition 7 quantile that gives the level protecting a fraction p. */
export function drawsBelow(n: number, protection: number): number {
  return Math.floor((n - 1) * (1 - protection)) + 1;
}

/**
 * The probabilistic cleanup level of a modeled source. The Latin hypercube sample is built here on one
 * thread; every row is a full modeled solve, so the rows go to the worker pool (5-row pilot, run
 * budget, progress, cancel) and the levels are summarised exactly as the engine's in-line run does.
 * Same setup and seed, same numbers, whatever the pool size.
 */
export async function runModeledCleanupAnalysis(
  setup: ModeledSetup,
  spec: EditorSpec,
  settings: CleanupSettings,
  labels: Record<string, string>,
  hooks: RunHooks = {},
): Promise<ModeledCleanupRun> {
  const { n, seed, protection } = settings;
  const built = buildSampleMatrix('lhs', {
    model: { uncertainInputs: setup.model.uncertainInputs, run: () => undefined },
    base: setup.request,
    distributions: spec.distributions,
    output: () => 0,
    ...(spec.correlation ? { correlation: spec.correlation } : {}),
    n,
    seed,
  } as UncertaintySpec<unknown, unknown>);
  hooks.onProgress?.({ done: 0, total: n });
  const pooled = await runPooled(
    {
      type: 'modeled-cleanup',
      request: setup.request,
      method: setup.method,
      ids: built.ids,
      rows: built.samples,
    },
    hooks.makeWorker ?? createWorkerFactory(),
    {
      ...(hooks.onProgress ? { onProgress: hooks.onProgress } : {}),
      ...(hooks.signal ? { signal: hooks.signal } : {}),
      ...(hooks.workers !== undefined ? { workers: hooks.workers } : {}),
      ...(hooks.confirm ? { confirm: hooks.confirm } : {}),
    },
  );
  // A row's output is its level, +Infinity when censored at the cap, NaN when refused.
  const outcomes = pooled.outputs.map((y, i) => {
    const censored = y === Number.POSITIVE_INFINITY;
    return {
      level: censored ? Number.NaN : y,
      censored,
      evaluations: pooled.evaluations[i] ?? 0,
      cap: undefined,
    };
  });
  const result = summarizeCleanup(built, outcomes, pooled.failures.all, {
    protection,
    ...(setup.cap !== undefined ? { cap: setup.cap } : {}),
  });
  const below = drawsBelow(n, protection);
  if (below < SMALL_TAIL_DRAWS) {
    const percent = Number((protection * 100).toFixed(4));
    result.warnings.push({
      code: 'uncertainty.small-sample-tail',
      message: `The level protecting ${percent} percent rests on ${below} of ${n} draws, fewer than ${SMALL_TAIL_DRAWS}: treat it as a rough estimate or raise the iteration count.`,
    });
  }
  return {
    result,
    unit: setup.unit,
    fromSi: setup.fromSi,
    deterministic: setup.deterministic,
    spearman: levelSpearman(result, labels),
    workers: pooled.workers,
  };
}
