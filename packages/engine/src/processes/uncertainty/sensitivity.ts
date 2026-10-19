import type { Warning } from '../../registry/index.js';
import { distributionQuantile, type Distribution } from './distributions.js';
import {
  evaluateRows,
  resolveInputs,
  resolveN,
  resolveSeed,
  type UncertaintySpec,
} from './runner.js';
import {
  percentile,
  sampleLhsMatrix,
  seedStream,
  spearmanMatrix,
  type Matrix,
} from './samplers.js';

/**
 * Sensitivity analysis (docs/methods/uncertainty.md): Sobol first order and total indices from the
 * Saltelli 2010 design with the Saltelli first order and Jansen total effect estimators, seeded
 * bootstrap intervals, the one at a time tornado and the Spearman rank correlation of each input with
 * the output. Pure over the specification; all randomness comes from purpose-labelled seeded streams.
 */

export const DEFAULT_SOBOL_N = 512;
export const DEFAULT_BOOTSTRAP = 500;
/** An index whose 95 percent interval half-width exceeds this is flagged not converged. */
export const SOBOL_HALF_WIDTH_LIMIT = 0.05;

export type SobolScale = 'log10' | 'raw';

export interface SobolSpec<I, O> extends UncertaintySpec<I, O> {
  /** Scale of the output the indices describe; default log10, falling back to raw on a nonpositive output. */
  scale?: SobolScale;
  /** Bootstrap resamples; default 500. */
  bootstrap?: number;
}

export interface SobolResult {
  /** N, the rows of each base matrix. */
  n: number;
  seed: string;
  ids: string[];
  scale: SobolScale;
  /** Model runs made: N (k + 2). */
  runs: number;
  /** Rows used (all designs finite) and rows dropped because any run failed. */
  used: number;
  failedRows: number;
  /** Variance of the 2N pooled outputs of f(A) and f(B) on the chosen scale. */
  variance: number;
  /** First order index as estimated (may be slightly negative). */
  firstRaw: number[];
  /** First order index shown: negative estimates inside their interval of zero are shown as zero. */
  first: number[];
  total: number[];
  firstInterval: [number, number][];
  totalInterval: [number, number][];
  firstHalfWidth: number[];
  totalHalfWidth: number[];
  warnings: Warning[];
}

function variance(values: readonly number[]): number {
  const n = values.length;
  const m = values.reduce((s, v) => s + v, 0) / n;
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1);
}

/**
 * Saltelli first order and Jansen total estimators over row subsets (indices into the arrays). The first
 * order sum uses f(B) centred on the pooled mean of f(A) and f(B) over the same rows: the expectation is
 * unchanged (E(f(A_B) - f(A)) = 0), but without centring the estimate's noise grows with the output mean,
 * so a log10 risk near -6 would swamp the indices. The Jansen total is already shift invariant.
 */
function estimate(
  fA: readonly number[],
  fB: readonly number[],
  fAB: readonly (readonly number[])[],
  rows: readonly number[],
): { first: number[]; total: number[] } {
  const n = rows.length;
  const pooled: number[] = [];
  for (const i of rows) pooled.push(fA[i] as number, fB[i] as number);
  const v = variance(pooled);
  const mean = pooled.reduce((t, y) => t + y, 0) / pooled.length;
  const first: number[] = [];
  const total: number[] = [];
  for (const col of fAB) {
    let s1 = 0;
    let s2 = 0;
    for (const i of rows) {
      const ab = col[i] as number;
      s1 += ((fB[i] as number) - mean) * (ab - (fA[i] as number));
      s2 += ((fA[i] as number) - ab) ** 2;
    }
    first.push(s1 / n / v);
    total.push(s2 / (2 * n) / v);
  }
  return { first, total };
}

