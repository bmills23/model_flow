import { normalCdf, normalQuantile } from '../../numerics/special.js';

/**
 * Input distribution library for the uncertainty analysis (docs/methods/uncertainty.md, ruling 3).
 * Every draw is x = F^-1(u) for a uniform u from the sampling design. Truncation maps u into
 * [F(lo), F(hi)] before inversion, so it never rejects a draw and keeps Latin hypercube strata.
 * Values are SI; entered units are converted at the boundary with convertDistributionUnits.
 */

export interface Truncation {
  lo?: number;
  hi?: number;
}

export type Distribution = Truncation &
  (
    | { kind: 'constant'; value: number }
    | { kind: 'uniform'; a: number; b: number }
    | { kind: 'loguniform'; a: number; b: number }
    | { kind: 'triangular'; a: number; mode: number; b: number }
    | { kind: 'normal'; mean: number; sd: number }
    /** gm: geometric mean, gsd: geometric standard deviation (> 1). */
    | { kind: 'lognormal'; gm: number; gsd: number }
    /** Sorted values with nondecreasing cumulative probabilities from 0 to 1. */
    | { kind: 'empirical'; values: number[]; probs: number[] }
  );

export interface UncertaintyIssue {
  code: 'uncertainty.bad-distribution' | 'uncertainty.support-outside-bounds';
  category: 'refusal';
  message: string;
}

/** Lognormal from arithmetic mean m and standard deviation s: sigma2 = ln(1 + s2/m2), mu = ln m - sigma2/2. */
export function lognormalFromArithmetic(
  mean: number,
  sd: number,
): { kind: 'lognormal'; gm: number; gsd: number } {
  const sigma2 = Math.log(1 + (sd * sd) / (mean * mean));
  return {
    kind: 'lognormal',
    gm: Math.exp(Math.log(mean) - sigma2 / 2),
    gsd: Math.exp(Math.sqrt(sigma2)),
  };
}

type Base = Distribution;

function empiricalQuantile(values: number[], probs: number[], u: number): number {
  const n = probs.length;
  if (u <= (probs[0] as number)) return values[0] as number;
  if (u >= (probs[n - 1] as number)) return values[n - 1] as number;
  let i = 1;
  while (i < n - 1 && (probs[i] as number) < u) i++;
  const p0 = probs[i - 1] as number;
  const p1 = probs[i] as number;
  const v0 = values[i - 1] as number;
  const v1 = values[i] as number;
  return p1 === p0 ? v1 : v0 + ((u - p0) / (p1 - p0)) * (v1 - v0);
}

function empiricalCdf(values: number[], probs: number[], x: number): number {
  const n = values.length;
  if (x <= (values[0] as number)) return probs[0] as number;
  if (x >= (values[n - 1] as number)) return probs[n - 1] as number;
  let i = 1;
  while (i < n - 1 && (values[i] as number) <= x) i++;
  const v0 = values[i - 1] as number;
  const v1 = values[i] as number;
  const p0 = probs[i - 1] as number;
  const p1 = probs[i] as number;
  return v1 === v0 ? p1 : p0 + ((x - v0) / (v1 - v0)) * (p1 - p0);
}

function baseCdf(d: Base, x: number): number {
  switch (d.kind) {
    case 'constant':
      return x < d.value ? 0 : 1;
    case 'uniform':
      return x <= d.a ? 0 : x >= d.b ? 1 : (x - d.a) / (d.b - d.a);
    case 'loguniform':
      return x <= d.a ? 0 : x >= d.b ? 1 : Math.log(x / d.a) / Math.log(d.b / d.a);
    case 'triangular': {
      if (x <= d.a) return 0;
      if (x >= d.b) return 1;
      if (x <= d.mode) return ((x - d.a) * (x - d.a)) / ((d.b - d.a) * (d.mode - d.a));
      return 1 - ((d.b - x) * (d.b - x)) / ((d.b - d.a) * (d.b - d.mode));
    }
    case 'normal':
      return normalCdf((x - d.mean) / d.sd);
    case 'lognormal':
      return x <= 0 ? 0 : normalCdf(Math.log(x / d.gm) / Math.log(d.gsd));
    case 'empirical':
      return empiricalCdf(d.values, d.probs, x);
  }
}

