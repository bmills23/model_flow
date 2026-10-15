/**
 * Time-varying boundary loading for the patch-source methods (Wexler, Domenico).
 *
 * A step holds the source boundary at a concentration over [start, end) in seconds (end may be
 * Infinity). This mirrors the shape of the kernel's `LoadingStep`, but the value is a boundary
 * concentration (same units as the method's c0), NOT a mass rate. The problem is linear in the
 * source, so the response is the superposition
 *
 *   c(t) = sum_i c_i [ F(t - start_i) - F(t - end_i) ],   F(tau) = 0 for tau <= 0,
 *
 * where F is the unit step response (the method's solution for a constant boundary concentration of
 * one). Steps must be ordered by start and must not overlap.
 */
export interface ConcentrationStep {
  start: number;
  end: number;
  /** Boundary concentration held during [start, end); finite and >= 0. */
  concentration: number;
}

export function validateConcentrationLoading(steps: readonly ConcentrationStep[]): void {
  let previousEnd = 0;
  for (const s of steps) {
    if (!(Number.isFinite(s.start) && s.start >= 0))
      throw new RangeError('Loading step start must be finite and >= 0');
    if (!(s.end > s.start)) throw new RangeError('Loading step end must be greater than its start');
    if (!(Number.isFinite(s.concentration) && s.concentration >= 0))
      throw new RangeError('Loading step concentration must be finite and >= 0');
    if (s.start < previousEnd)
      throw new RangeError('Loading steps must be ordered by start and must not overlap');
    previousEnd = s.end;
  }
}

/**
 * Visit each (weight, tau) pair of the superposition at `time`: +c_i at t - start_i and -c_i at
 * t - end_i, skipping non-positive ages. At time = Infinity a finished step cancels exactly and an
 * open-ended step contributes its steady value.
 */
export function forEachLoadingTerm(
  steps: readonly ConcentrationStep[],
  time: number,
  visit: (weight: number, tau: number) => void,
): void {
  validateConcentrationLoading(steps);
  if (Number.isNaN(time)) throw new RangeError('Time must not be NaN');
  for (const s of steps) {
    if (s.concentration === 0) continue;
    const on = time - s.start;
    if (!(on > 0)) continue;
    if (s.end === Infinity) {
      visit(s.concentration, on);
    } else if (time === Infinity) {
      continue; // F(Infinity) - F(Infinity)
    } else {
      const off = time - s.end;
      visit(s.concentration, on);
      if (off > 0) visit(-s.concentration, off);
    }
  }
}

/** Superpose a scalar unit step response over the loading steps. */
export function superposeLoading(
  steps: readonly ConcentrationStep[],
  time: number,
  unitResponse: (tau: number) => number,
): number {
  let sum = 0;
  forEachLoadingTerm(steps, time, (w, tau) => {
    sum += w * unitResponse(tau);
  });
  return sum;
}

/** Superpose a plan-view grid c[ix][iy] of the unit step response over the loading steps. */
export function superposeLoadingGrid(
  steps: readonly ConcentrationStep[],
  time: number,
  nx: number,
  ny: number,
  unitGrid: (tau: number) => number[][],
): number[][] {
  const out = Array.from({ length: nx }, () => new Array<number>(ny).fill(0));
  forEachLoadingTerm(steps, time, (w, tau) => {
    const g = unitGrid(tau);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out[i]![j]! += w * g[i]![j]!;
  });
  return out;
}
