import { checkFinite, checkNonNegative, checkPositive, checkTimes } from './checks.js';

/**
 * Transient well-mixed box with storage (`docs/methods/surface-water.md`, "Transient well-mixed mixing"):
 *
 *   V dC/dt = W(t) + B - (Q_mix + k V) C,   B = f Q_u C_u
 *
 * with W(t) piecewise linear between sample times (held constant after the last), solved exactly on each
 * interval. At a constant loading it tends to the legacy box. SI units: s, m^3, kg.
 */

export interface TransientBoxInput {
  /** Mixing flow Q_mix = f Q_u + Q_gw, m^3/s. */
  mixFlow: number;
  /** Mixing volume V = f V_b, m^3 (positive: the box has storage). */
  mixVolume: number;
  /** First-order decay k, 1/s. */
  decay: number;
  /** Background loading B = f Q_u C_u, kg/s. Default 0. */
  backgroundLoading?: number;
  /** Sample times, s, strictly increasing. */
  times: readonly number[];
  /** Groundwater loading W at each sample time, kg/s. */
  loadings: readonly number[];
  /** Concentration at the first sample time, kg/m^3. Default: the steady state of the first loading. */
  initialConcentration?: number;
}

export interface TransientBoxResult {
  times: number[];
  /** C at each sample time, kg/m^3. */
  concentrations: number[];
  /** lambda_w = (Q_mix + k V) / V, 1/s. */
  rate: number;
  /** Hydraulic residence time 1 / lambda_w, s. */
  residenceTime: number;
  /** Initial concentration used, kg/m^3. */
  initialConcentration: number;
  /** C at any time (before the first sample: the initial concentration; after the last: the last loading held). */
  evaluate: (t: number) => number;
  /** Integral of C dt from the first sample time to t, kg s/m^3 (exact). */
  integral: (t: number) => number;
}

/** Exact solution of the box on [times[0], infinity) for the piecewise-linear loading. */
export function transientBox(i: TransientBoxInput): TransientBoxResult {
  checkNonNegative('mixing flow', i.mixFlow);
  checkPositive('mixing volume', i.mixVolume);
  checkNonNegative('decay rate', i.decay);
  const background = i.backgroundLoading ?? 0;
  checkNonNegative('background loading', background);
  checkTimes(i.times);
  if (i.loadings.length !== i.times.length) {
    throw new RangeError('one loading per time is required');
  }
  for (const w of i.loadings) checkNonNegative('loading', w);
  const rate = (i.mixFlow + i.decay * i.mixVolume) / i.mixVolume;
  if (!(rate > 0))
    throw new RangeError('the box has no flow and no decay: concentration undefined');
  const V = i.mixVolume;
  const n = i.times.length;
  const times = [...i.times];
  const w = [...i.loadings];
  const c0 = i.initialConcentration ?? (w[0]! + background) / (rate * V);
  checkNonNegative('initial concentration', c0);
  if (i.initialConcentration !== undefined) checkFinite('initial concentration', c0);

  // interval k starts at times[k] with slope s_k (0 after the last sample)
  const slope = (k: number): number =>
    k < n - 1 ? (w[k + 1]! - w[k]!) / (times[k + 1]! - times[k]!) : 0;
  const coeffs = (k: number): { a: number; b: number } => {
    const s = slope(k);
    return { b: s / (rate * V), a: (w[k]! + background - s / rate) / (rate * V) };
  };
  const conc: number[] = [c0];
  const cum: number[] = [0]; // integral of C from times[0] to times[k]
  for (let k = 0; k < n - 1; k++) {
    const { a, b } = coeffs(k);
    const tau = times[k + 1]! - times[k]!;
    const e = Math.exp(-rate * tau);
    conc.push(a + b * tau + (conc[k]! - a) * e);
    cum.push(cum[k]! + a * tau + (b * tau * tau) / 2 + ((conc[k]! - a) * (1 - e)) / rate);
  }
  const locate = (t: number): number => {
    let k = 0;
    while (k < n - 1 && t >= times[k + 1]!) k++;
    return k;
  };
  const evaluate = (t: number): number => {
    checkFinite('time', t);
    if (t <= times[0]!) return c0;
    const k = locate(t);
    const { a, b } = coeffs(k);
    const tau = t - times[k]!;
    return a + b * tau + (conc[k]! - a) * Math.exp(-rate * tau);
  };
  const integral = (t: number): number => {
    checkFinite('time', t);
    if (t <= times[0]!) return c0 * (t - times[0]!);
    const k = locate(t);
    const { a, b } = coeffs(k);
    const tau = t - times[k]!;
    return (
      cum[k]! +
      a * tau +
      (b * tau * tau) / 2 +
      ((conc[k]! - a) * (1 - Math.exp(-rate * tau))) / rate
    );
  };
  return {
    times,
    concentrations: conc,
    rate,
    residenceTime: 1 / rate,
    initialConcentration: c0,
    evaluate,
    integral,
  };
}
