import {
  percentile,
  type SampleSummary,
  type SobolResult,
  type TornadoResult,
} from '@model-flow/engine';

/** Chart data for the uncertainty results (note "Percentiles and summaries"); pure, so tests need no DOM. */

export const FAN_PROBABILITIES = [0.05, 0.25, 0.5, 0.75, 0.95] as const;

const finite = (v: number): boolean => Number.isFinite(v);

export interface Histogram {
  /** True when the bins are equal in log10 (positive values spanning more than two decades). */
  log: boolean;
  /** bins + 1 edges, ascending. */
  edges: number[];
  counts: number[];
}

/** Histogram of the finite values; log10 bins when all are positive and the range exceeds two decades. */
export function histogram(values: readonly number[], bins?: number): Histogram {
  const v = values.filter(finite);
  if (v.length === 0) return { log: false, edges: [0, 1], counts: [0] };
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  if (lo === hi) return { log: false, edges: [lo, hi], counts: [v.length] };
  const k = Math.max(
    1,
    Math.floor(bins ?? Math.min(30, Math.max(8, Math.ceil(Math.sqrt(v.length))))),
  );
  const log = lo > 0 && hi / lo > 100;
  const a = log ? Math.log10(lo) : lo;
  const b = log ? Math.log10(hi) : hi;
  const edges = Array.from({ length: k + 1 }, (_, i) => {
    if (i === 0) return lo;
    if (i === k) return hi;
    const t = a + ((b - a) * i) / k;
    return log ? 10 ** t : t;
  });
  const counts = new Array<number>(k).fill(0);
  for (const x of v) {
    const t = ((log ? Math.log10(x) : x) - a) / (b - a);
    counts[Math.min(k - 1, Math.max(0, Math.floor(t * k)))]! += 1;
  }
  return { log, edges, counts };
}

export interface CdfPoint {
  x: number;
  p: number;
}

/** Empirical CDF steps (i / n) over the finite values. */
export function empiricalCdf(values: readonly number[]): CdfPoint[] {
  const y = values.filter(finite).sort((a, b) => a - b);
  return y.map((x, i) => ({ x, p: (i + 1) / y.length }));
}

export interface Fan {
  times: number[];
  /** One row per FAN_PROBABILITIES entry, each with one value per time. */
  bands: number[][];
  /** Curves used (all values finite). */
  used: number;
}

/** Percentile fan of a time series output: per time point, definition 7 percentiles across iterations. */
export function fanBands(times: readonly number[], curves: readonly (readonly number[])[]): Fan {
  for (const c of curves) {
    if (c.length !== times.length) {
      throw new RangeError(`each curve needs one value per time (length ${times.length})`);
    }
  }
  const ok = curves.filter((c) => c.every(finite));
  const bands = FAN_PROBABILITIES.map((p) =>
    times.map((_, t) =>
      percentile(
        ok.map((c) => c[t] as number).sort((a, b) => a - b),
        p,
      ),
    ),
  );
  return { times: [...times], bands, used: ok.length };
}

export interface TornadoRow {
  label: string;
  low: number;
  high: number;
  lowInput: number;
  highInput: number;
  ok: boolean;
}

export function tornadoRows(
  t: TornadoResult,
  labels: Readonly<Record<string, string>>,
): TornadoRow[] {
  return t.entries.map((e) => ({
    label: labels[e.id] ?? e.id,
    low: e.low,
    high: e.high,
    lowInput: e.lowInput,
    highInput: e.highInput,
    ok: finite(e.low) && finite(e.high),
  }));
}

export interface SobolRow {
  label: string;
  first: number;
  firstRaw: number;
  firstInterval: [number, number];
  total: number;
  totalInterval: [number, number];
  /** False when either half-width is above the 0.05 limit. */
  converged: boolean;
}

export function sobolRows(
  s: Pick<
    SobolResult,
    | 'ids'
    | 'first'
    | 'firstRaw'
    | 'total'
    | 'firstInterval'
    | 'totalInterval'
    | 'firstHalfWidth'
    | 'totalHalfWidth'
  >,
  labels: Readonly<Record<string, string>>,
): SobolRow[] {
  return s.ids.map((id, j) => ({
    label: labels[id] ?? id,
    first: s.first[j] as number,
    firstRaw: s.firstRaw[j] as number,
    firstInterval: s.firstInterval[j] as [number, number],
    total: s.total[j] as number,
    totalInterval: s.totalInterval[j] as [number, number],
    converged: (s.firstHalfWidth[j] as number) <= 0.05 && (s.totalHalfWidth[j] as number) <= 0.05,
  }));
}

export function summaryRows(s: SampleSummary): { label: string; value: number }[] {
  return [
    { label: 'Minimum', value: s.min },
    { label: '5th percentile', value: s.p5 },
    { label: '25th percentile', value: s.p25 },
    { label: 'Median', value: s.p50 },
    { label: '75th percentile', value: s.p75 },
    { label: '90th percentile', value: s.p90 },
    { label: '95th percentile', value: s.p95 },
    { label: 'Maximum', value: s.max },
    { label: 'Mean', value: s.mean },
    { label: 'Standard deviation', value: s.sd },
  ];
}

export function fmtNum(x: number): string {
  if (!Number.isFinite(x)) return 'n/a';
  if (x === 0) return '0';
  const a = Math.abs(x);
  return a >= 1e4 || a < 1e-2
    ? x.toExponential(2).replace('e+', 'e')
    : String(Number(x.toPrecision(3)));
}
