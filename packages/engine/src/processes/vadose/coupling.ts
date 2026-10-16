import type { At123dAquifer, BoxSource, LoadingStep } from '../groundwater/kernel.js';
import { massRateFromConcentration } from '../groundwater/kernel.js';
import type { ConcentrationStep } from '../groundwater/loading.js';

/**
 * Coupling of the vadose leaching result into the groundwater (M1) methods.
 *
 * The vadose methods deliver an advective mass flux J(t) (kg/m^2/s) through the water table over
 * the source plan area A. The groundwater kernel takes piecewise-constant mass rates, so the flux
 * series is cut into steps of equal length and each step carries the exact mean of the
 * piecewise-linear interpolant of J over that step. When the series also carries the engine's exact
 * cumulative delivery (`delivered`, kg), each step instead carries exactly the delivered mass that
 * crossed the water table during it, so the loaded mass equals the vadose budget to rounding; the
 * linear interpolant of the monthly flux samples is only a trapezoid approximation of that.
 */

/** A flux series: nodes `times` (s, ascending, first value >= 0) and flux at each node (kg/m^2/s). */
export interface FluxSeries {
  times: readonly number[];
  flux: readonly number[];
  /**
   * Optional exact cumulative mass delivered through the water table by each node, kg, over the
   * plan area passed to `fluxToLoadingSteps` (non-decreasing, same length as `times`). Between nodes
   * the flux interpolant supplies only the shape; the mass of each node interval is exact.
   */
  delivered?: readonly number[];
}

/** Anything carrying a flux series, such as the output of `vadose.vadsat`. */
export interface FluxSource {
  series: FluxSeries;
}

function validateSeries(s: FluxSeries): void {
  if (s.times.length < 2 || s.times.length !== s.flux.length)
    throw new RangeError('A flux series needs at least two nodes and one flux per node');
  for (let i = 0; i < s.times.length; i++) {
    const t = s.times[i]!;
    const f = s.flux[i]!;
    if (!(Number.isFinite(t) && t >= 0) || (i > 0 && !(t > s.times[i - 1]!)))
      throw new RangeError('Flux series times must be finite, non-negative and strictly ascending');
    if (!(Number.isFinite(f) && f >= 0)) throw new RangeError('Flux must be finite and >= 0');
  }
  const d = s.delivered;
  if (d !== undefined) {
    if (d.length !== s.times.length)
      throw new RangeError('The cumulative delivery needs one value per node');
    for (let i = 0; i < d.length; i++) {
      if (!(Number.isFinite(d[i]!) && d[i]! >= 0) || (i > 0 && d[i]! < d[i - 1]!))
        throw new RangeError('Cumulative delivery must be finite, non-negative and non-decreasing');
    }
  }
}

/**
 * Exact cumulative delivered mass at time t, kg: the node values, with the flux interpolant giving
 * the shape inside each node interval (so every node interval carries its exact mass).
 */
function cumulativeAt(s: FluxSeries & { delivered: readonly number[] }, t: number): number {
  const times = s.times;
  const last = times.length - 1;
  if (t <= times[0]!) return s.delivered[0]!;
  if (t >= times[last]!) return s.delivered[last]!;
  let i = 0;
  while (i + 1 < last && times[i + 1]! <= t) i++;
  const t0 = times[i]!;
  const t1 = times[i + 1]!;
  const dm = s.delivered[i + 1]! - s.delivered[i]!;
  const whole = integralOver(s, t0, t1);
  const frac = whole > 0 ? integralOver(s, t0, t) / whole : (t - t0) / (t1 - t0);
  return s.delivered[i]! + dm * frac;
}

/** Integral of the piecewise-linear interpolant of the series over [a, b], extended by zero outside. */
function integralOver(s: FluxSeries, a: number, b: number): number {
  const t = s.times;
  const f = s.flux;
  let sum = 0;
  for (let i = 0; i + 1 < t.length; i++) {
    const lo = Math.max(a, t[i]!);
    const hi = Math.min(b, t[i + 1]!);
    if (!(hi > lo)) continue;
    const slope = (f[i + 1]! - f[i]!) / (t[i + 1]! - t[i]!);
    const f0 = f[i]! + slope * (lo - t[i]!);
    const f1 = f[i]! + slope * (hi - t[i]!);
    sum += 0.5 * (f0 + f1) * (hi - lo);
  }
  return sum;
}

