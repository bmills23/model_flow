import { latinHypercube, Xoshiro128ss } from '../../numerics/random.js';
import { normalQuantile } from '../../numerics/special.js';
import { sampleDistribution, type Distribution } from './distributions.js';

/**
 * Sampling designs for the uncertainty analysis (docs/methods/uncertainty.md): simple random
 * sampling, Latin hypercube mapping, Iman-Conover rank correlation, purpose-labelled seed
 * streams and sample percentiles. Matrices are row-major: one row per iteration, one column per
 * input. Everything is deterministic given the stream passed in.
 */

export type Matrix = number[][];

export interface SamplerIssue {
  code: 'uncertainty.correlation-not-positive-definite' | 'uncertainty.small-sample-correlation';
  category: 'refusal' | 'warning';
  message: string;
}

/** Independent stream for a purpose label: `<seed>:<purpose>` through the Xoshiro128ss string constructor. */
export function seedStream(seed: string | number, purpose: string): Xoshiro128ss {
  return new Xoshiro128ss(`${seed}:${purpose}`);
}

/** Simple random sample: x_ij = F_j^-1(u_ij) with independent uniform u_ij. */
export function sampleSrsMatrix(
  dists: readonly Distribution[],
  n: number,
  rng: Xoshiro128ss,
): Matrix {
  const rows: Matrix = [];
  for (let i = 0; i < n; i++) {
    rows.push(dists.map((d) => sampleDistribution(d, rng.nextFloat())));
  }
  return rows;
}

/** Latin hypercube sample mapped through each input's inverse CDF (one draw per stratum per column). */
export function sampleLhsMatrix(
  dists: readonly Distribution[],
  n: number,
  rng: Xoshiro128ss,
): Matrix {
  const u = latinHypercube(n, dists.length, rng);
  return u.map((row) => row.map((v, j) => sampleDistribution(dists[j] as Distribution, v)));
}

/** Percentile by linear interpolation between order statistics (Hyndman and Fan definition 7). */
export function percentile(values: readonly number[], p: number): number {
  const y = [...values].sort((a, b) => a - b);
  const n = y.length;
  if (n === 0) return NaN;
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const a = y[lo] as number;
  const b = y[Math.min(n - 1, lo + 1)] as number;
  return h === lo ? a : a + (h - lo) * (b - a);
}

export interface SampleSummary {
  n: number;
  min: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  max: number;
  mean: number;
  /** Sample standard deviation (n - 1 denominator); 0 when n < 2. */
  sd: number;
}

export function summarizeSample(values: readonly number[]): SampleSummary {
  const n = values.length;
  const y = [...values].sort((a, b) => a - b);
  const mean = y.reduce((s, v) => s + v, 0) / n;
  const ss = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  return {
    n,
    min: y[0] as number,
    p5: percentile(y, 0.05),
    p25: percentile(y, 0.25),
    p50: percentile(y, 0.5),
    p75: percentile(y, 0.75),
    p90: percentile(y, 0.9),
    p95: percentile(y, 0.95),
    max: y[n - 1] as number,
    mean,
    sd: n > 1 ? Math.sqrt(ss / (n - 1)) : 0,
  };
}

/** Lower Cholesky factor L with A = L L', or null when A is not (numerically) positive definite. */
export function cholesky(a: Matrix): Matrix | null {
  const k = a.length;
  const l: Matrix = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < k; i++) {
    const li = l[i] as number[];
    for (let j = 0; j <= i; j++) {
      const lj = l[j] as number[];
      let s = (a[i] as number[])[j] as number;
      for (let m = 0; m < j; m++) s -= (li[m] as number) * (lj[m] as number);
      if (i === j) {
        if (!(s > 1e-12)) return null;
        li[i] = Math.sqrt(s);
      } else {
        li[j] = s / (lj[j] as number);
      }
    }
  }
  return l;
}

/** Fractional ranks (1..n, ties share the average rank) of a column. */
function ranks(col: readonly number[]): number[] {
  const n = col.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (col[a] as number) - (col[b] as number) || a - b,
  );
  const r = new Array<number>(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && col[idx[j + 1] as number] === col[idx[i] as number]) j++;
    const avg = (i + j) / 2 + 1;
    for (let m = i; m <= j; m++) r[idx[m] as number] = avg;
    i = j + 1;
  }
  return r;
}

function column(m: Matrix, j: number): number[] {
  return m.map((row) => row[j] as number);
}

