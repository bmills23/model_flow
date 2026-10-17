import type { ModeledRun } from './modeledTypes';

/** A geometric grid of n points from lo to hi inclusive. */
export function logGrid(lo: number, hi: number, n: number): number[] {
  if (!(lo > 0 && hi > lo && Number.isFinite(hi))) {
    throw new RangeError('a log grid needs 0 < lo < hi, both finite');
  }
  if (!(n >= 2)) throw new RangeError('a log grid needs at least two points');
  const a = Math.log(lo);
  const b = Math.log(hi);
  return Array.from({ length: n }, (_, i) => Math.exp(a + ((b - a) * i) / (n - 1)));
}

/**
 * The source-concentration range the metric curve covers: two decades each way around the level, or
 * three around the starting concentration when there is no level; never past the search cap.
 */
export function curveDomain(
  level: number | null,
  start: number,
  cap: number | undefined,
): [number, number] {
  const centre = level ?? start;
  const decades = level === null ? 3 : 2;
  let lo = centre / 10 ** decades;
  let hi = centre * 10 ** decades;
  if (cap !== undefined) {
    hi = Math.min(hi, cap);
    if (lo >= hi) lo = hi / 10 ** (2 * decades);
  }
  return [lo, hi];
}

export interface ChartInput {
  conc: readonly number[];
  metric: readonly number[];
  target: number;
  level: number | null;
}

export interface ChartModel {
  /** Points with a positive metric (a log axis cannot draw zero). */
  points: { x: number; y: number }[];
  target: number;
  solution: { x: number; y: number } | null;
  xDomain: [number, number];
  yDomain: [number, number];
}

export function chartModel(i: ChartInput): ChartModel {
  const points = i.conc.flatMap((x, k) => {
    const y = i.metric[k]!;
    return y > 0 && Number.isFinite(y) ? [{ x, y }] : [];
  });
  const xs = [...i.conc, ...(i.level === null ? [] : [i.level])];
  const ys = [...points.map((p) => p.y), i.target];
  const xDomain: [number, number] = [Math.min(...xs), Math.max(...xs)];
  const yDomain: [number, number] = [Math.min(...ys) / 2, Math.max(...ys) * 2];
  return {
    points,
    target: i.target,
    solution: i.level === null ? null : { x: i.level, y: i.target },
    xDomain,
    yDomain,
  };
}

/** The metric array a run draws: the shown endpoint's curve. */
export function metricOf(run: ModeledRun): number[] {
  const { endpoint } = run.shown;
  if (endpoint === 'cancer') return run.curve.cancer;
  if (endpoint === 'noncancer') return run.curve.hi;
  return run.curve.peak.map((p) => p ?? 0);
}