function baseQuantile(d: Base, u: number): number {
  switch (d.kind) {
    case 'constant':
      return d.value;
    case 'uniform':
      return d.a + u * (d.b - d.a);
    case 'loguniform':
      return Math.exp(Math.log(d.a) + u * (Math.log(d.b) - Math.log(d.a)));
    case 'triangular': {
      const w = d.b - d.a;
      const fm = (d.mode - d.a) / w;
      return u < fm
        ? d.a + Math.sqrt(u * w * (d.mode - d.a))
        : d.b - Math.sqrt((1 - u) * w * (d.b - d.mode));
    }
    case 'normal':
      return d.mean + d.sd * normalQuantile(u);
    case 'lognormal':
      return d.gm * Math.pow(d.gsd, normalQuantile(u));
    case 'empirical':
      return empiricalQuantile(d.values, d.probs, u);
  }
}

function truncBounds(d: Distribution): { fl: number; fh: number } {
  const fl = d.lo === undefined ? 0 : baseCdf(d, d.lo);
  const fh = d.hi === undefined ? 1 : baseCdf(d, d.hi);
  return { fl, fh };
}

/** Cumulative probability of x under the (possibly truncated) distribution. */
export function distributionCdf(d: Distribution, x: number): number {
  if (d.lo !== undefined && x < d.lo) return 0;
  if (d.hi !== undefined && x >= d.hi) return 1;
  const { fl, fh } = truncBounds(d);
  if (fh <= fl) return x < (d.lo ?? d.hi ?? 0) ? 0 : 1;
  return Math.min(1, Math.max(0, (baseCdf(d, x) - fl) / (fh - fl)));
}

/** Inverse CDF of the (possibly truncated) distribution for u in [0, 1]. */
export function distributionQuantile(d: Distribution, u: number): number {
  const { fl, fh } = truncBounds(d);
  const v = baseQuantile(d, fl + u * (fh - fl));
  // Guard round-off at the truncation limits.
  const lo = d.lo ?? -Infinity;
  const hi = d.hi ?? Infinity;
  return Math.min(hi, Math.max(lo, v));
}

/** One draw by inverse-CDF sampling from a uniform u in [0, 1). No rejection, no Math.random. */
export function sampleDistribution(d: Distribution, u: number): number {
  const eps = 2 ** -53;
  return distributionQuantile(d, Math.min(1 - eps, Math.max(eps, u)));
}

/** Mean of the distribution (closed form when untruncated, midpoint quadrature of F^-1 otherwise). */
export function distributionMean(d: Distribution): number {
  if (d.lo === undefined && d.hi === undefined) {
    switch (d.kind) {
      case 'constant':
        return d.value;
      case 'uniform':
        return (d.a + d.b) / 2;
      case 'loguniform':
        return (d.b - d.a) / Math.log(d.b / d.a);
      case 'triangular':
        return (d.a + d.mode + d.b) / 3;
      case 'normal':
        return d.mean;
      case 'lognormal':
        return d.gm * Math.exp(Math.log(d.gsd) ** 2 / 2);
      case 'empirical': {
        let m = 0;
        for (let i = 1; i < d.values.length; i++) {
          m +=
            ((d.probs[i] as number) - (d.probs[i - 1] as number)) *
            (((d.values[i] as number) + (d.values[i - 1] as number)) / 2);
        }
        return m;
      }
    }
  }
  const n = 20000;
  let s = 0;
  for (let i = 0; i < n; i++) s += distributionQuantile(d, (i + 0.5) / n);
  return s / n;
}

/** Scale a distribution by a positive factor (a unit conversion). A lognormal stays lognormal. */
export function convertDistributionUnits(d: Distribution, factor: number): Distribution {
  const out: Record<string, unknown> = { ...d };
  const scale = (k: string): void => {
    if (typeof out[k] === 'number') out[k] = (out[k] as number) * factor;
  };
  scale('lo');
  scale('hi');
  switch (d.kind) {
    case 'constant':
      scale('value');
      break;
    case 'uniform':
    case 'loguniform':
      scale('a');
      scale('b');
      break;
    case 'triangular':
      scale('a');
      scale('mode');
      scale('b');
      break;
    case 'normal':
      scale('mean');
      scale('sd');
      break;
    case 'lognormal':
      scale('gm');
      break;
    case 'empirical':
      out.values = d.values.map((v) => v * factor);
      break;
  }
  return out as unknown as Distribution;
}

