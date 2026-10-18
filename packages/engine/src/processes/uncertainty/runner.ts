import type { UncertainInput, Warning } from '../../registry/index.js';
import { checkDistribution, type Distribution } from './distributions.js';
import {
  imanConover,
  sampleLhsMatrix,
  sampleSrsMatrix,
  seedStream,
  summarizeSample,
  type Matrix,
  type SampleSummary,
} from './samplers.js';

/**
 * Row runner for the uncertainty analysis (docs/methods/uncertainty.md). The whole sample matrix is
 * built first on one thread from seeded streams; rows are then evaluated in chunks and written back by
 * row index, so the output does not depend on the chunking (or on how a worker pool splits the rows).
 * Distributions are SI, in the units the method's inputs exchange.
 */

export type SamplingKind = 'srs' | 'lhs';

export const DEFAULT_SEED = 'model-flow';
export const DEFAULT_N: Record<SamplingKind, number> = { srs: 500, lhs: 1000 };
export const DEFAULT_CHUNK = 50;
/** Failed iterations above this fraction raise uncertainty.failed-iterations. */
export const FAILED_FRACTION_LIMIT = 0.01;

/** The part of a method descriptor the runner needs. */
export interface UncertainModel<I, O> {
  uncertainInputs?: readonly UncertainInput<I>[];
  run(input: I): O;
}

export interface CorrelationSpec {
  /** The correlated input ids, in the order of the matrix rows. */
  ids: readonly string[];
  /** Target rank correlation: symmetric, unit diagonal, positive definite. */
  matrix: Matrix;
}

export interface UncertaintySpec<I, O> {
  model: UncertainModel<I, O>;
  base: I;
  /** Input id to distribution, SI. The key order fixes the column order of the sample. */
  distributions: Readonly<Record<string, Distribution>>;
  /** Scalar output taken from a model result. */
  output: (result: O) => number;
  /** Modern method only. */
  correlation?: CorrelationSpec;
  n?: number;
  seed?: string | number;
  /** Rows per chunk; default 50. Never changes the result. */
  chunkSize?: number;
}

export type UncertaintyCode =
  | 'uncertainty.support-outside-bounds'
  | 'uncertainty.bad-distribution'
  | 'uncertainty.category-not-allowed'
  | 'uncertainty.correlation-not-positive-definite'
  | 'uncertainty.unknown-input'
  | 'uncertainty.bad-specification';

/** A refusal: the run is not attempted. */
export class UncertaintyError extends RangeError {
  readonly code: UncertaintyCode;
  constructor(code: UncertaintyCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'UncertaintyError';
    this.code = code;
  }
}

export interface IterationFailure {
  row: number;
  code: string;
  message: string;
}

export interface CorrelationReport {
  ids: string[];
  target: Matrix;
  achieved: Matrix;
}

export interface UncertaintyResult {
  kind: SamplingKind;
  n: number;
  seed: string;
  /** Sampled input ids, the columns of `samples`. */
  ids: string[];
  /** n by k sampled values (after any rank reordering). */
  samples: Matrix;
  /** Output per row; NaN for a failed iteration. */
  outputs: number[];
  succeeded: number;
  failures: {
    count: number;
    fraction: number;
    /** The first five failures by row. */
    first: IterationFailure[];
    /** Failure count by code. */
    codes: Record<string, number>;
  };
  /** Summary over the successful iterations; null when none succeeded. */
  summary: SampleSummary | null;
  /** Target and achieved Spearman matrices over the correlated inputs. */
  correlation?: CorrelationReport;
  warnings: Warning[];
}

