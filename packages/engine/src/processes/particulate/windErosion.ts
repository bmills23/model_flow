import { checkPos } from '../vapor/units.js';

/**
 * Wind erosion flux of the SSG (epa1996ssg equation 10, epa2002ssg equation 4-5; Cowherd 1985 form):
 * J = 0.036 (1 - V) (U_m / U_t)^3 F(x) in g/(m^2 h). Returned in SI, kg/(m^2 s).
 */
export interface WindErosionInput {
  /** Fraction of surface with vegetative cover, 0 to <1. */
  vegetativeCover: number;
  /** Mean annual wind speed, m/s. */
  meanWind: number;
  /** Equivalent threshold wind speed at 7 m, m/s. */
  thresholdWind: number;
  /** Function F(x), dimensionless (entered). */
  fx: number;
}

/** Guidance defaults verified in S0: V 0.5, U_m 4.69, U_t 11.32, F(x) 0.194. */
export const PARTICULATE_DEFAULTS: WindErosionInput = {
  vegetativeCover: 0.5,
  meanWind: 4.69,
  thresholdWind: 11.32,
  fx: 0.194,
};

export function windErosionFlux(p: WindErosionInput): number {
  if (!Number.isFinite(p.vegetativeCover) || p.vegetativeCover < 0 || p.vegetativeCover >= 1) {
    throw new RangeError(`vegetative cover must be in [0, 1), got ${p.vegetativeCover}`);
  }
  checkPos('mean wind speed', p.meanWind);
  checkPos('threshold wind speed', p.thresholdWind);
  checkPos('F(x)', p.fx);
  const gPerM2H = 0.036 * (1 - p.vegetativeCover) * (p.meanWind / p.thresholdWind) ** 3 * p.fx;
  return gPerM2H / 1000 / 3600;
}
