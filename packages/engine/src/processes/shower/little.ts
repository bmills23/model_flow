import { checkNonNeg } from '../vapor/units.js';
import {
  checkShower,
  showerDropletFraction,
  type ShowerInput,
  type ShowerResult,
} from './common.js';

/** 1 - (1 - e^-x) / x, computed by series for small x to avoid cancellation. */
function oneMinusMeanDecay(x: number): number {
  if (x >= 0.5) return 1 - -Math.expm1(-x) / x;
  let term = x / 2; // k = 1: x^1 / 2!
  let sum = term;
  for (let k = 2; k <= 20; k++) {
    term *= -x / (k + 1);
    sum += term;
  }
  return sum;
}

export interface LittleInput extends ShowerInput {
  /** Stall ventilation flow, m^3/s (0 allowed). */
  gasFlow: number;
  /** Time in the stall after the water is off, s (default 0). */
  postShowerTime?: number;
}

export interface LittleResult extends ShowerResult {
  /** Air concentration at the end of the shower, kg/m^3. */
  endConcentration: number;
}

/**
 * Two-resistance stall with gas-phase back-pressure and ventilation (our statement of the mass balance
 * in the methods note, not a transcription of the paper). dC/dt = alpha - beta C with
 * alpha = Q_w f C_w / V_s and beta = (Q_w f / H + Q_g) / V_s, f = 1 - exp(-N).
 */
export function showerLittle(p: LittleInput): LittleResult {
  checkShower(p);
  checkNonNeg('stall ventilation flow', p.gasFlow);
  const post = p.postShowerTime ?? 0;
  checkNonNeg('post-shower time', post);
  const { fv, warnings } = showerDropletFraction(p);
  const qf = p.waterFlow * fv;
  // Per unit water concentration: aOverB = steady stall level, beta the relaxation rate.
  const beta = (qf / p.henry + p.gasFlow) / p.stallVolume;
  if (beta === 0) {
    // No transfer at all (f = 0, no ventilation): the air stays clean.
    return {
      concentration: 0,
      coefficient: 0,
      endConcentration: 0,
      exposureTime: p.showerTime + post,
      warnings,
    };
  }
  const aOverB = qf / (qf / p.henry + p.gasFlow); // per unit C_w
  const x = beta * p.showerTime;
  const end = aOverB * -Math.expm1(-x);
  // integral of C over the shower: (a/b)(t - (1 - e^-x)/b)
  const integralShower = aOverB * p.showerTime * oneMinusMeanDecay(x);
  let integralPost = 0;
  if (post > 0) {
    const gamma = p.gasFlow / p.stallVolume;
    integralPost = gamma === 0 ? end * post : (end * -Math.expm1(-gamma * post)) / gamma;
  }
  const exposureTime = p.showerTime + post;
  const coefficient = (integralShower + integralPost) / exposureTime;
  return {
    concentration: coefficient * p.waterConcentration,
    coefficient,
    endConcentration: end * p.waterConcentration,
    exposureTime,
    warnings,
  };
}