export function resolveInputs<I, O>(
  kind: SamplingKind,
  spec: UncertaintySpec<I, O>,
): { ids: string[]; dists: Distribution[] } {
  const ids = Object.keys(spec.distributions);
  if (ids.length === 0) {
    throw new UncertaintyError('uncertainty.bad-specification', 'no input has a distribution');
  }
  const declared = new Map((spec.model.uncertainInputs ?? []).map((u) => [u.id, u]));
  const dists: Distribution[] = [];
  for (const id of ids) {
    const u = declared.get(id);
    if (!u) {
      throw new UncertaintyError(
        'uncertainty.unknown-input',
        `the method declares no input "${id}"`,
      );
    }
    if (kind === 'srs' && u.category !== 'exposure') {
      throw new UncertaintyError(
        'uncertainty.category-not-allowed',
        `"${id}" is a ${u.category} input; the legacy method samples exposure inputs only`,
      );
    }
    const d = spec.distributions[id] as Distribution;
    const issues = checkDistribution(d, u.bounds);
    if (issues[0]) throw new UncertaintyError(issues[0].code, `"${id}": ${issues[0].message}`);
    dists.push(d);
  }
  if (spec.correlation) {
    if (kind === 'srs') {
      throw new UncertaintyError(
        'uncertainty.bad-specification',
        'the legacy method samples independent inputs; use the modern method for correlation',
      );
    }
    for (const id of spec.correlation.ids) {
      if (!ids.includes(id)) {
        throw new UncertaintyError(
          'uncertainty.bad-specification',
          `correlated input "${id}" has no distribution`,
        );
      }
    }
  }
  return { ids, dists };
}

export function resolveN(kind: SamplingKind, n: number | undefined): number {
  const v = n ?? DEFAULT_N[kind];
  if (!Number.isInteger(v) || v < 1) {
    throw new UncertaintyError('uncertainty.bad-specification', 'n must be a positive integer');
  }
  return v;
}

export function resolveSeed(seed: string | number | undefined): string {
  return String(seed ?? DEFAULT_SEED);
}

/** Static warnings that need no run (used by the registered methods' validate). */
export function specWarnings<I, O>(kind: SamplingKind, spec: UncertaintySpec<I, O>): Warning[] {
  const out: Warning[] = [];
  const n = resolveN(kind, spec.n);
  const k = spec.correlation?.ids.length ?? 0;
  if (k > 0 && n < 5 * k) {
    out.push({
      code: 'uncertainty.small-sample-correlation',
      message: `Sample size ${n} is below 5 times the ${k} correlated inputs; the achieved correlation is noisy.`,
    });
  }
  return out;
}

export interface SampleMatrixResult {
  ids: string[];
  n: number;
  seed: string;
  samples: Matrix;
  correlation?: CorrelationReport;
  warnings: Warning[];
}

/** Build the whole sample matrix on one thread; checks the specification first. */
export function buildSampleMatrix<I, O>(
  kind: SamplingKind,
  spec: UncertaintySpec<I, O>,
): SampleMatrixResult {
  const { ids, dists } = resolveInputs(kind, spec);
  const n = resolveN(kind, spec.n);
  const seed = resolveSeed(spec.seed);
  const warnings: Warning[] = [];
  let samples =
    kind === 'srs'
      ? sampleSrsMatrix(dists, n, seedStream(seed, 'srs'))
      : sampleLhsMatrix(dists, n, seedStream(seed, 'lhs'));
  let correlation: CorrelationReport | undefined;
  if (spec.correlation) {
    const cols = spec.correlation.ids.map((id) => ids.indexOf(id));
    const sub = samples.map((row) => cols.map((c) => row[c] as number));
    const r = imanConover(sub, spec.correlation.matrix as Matrix, seedStream(seed, 'ic'));
    if (!r.ok)
      throw new UncertaintyError(
        r.issue.code as 'uncertainty.correlation-not-positive-definite',
        r.issue.message,
      );
    samples = samples.map((row, i) => {
      const next = [...row];
      cols.forEach((c, m) => {
        next[c] = (r.values[i] as number[])[m] as number;
      });
      return next;
    });
    for (const w of r.warnings) warnings.push({ code: w.code, message: w.message });
    correlation = {
      ids: [...spec.correlation.ids],
      target: spec.correlation.matrix.map((row) => [...row]),
      achieved: r.achieved,
    };
  }
  return { ids, n, seed, samples, ...(correlation ? { correlation } : {}), warnings };
}