function baseSupport(d: Distribution): [number, number] {
  switch (d.kind) {
    case 'constant':
      return [d.value, d.value];
    case 'uniform':
    case 'loguniform':
    case 'triangular':
      return [d.a, d.b];
    case 'normal':
      return [-Infinity, Infinity];
    case 'lognormal':
      return [0, Infinity];
    case 'empirical':
      return [d.values[0] as number, d.values[d.values.length - 1] as number];
  }
}

function badParameters(d: Distribution): string | null {
  const fin = (...xs: number[]): boolean => xs.every((x) => Number.isFinite(x));
  switch (d.kind) {
    case 'constant':
      return fin(d.value) ? null : 'constant value must be finite';
    case 'uniform':
      return fin(d.a, d.b) && d.b > d.a ? null : 'uniform needs finite a < b';
    case 'loguniform':
      return fin(d.a, d.b) && d.a > 0 && d.b > d.a ? null : 'log-uniform needs 0 < a < b';
    case 'triangular':
      return fin(d.a, d.mode, d.b) && d.b > d.a && d.mode >= d.a && d.mode <= d.b
        ? null
        : 'triangular needs a < b and a <= mode <= b';
    case 'normal':
      return fin(d.mean, d.sd) && d.sd > 0 ? null : 'normal needs sd > 0';
    case 'lognormal':
      return fin(d.gm, d.gsd) && d.gm > 0 && d.gsd > 1
        ? null
        : 'lognormal needs gm > 0 and gsd > 1';
    case 'empirical': {
      const n = d.values.length;
      if (n < 2 || d.probs.length !== n) return 'empirical needs at least two matched points';
      if (d.probs[0] !== 0 || d.probs[n - 1] !== 1)
        return 'empirical probabilities run from 0 to 1';
      for (let i = 1; i < n; i++) {
        if ((d.values[i] as number) < (d.values[i - 1] as number))
          return 'empirical values not sorted';
        if ((d.probs[i] as number) < (d.probs[i - 1] as number))
          return 'empirical probabilities not monotone';
      }
      return d.values.every(Number.isFinite) ? null : 'empirical values must be finite';
    }
  }
}

/**
 * Validity checks: invalid parameters or truncation are refused as uncertainty.bad-distribution;
 * a support that leaves the input's physical bounds without a truncation into them is refused as
 * uncertainty.support-outside-bounds. Returns an empty list when the distribution is usable.
 */
export function checkDistribution(
  d: Distribution,
  bounds: readonly [number, number],
): UncertaintyIssue[] {
  const bad = badParameters(d);
  if (bad !== null) {
    return [{ code: 'uncertainty.bad-distribution', category: 'refusal', message: bad }];
  }
  if (d.lo !== undefined && d.hi !== undefined && !(d.hi > d.lo)) {
    return [
      {
        code: 'uncertainty.bad-distribution',
        category: 'refusal',
        message: 'truncation needs lo < hi',
      },
    ];
  }
  const { fl, fh } = truncBounds(d);
  const [s0, s1] = baseSupport(d);
  const degenerate = d.kind === 'constant';
  if (!degenerate && !(fh > fl)) {
    return [
      {
        code: 'uncertainty.bad-distribution',
        category: 'refusal',
        message: 'truncation leaves no probability mass',
      },
    ];
  }
  const lo = Math.max(s0, d.lo ?? -Infinity);
  const hi = Math.min(s1, d.hi ?? Infinity);
  if (lo < bounds[0] || hi > bounds[1]) {
    return [
      {
        code: 'uncertainty.support-outside-bounds',
        category: 'refusal',
        message: `support [${lo}, ${hi}] leaves the physical bounds [${bounds[0]}, ${bounds[1]}]; truncate it`,
      },
    ];
  }
  return [];
}