export function runSobol<I, O>(spec: SobolSpec<I, O>): SobolResult {
  const { ids, dists } = resolveInputs('lhs', spec);
  const n = resolveN('lhs', spec.n ?? DEFAULT_SOBOL_N);
  if (n < 2) {
    throw new RangeError('uncertainty.bad-specification: Sobol needs N of at least 2');
  }
  const seed = resolveSeed(spec.seed);
  const k = ids.length;
  const warnings: Warning[] = [];
  if (spec.correlation) {
    warnings.push({
      code: 'uncertainty.sobol-correlated-inputs',
      message:
        'Sobol indices assume independent inputs; the correlation matrix was removed for this analysis.',
    });
  }
  const mA = sampleLhsMatrix(dists, n, seedStream(seed, 'sobol-A'));
  const mB = sampleLhsMatrix(dists, n, seedStream(seed, 'sobol-B'));
  const evalRows = (m: Matrix) => evaluateRows(spec.model, spec.base, ids, m, spec.output).outputs;
  const fA = evalRows(mA);
  const fB = evalRows(mB);
  const fAB: number[][] = [];
  for (let j = 0; j < k; j++) {
    const mAB = mA.map((row, i) => {
      const r = [...row];
      r[j] = (mB[i] as number[])[j] as number;
      return r;
    });
    fAB.push(evalRows(mAB));
  }
  const good: number[] = [];
  for (let i = 0; i < n; i++) {
    if (
      Number.isFinite(fA[i]) &&
      Number.isFinite(fB[i]) &&
      fAB.every((c) => Number.isFinite(c[i]))
    ) {
      good.push(i);
    }
  }
  if (good.length < 2) {
    throw new RangeError(
      'uncertainty.bad-specification: fewer than two rows ran in every Sobol design',
    );
  }
  const failedRows = n - good.length;
  if (failedRows / n > 0.01) {
    warnings.push({
      code: 'uncertainty.failed-iterations',
      message: `${failedRows} of ${n} Sobol rows had a refused run in at least one design and were dropped together.`,
    });
  }
  let scale: SobolScale = spec.scale ?? 'log10';
  if (scale === 'log10') {
    const nonpositive = good.some(
      (i) =>
        (fA[i] as number) <= 0 || (fB[i] as number) <= 0 || fAB.some((c) => (c[i] as number) <= 0),
    );
    if (nonpositive) {
      scale = 'raw';
      warnings.push({
        code: 'uncertainty.sobol-log-nonpositive',
        message:
          'An output was at or below zero, so the indices use the raw scale instead of log10.',
      });
    }
  }
  const tf = (v: number) => (scale === 'log10' ? Math.log10(v) : v);
  const tA = fA.map(tf);
  const tB = fB.map(tf);
  const tAB = fAB.map((c) => c.map(tf));
  const est = estimate(tA, tB, tAB, good);
  const pooled: number[] = [];
  for (const i of good) pooled.push(tA[i] as number, tB[i] as number);
  const v = variance(pooled);

  const nBoot = Math.max(0, Math.floor(spec.bootstrap ?? DEFAULT_BOOTSTRAP));
  const rng = seedStream(seed, 'bootstrap');
  const bootFirst: number[][] = Array.from({ length: k }, () => []);
  const bootTotal: number[][] = Array.from({ length: k }, () => []);
  for (let b = 0; b < nBoot; b++) {
    const rows: number[] = [];
    for (let m = 0; m < good.length; m++) {
      rows.push(good[Math.floor(rng.nextFloat() * good.length)] as number);
    }
    const e = estimate(tA, tB, tAB, rows);
    for (let j = 0; j < k; j++) {
      (bootFirst[j] as number[]).push(e.first[j] as number);
      (bootTotal[j] as number[]).push(e.total[j] as number);
    }
  }
  const interval = (xs: number[], point: number): [number, number] =>
    xs.length > 1 ? [percentile(xs, 0.025), percentile(xs, 0.975)] : [point, point];
  const firstInterval = bootFirst.map((xs, j) => interval(xs, est.first[j] as number));
  const totalInterval = bootTotal.map((xs, j) => interval(xs, est.total[j] as number));
  const half = (iv: [number, number][]) => iv.map(([lo, hi]) => (hi - lo) / 2);
  const firstHalfWidth = half(firstInterval);
  const totalHalfWidth = half(totalInterval);
  const first = est.first.map((s, j) =>
    s < 0 && (firstInterval[j] as [number, number])[1] >= 0 ? 0 : s,
  );
  if (nBoot > 0) {
    const bad = ids.filter(
      (_, j) =>
        (firstHalfWidth[j] as number) > SOBOL_HALF_WIDTH_LIMIT ||
        (totalHalfWidth[j] as number) > SOBOL_HALF_WIDTH_LIMIT,
    );
    if (bad.length > 0) {
      warnings.push({
        code: 'uncertainty.sobol-not-converged',
        message: `The 95 percent interval half-width exceeds ${SOBOL_HALF_WIDTH_LIMIT} for ${bad.join(', ')}; double N.`,
      });
    }
  }
  return {
    n,
    seed,
    ids,
    scale,
    runs: n * (k + 2),
    used: good.length,
    failedRows,
    variance: v,
    firstRaw: est.first,
    first,
    total: est.total,
    firstInterval,
    totalInterval,
    firstHalfWidth,
    totalHalfWidth,
    warnings,
  };
}

export interface TornadoEntry {
  id: string;
  /** The input set to its 5th and 95th percentiles, and the output at each. */
  lowInput: number;
  highInput: number;
  low: number;
  high: number;
  /** |high - low|; NaN when either run failed (such entries sort last). */
  swing: number;
}

export interface TornadoResult {
  baseOutput: number;
  entries: TornadoEntry[];
  /** Model runs made: 2k + 1. */
  runs: number;
}

/** One at a time swings around the base input: input j at its 5th then 95th percentile, others at base. */
export function runTornado<I, O>(spec: UncertaintySpec<I, O>): TornadoResult {
  const { ids, dists } = resolveInputs('lhs', spec);
  const one = (id: string, value: number): number => {
    const r = evaluateRows(spec.model, spec.base, [id], [[value]], spec.output);
    return r.outputs[0] as number;
  };
  const baseOutput = evaluateRows(spec.model, spec.base, [], [[]], spec.output)
    .outputs[0] as number;
  const entries: TornadoEntry[] = ids.map((id, j) => {
    const d = dists[j] as Distribution;
    const lowInput = distributionQuantile(d, 0.05);
    const highInput = distributionQuantile(d, 0.95);
    const low = one(id, lowInput);
    const high = one(id, highInput);
    return { id, lowInput, highInput, low, high, swing: Math.abs(high - low) };
  });
  entries.sort((a, b) => {
    const sa = Number.isNaN(a.swing) ? -1 : a.swing;
    const sb = Number.isNaN(b.swing) ? -1 : b.swing;
    return sb - sa;
  });
  return { baseOutput, entries, runs: 2 * ids.length + 1 };
}

/** Spearman rank correlation of each sample column with the output over the rows whose output is finite. */
export function spearmanWithOutput(samples: Matrix, outputs: readonly number[]): number[] {
  const rows: number[] = [];
  outputs.forEach((y, i) => {
    if (Number.isFinite(y)) rows.push(i);
  });
  const k = (samples[0] ?? []).length;
  const out: number[] = [];
  for (let j = 0; j < k; j++) {
    const pair = rows.map((i) => [(samples[i] as number[])[j] as number, outputs[i] as number]);
    out.push(spearmanMatrix(pair)[0]?.[1] ?? Number.NaN);
  }
  return out;
}
