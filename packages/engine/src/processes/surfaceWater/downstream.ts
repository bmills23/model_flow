import {
  checkFinite,
  checkMixingFraction,
  checkNonNegative,
  checkPositive,
  checkTimes,
} from './checks.js';

/**
 * River receptor downstream of the reach (`docs/methods/surface-water.md`, "River receptor downstream of
 * the reach"): the whole river is mixed and moves as plug flow with first-order decay,
 *
 *   C_down(x_r, t) = C_full(t - x_r / U) exp(-k x_r / U),
 *   C_full = (Q_mix C + (1 - f) Q_u C_u) / (Q_u + Q_gw),   U = (Q_u + Q_gw) / A.
 *
 * SI units: s, m, m^3/s, kg/m^3, 1/s.
 */

export interface PlugFlowInput {
  /** Box concentration in the mixing zone at any time, kg/m^3 (for example `transientBox(...).evaluate`). */
  boxConcentration: (t: number) => number;
  /** Receptor times, s, strictly increasing. */
  times: readonly number[];
  /** Upstream flow Q_u, m^3/s. */
  upstreamFlow: number;
  /** Upstream background concentration C_u, kg/m^3. */
  background: number;
  /** Mixing fraction f in (0, 1]. */
  mixingFraction: number;
  /** Groundwater discharge Q_gw, m^3/s. */
  groundwaterFlow: number;
  /** River cross-section A, m^2. */
  crossSection: number;
  /** First-order decay k, 1/s. */
  decay: number;
  /** Distance x_r from the downstream end of the reach to the receptor, m. */
  distance: number;
}

export interface PlugFlowResult {
  times: number[];
  /** C_down at each receptor time, kg/m^3. */
  concentrations: number[];
  /** Fully mixed concentration C_full at each receptor time before travel (at the time itself), kg/m^3. */
  fullyMixed: number[];
  /** Mean velocity U = (Q_u + Q_gw) / A, m/s. */
  velocity: number;
  /** Travel time x_r / U, s. */
  travelTime: number;
}

/** Fully mixed river concentration for a given box concentration. */
export function fullyMixedConcentration(
  i: Pick<PlugFlowInput, 'upstreamFlow' | 'background' | 'mixingFraction' | 'groundwaterFlow'>,
  boxConcentration: number,
): number {
  const mixFlow = i.mixingFraction * i.upstreamFlow + i.groundwaterFlow;
  return (
    (mixFlow * boxConcentration + (1 - i.mixingFraction) * i.upstreamFlow * i.background) /
    (i.upstreamFlow + i.groundwaterFlow)
  );
}

export function plugFlowDownstream(i: PlugFlowInput): PlugFlowResult {
  checkTimes(i.times);
  checkNonNegative('upstream flow', i.upstreamFlow);
  checkNonNegative('background concentration', i.background);
  checkMixingFraction(i.mixingFraction);
  checkNonNegative('groundwater flow', i.groundwaterFlow);
  checkPositive('river cross-section', i.crossSection);
  checkNonNegative('decay rate', i.decay);
  checkNonNegative('distance to the receptor', i.distance);
  const total = i.upstreamFlow + i.groundwaterFlow;
  checkPositive('upstream flow plus groundwater flow', total);
  const velocity = total / i.crossSection;
  const travelTime = i.distance / velocity;
  const decayFactor = Math.exp(-i.decay * travelTime);
  const t0 = i.times[0]!;
  const concentrations = i.times.map((t) => {
    // before the first receptor time the initial steady state applies
    const tb = Math.max(t - travelTime, t0);
    const cBox = i.boxConcentration(tb);
    checkFinite('box concentration', cBox);
    return fullyMixedConcentration(i, cBox) * decayFactor;
  });
  const fullyMixed = i.times.map((t) => fullyMixedConcentration(i, i.boxConcentration(t)));
  return { times: [...i.times], concentrations, fullyMixed, velocity, travelTime };
}

/**
 * Linear interpolation of a sampled series as a function of time (constant before the first and after
 * the last sample), for feeding a series into `plugFlowDownstream`.
 */
export function seriesInterpolator(
  times: readonly number[],
  values: readonly number[],
): (t: number) => number {
  checkTimes(times);
  if (values.length !== times.length) throw new RangeError('one value per time is required');
  return (t) => {
    if (t <= times[0]!) return values[0]!;
    const n = times.length;
    if (t >= times[n - 1]!) return values[n - 1]!;
    let k = 0;
    while (t >= times[k + 1]!) k++;
    const f = (t - times[k]!) / (times[k + 1]! - times[k]!);
    return values[k]! + f * (values[k + 1]! - values[k]!);
  };
}