/**
 * Cut a vadose flux series into constant-rate loading steps for the groundwater kernel.
 * `area` is the plan area over which the flux enters the aquifer, m^2. Steps start at the first
 * series node, are `stepLength` long, and stop at `tEnd` (the last step is shorter when tEnd is not
 * a multiple). With `series.delivered` the steps carry the exact delivered mass (see `FluxSeries`),
 * which must then be over the same `area`. `tEnd` must not exceed the end of the series, since the flux beyond it is unknown.
 */
export function fluxToLoadingSteps(
  result: FluxSource | FluxSeries,
  area: number,
  tEnd: number,
  stepLength: number,
): LoadingStep[] {
  const series = 'series' in result ? result.series : result;
  validateSeries(series);
  if (!(Number.isFinite(area) && area > 0))
    throw new RangeError('Area must be finite and positive');
  if (!(Number.isFinite(stepLength) && stepLength > 0))
    throw new RangeError('Step length must be finite and positive');
  const first = series.times[0]!;
  const last = series.times[series.times.length - 1]!;
  if (!(Number.isFinite(tEnd) && tEnd > first))
    throw new RangeError('tEnd must be finite and later than the first series time');
  if (tEnd > last * (1 + 1e-12))
    throw new RangeError('tEnd extends beyond the end of the flux series');
  const steps: LoadingStep[] = [];
  const n = Math.ceil(((tEnd - first) / stepLength) * (1 - 1e-12));
  for (let k = 0; k < n; k++) {
    const start = first + k * stepLength;
    const end = k === n - 1 ? tEnd : first + (k + 1) * stepLength;
    const mass =
      series.delivered === undefined
        ? integralOver(series, start, end) * area
        : cumulativeAt({ ...series, delivered: series.delivered }, end) -
          cumulativeAt({ ...series, delivered: series.delivered }, start);
    steps.push({ start, end, rate: Math.max(0, mass) / (end - start) });
  }
  return steps;
}

/** Total mass of the steps, kg: the sum of rate times duration. */
export function loadedMass(steps: readonly { start: number; end: number; rate: number }[]): number {
  let m = 0;
  for (const s of steps) m += s.rate * (s.end - s.start);
  return m;
}

/**
 * Express mass-rate steps as boundary concentrations for the patch-source methods (Wexler,
 * Domenico): the inverse of `massRateFromConcentration`, c = rate / (q A_cross), with `darcyFlux`
 * the aquifer Darcy flux and `crossSection` the source area normal to the flow.
 */
export function toConcentrationSteps(
  steps: readonly LoadingStep[],
  darcyFlux: number,
  crossSection: number,
): ConcentrationStep[] {
  if (!(Number.isFinite(darcyFlux) && darcyFlux > 0))
    throw new RangeError('Darcy flux must be finite and positive');
  if (!(Number.isFinite(crossSection) && crossSection > 0))
    throw new RangeError('Cross-section must be finite and positive');
  const unit = massRateFromConcentration(1, darcyFlux, crossSection);
  return steps.map((s) => ({ start: s.start, end: s.end, concentration: s.rate / unit }));
}

/**
 * The horizontal patch where the infiltration enters the aquifer, as a kernel source. The patch sits
 * on the water table, which must be a no-flux boundary so the delivered mass stays in the aquifer:
 * - finite layer (`thickness`, or an `aquifer` with a thickness): the top, z = thickness;
 * - infinite depth: z = 0, the no-flux water table of Yeh's 1981 semi-infinite aquifer (z <= 0), which
 *   is the kernel's default for infinite depth. An `aquifer` with `top: 'unbounded'` has no water
 *   table and would carry half of the loaded mass upward out of the aquifer, so passing one is a
 *   RangeError. Pass the `aquifer` to have this checked; the bare `thickness` form cannot check it.
 */
export function waterTableSource(
  length: number,
  width: number,
  options: { xStart?: number; thickness?: number; aquifer?: At123dAquifer } = {},
): BoxSource {
  if (!(length > 0 && width > 0)) throw new RangeError('Patch length and width must be positive');
  const { aquifer } = options;
  if (aquifer !== undefined) {
    if (options.thickness !== undefined && options.thickness !== aquifer.thickness)
      throw new RangeError('Thickness disagrees with the aquifer thickness');
    if (aquifer.thickness === undefined && aquifer.top === 'unbounded')
      throw new RangeError(
        "A vadose-fed source on an infinitely deep aquifer needs top: 'no-flux' (the default; a water table at z = 0); the unbounded medium loses half of the loaded mass upward",
      );
  }
  const x1 = options.xStart ?? 0;
  const z = aquifer?.thickness ?? options.thickness ?? 0;
  return { x1, x2: x1 + length, y1: -width / 2, y2: width / 2, z1: z, z2: z };
}