function pearson(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] as number) - mx;
    const dy = (y[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman rank correlation matrix of the columns (average ranks for ties). */
export function spearmanMatrix(m: Matrix): Matrix {
  const k = (m[0] ?? []).length;
  const rk = Array.from({ length: k }, (_, j) => ranks(column(m, j)));
  return Array.from({ length: k }, (_, a) =>
    Array.from({ length: k }, (_, b) =>
      a === b ? 1 : pearson(rk[a] as number[], rk[b] as number[]),
    ),
  );
}

export type ImanConoverResult =
  | { ok: true; values: Matrix; achieved: Matrix; warnings: SamplerIssue[] }
  | { ok: false; issue: SamplerIssue };

function refuse(message: string): ImanConoverResult {
  return {
    ok: false,
    issue: { code: 'uncertainty.correlation-not-positive-definite', category: 'refusal', message },
  };
}

/**
 * Iman and Conover (1982) restricted pairing. Reorders each column of `sample` (n by k) so the rank
 * correlation approaches `target` (k by k, symmetric, unit diagonal, positive definite) while every
 * column remains a permutation of itself. The input is not modified.
 */
export function imanConover(sample: Matrix, target: Matrix, rng: Xoshiro128ss): ImanConoverResult {
  const n = sample.length;
  const k = target.length;
  if (k === 0 || target.some((r) => r.length !== k) || (sample[0] ?? []).length !== k) {
    return refuse('The correlation matrix must be square with one row per sampled input.');
  }
  for (let i = 0; i < k; i++) {
    if (Math.abs(((target[i] as number[])[i] as number) - 1) > 1e-12) {
      return refuse('The correlation matrix must have a unit diagonal.');
    }
    for (let j = 0; j < i; j++) {
      if (Math.abs((target[i] as number[])[j]! - (target[j] as number[])[i]!) > 1e-12) {
        return refuse('The correlation matrix must be symmetric.');
      }
    }
  }
  const p = cholesky(target);
  if (!p) return refuse('The correlation matrix is not positive definite.');
  if (n <= k) return refuse('The sample size must exceed the number of correlated inputs.');

  // Step 1: van der Waerden scores, independently permuted per column, then standardised.
  const base = Array.from({ length: n }, (_, i) => normalQuantile((i + 1) / (n + 1)));
  const mean = base.reduce((s, v) => s + v, 0) / n; // zero by symmetry, kept for exactness
  const sd = Math.sqrt(base.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const scores: Matrix = Array.from({ length: n }, () => new Array<number>(k).fill(0));
  for (let j = 0; j < k; j++) {
    const perm = [...base];
    for (let i = n - 1; i > 0; i--) {
      const m = Math.floor(rng.nextFloat() * (i + 1));
      const t = perm[i] as number;
      perm[i] = perm[m] as number;
      perm[m] = t;
    }
    for (let i = 0; i < n; i++) (scores[i] as number[])[j] = ((perm[i] as number) - mean) / sd;
  }

  // Step 2: T = sample correlation of the scores, T = Q Q'.
  const sc = Array.from({ length: k }, (_, j) => column(scores, j));
  const t: Matrix = Array.from({ length: k }, (_, a) =>
    Array.from({ length: k }, (_, b) =>
      a === b ? 1 : pearson(sc[a] as number[], sc[b] as number[]),
    ),
  );
  const q = cholesky(t);
  if (!q) return refuse('The score matrix is degenerate; use a larger sample.');

  // Step 3: R* = R (P Q^-1)'. Row form: r*_i = M r_i with M = P Q^-1 (lower triangular).
  const qinv: Matrix = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let c = 0; c < k; c++) {
    for (let i = c; i < k; i++) {
      let s = i === c ? 1 : 0;
      for (let m = c; m < i; m++)
        s -= ((q[i] as number[])[m] as number) * ((qinv[m] as number[])[c] as number);
      (qinv[i] as number[])[c] = s / ((q[i] as number[])[i] as number);
    }
  }
  const mm: Matrix = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => {
      let s = 0;
      for (let m = j; m <= i; m++)
        s += ((p[i] as number[])[m] as number) * ((qinv[m] as number[])[j] as number);
      return s;
    }),
  );
  const target2: Matrix = scores.map((r) =>
    mm.map((mi) => mi.reduce((s, v, j) => s + v * (r[j] as number), 0)),
  );

  // Step 4: give column j of the sample the rank pattern of column j of R*.
  const values: Matrix = Array.from({ length: n }, () => new Array<number>(k).fill(0));
  for (let j = 0; j < k; j++) {
    const sorted = column(sample, j).sort((a, b) => a - b);
    const order = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) =>
        ((target2[a] as number[])[j] as number) - ((target2[b] as number[])[j] as number) || a - b,
    );
    order.forEach((row, rank) => {
      (values[row] as number[])[j] = sorted[rank] as number;
    });
  }

  const warnings: SamplerIssue[] = [];
  if (n < 5 * k) {
    warnings.push({
      code: 'uncertainty.small-sample-correlation',
      category: 'warning',
      message: `Sample size ${n} is below 5 times the ${k} correlated inputs; the achieved correlation is noisy.`,
    });
  }
  return { ok: true, values, achieved: spearmanMatrix(values), warnings };
}