function errorCode(e: unknown): string {
  if (e !== null && typeof e === 'object' && 'code' in e && typeof e.code === 'string') {
    return e.code;
  }
  return e instanceof Error ? e.name : 'Error';
}

/**
 * Evaluate sample rows: apply each sampled value through the declared setters on a copy of the base
 * input, run the model, take the scalar output. A throw or a non-finite output marks the row failed
 * (NaN output), never dropped. Pure over its arguments, so a worker can run any slice of the rows.
 */
export function evaluateRows<I, O>(
  model: UncertainModel<I, O>,
  base: I,
  ids: readonly string[],
  rows: Matrix,
  output: (result: O) => number,
): { outputs: number[]; failures: IterationFailure[] } {
  const declared = new Map((model.uncertainInputs ?? []).map((u) => [u.id, u]));
  const setters = ids.map((id) => {
    const u = declared.get(id);
    if (!u)
      throw new UncertaintyError(
        'uncertainty.unknown-input',
        `the method declares no input "${id}"`,
      );
    return u;
  });
  const outputs: number[] = [];
  const failures: IterationFailure[] = [];
  rows.forEach((row, i) => {
    try {
      let input = base;
      setters.forEach((u, j) => {
        input = u.set(input, row[j] as number);
      });
      const y = output(model.run(input));
      if (!Number.isFinite(y)) {
        failures.push({
          row: i,
          code: 'uncertainty.non-finite-output',
          message: 'the output was not a finite number',
        });
        outputs.push(Number.NaN);
      } else {
        outputs.push(y);
      }
    } catch (e) {
      failures.push({
        row: i,
        code: errorCode(e),
        message: e instanceof Error ? e.message : String(e),
      });
      outputs.push(Number.NaN);
    }
  });
  return { outputs, failures };
}

/** Run a specification end to end: sample, evaluate in chunks, account for failures, summarise. */
export function runUncertainty<I, O>(
  kind: SamplingKind,
  spec: UncertaintySpec<I, O>,
): UncertaintyResult {
  const built = buildSampleMatrix(kind, spec);
  const chunk = Math.max(1, Math.floor(spec.chunkSize ?? DEFAULT_CHUNK));
  const outputs = new Array<number>(built.n).fill(Number.NaN);
  const failed: IterationFailure[] = [];
  for (let start = 0; start < built.n; start += chunk) {
    const part = evaluateRows(
      spec.model,
      spec.base,
      built.ids,
      built.samples.slice(start, start + chunk),
      spec.output,
    );
    part.outputs.forEach((y, i) => {
      outputs[start + i] = y;
    });
    for (const f of part.failures) failed.push({ ...f, row: f.row + start });
  }
  const ok = outputs.filter((y) => !Number.isNaN(y));
  const codes: Record<string, number> = {};
  for (const f of failed) codes[f.code] = (codes[f.code] ?? 0) + 1;
  const fraction = failed.length / built.n;
  const warnings = [...built.warnings];
  if (fraction > FAILED_FRACTION_LIMIT) {
    warnings.push({
      code: 'uncertainty.failed-iterations',
      message: `${failed.length} of ${built.n} iterations (${(fraction * 100).toFixed(1)} percent) were refused by the deterministic checks; percentiles use the ${ok.length} that ran.`,
    });
  }
  return {
    kind,
    n: built.n,
    seed: built.seed,
    ids: built.ids,
    samples: built.samples,
    outputs,
    succeeded: ok.length,
    failures: { count: failed.length, fraction, first: failed.slice(0, 5), codes },
    summary: ok.length > 0 ? summarizeSample(ok) : null,
    ...(built.correlation ? { correlation: built.correlation } : {}),
    warnings,
  };
}
