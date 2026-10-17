import type { EpcSeries } from './units.js';

/**
 * Window averages of an exposure point concentration series (SI: seconds, kg/kg or kg/m^3), linear
 * between samples. Averages are exact (trapezoids). The moving average of a piecewise-linear series is
 * piecewise quadratic in the window start, so its maximum sits at a sample-aligned start or at a
 * stationary point inside a piece, both of which `maximizeWindows` visits.
 */

export function validateSeries(s: EpcSeries, label: string): void {
  if (s.times.length !== s.values.length) {
    throw new RangeError(`${label}: series times and values must have the same length`);
  }
  if (s.times.length < 2) throw new RangeError(`${label}: a series needs at least two samples`);
  for (let i = 0; i < s.times.length; i++) {
    const t = s.times[i]!;
    const v = s.values[i]!;
    if (!Number.isFinite(t) || t < 0) {
      throw new RangeError(`${label}: series times must be finite and not negative`);
    }
    if (i > 0 && !(t > s.times[i - 1]!)) {
      throw new RangeError(`${label}: series times must be strictly increasing`);
    }
    if (!Number.isFinite(v) || v < 0) {
      throw new RangeError(`${label}: series concentrations must be finite and not negative`);
    }
  }
}

/** Linear interpolation; zero outside the sampled span (the series says nothing there). */
export function seriesValue(s: EpcSeries, t: number): number {
  const n = s.times.length;
  if (t < s.times[0]! || t > s.times[n - 1]!) return 0;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s.times[mid]! <= t) lo = mid;
    else hi = mid;
  }
  const t0 = s.times[lo]!;
  const t1 = s.times[hi]!;
  const f = (t - t0) / (t1 - t0);
  return s.values[lo]! + f * (s.values[hi]! - s.values[lo]!);
}

/** Integral of the series over [a, b], restricted to the sampled span. */
export function windowIntegral(s: EpcSeries, a: number, b: number): number {
  const n = s.times.length;
  const lo = Math.max(a, s.times[0]!);
  const hi = Math.min(b, s.times[n - 1]!);
  if (!(hi > lo)) return 0;
  let total = 0;
  for (let i = 0; i < n - 1; i++) {
    const t0 = s.times[i]!;
    const t1 = s.times[i + 1]!;
    const x0 = Math.max(lo, t0);
    const x1 = Math.min(hi, t1);
    if (x1 > x0) total += ((seriesValue(s, x0) + seriesValue(s, x1)) / 2) * (x1 - x0);
  }
  return total;
}

export interface WindowAverage {
  /** Average over the part of the window the series covers; zero when it covers none. */
  average: number;
  /** True when the series covers the whole window. */
  complete: boolean;
}

export function windowAverage(s: EpcSeries, a: number, b: number): WindowAverage {
  if (!(b > a)) throw new RangeError('a window needs a positive length');
  const n = s.times.length;
  const lo = Math.max(a, s.times[0]!);
  const hi = Math.min(b, s.times[n - 1]!);
  const covered = hi - lo;
  const complete = covered >= (b - a) * (1 - 1e-12);
  if (!(covered > 0)) return { average: 0, complete: false };
  return { average: windowIntegral(s, lo, hi) / covered, complete };
}

/** One window of a life stage or averaging period: offset from the start, length, weight. */
export interface StartWindow {
  offset: number;
  length: number;
  weight: number;
}

/** A series with the windows whose weighted averages are summed. */
export interface WindowTerm {
  series: EpcSeries;
  windows: readonly StartWindow[];
}

export interface WindowMaximum {
  /** The exposure start time, s. */
  start: number;
  /** The weighted sum of the window averages at that start. */
  value: number;
  /** True when a series does not cover every window at that start (so spans were averaged). */
  shorter: boolean;
}

function objective(terms: readonly WindowTerm[], s: number): { value: number; shorter: boolean } {
  let value = 0;
  let shorter = false;
  for (const t of terms) {
    for (const w of t.windows) {
      const a = windowAverage(t.series, s + w.offset, s + w.offset + w.length);
      value += w.weight * a.average;
      if (!a.complete) shorter = true;
    }
  }
  return { value, shorter };
}

function derivative(terms: readonly WindowTerm[], s: number): number {
  let d = 0;
  for (const t of terms) {
    for (const w of t.windows) {
      d +=
        (w.weight *
          (seriesValue(t.series, s + w.offset + w.length) - seriesValue(t.series, s + w.offset))) /
        w.length;
    }
  }
  return d;
}

/**
 * The exposure start time that maximizes the weighted sum of window averages over `terms`. Starts are
 * confined to where every window lies inside every series, [latest first sample, earliest last sample
 * minus the longest reach]; when no such start exists the series are shorter than the exposure, the
 * start is the latest first sample, and `shorter` is true. `options.start` pins the start instead.
 */
export function maximizeWindows(
  terms: readonly WindowTerm[],
  options: { start?: number } = {},
): WindowMaximum {
  if (terms.length === 0) throw new RangeError('maximizeWindows needs at least one term');
  for (const t of terms) {
    if (t.windows.length === 0) throw new RangeError('a term needs at least one window');
    for (const w of t.windows) {
      if (!(w.length > 0) || !(w.offset >= 0) || !(w.weight >= 0)) {
        throw new RangeError('windows need a positive length, offset >= 0 and weight >= 0');
      }
    }
  }
  if (options.start !== undefined) {
    return { start: options.start, ...objective(terms, options.start) };
  }

  const lo = Math.max(...terms.map((t) => t.series.times[0]!));
  const hi = Math.min(
    ...terms.map((t) => {
      const reach = Math.max(...t.windows.map((w) => w.offset + w.length));
      return t.series.times[t.series.times.length - 1]! - reach;
    }),
  );
  if (hi < lo) return { start: lo, ...objective(terms, lo) };

  const marks = new Set<number>([lo, hi]);
  for (const t of terms) {
    for (const w of t.windows) {
      for (const x of t.series.times) {
        for (const s of [x - w.offset, x - w.offset - w.length]) {
          if (s > lo && s < hi) marks.add(s);
        }
      }
    }
  }
  const pts = [...marks].sort((a, b) => a - b);
  const candidates = new Set<number>(pts);
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    const dp = derivative(terms, p);
    const dq = derivative(terms, q);
    if (dp > 0 && dq < 0) candidates.add(p + ((q - p) * dp) / (dp - dq));
  }
  let best: WindowMaximum | undefined;
  for (const s of [...candidates].sort((a, b) => a - b)) {
    const o = objective(terms, s);
    if (best === undefined || o.value > best.value) best = { start: s, ...o };
  }
  return best!;
}
