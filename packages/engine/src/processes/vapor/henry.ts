import { R_GAS_ATM, R_GAS_CAL, T_REF, atmToDimensionlessHenry, checkPos } from './units.js';

/**
 * Henry's constant at the system temperature (EPA 2004 Johnson and Ettinger guide, section 2.8).
 * Clapeyron relation with the Watson form for the enthalpy of vaporization. Enthalpies are in cal/mol
 * as EPA prints them; the gas constant is used in matching units, so the result is unit-consistent.
 */

/** Watson exponent m by the reduced boiling point T_B / T_C. */
export function watsonExponent(reducedBoilingPoint: number): number {
  const r = reducedBoilingPoint;
  if (!Number.isFinite(r) || !(r > 0 && r < 1)) {
    throw new RangeError(`T_B / T_C must be in (0, 1), got ${r}`);
  }
  if (r < 0.57) return 0.3;
  if (r <= 0.71) return 0.74 * r - 0.116;
  return 0.41;
}

/** Enthalpy of vaporization at T_S from the value at the normal boiling point (same unit out as in). */
export function vaporEnthalpyAtTemperature(
  dHvb: number,
  TS: number,
  TB: number,
  TC: number,
): number {
  checkPos('dHvb', dHvb);
  checkPos('TS', TS);
  checkPos('TB', TB);
  checkPos('TC', TC);
  if (!(TS < TC)) throw new RangeError(`system temperature ${TS} K must be below T_C ${TC} K`);
  if (!(TB < TC)) throw new RangeError(`T_B ${TB} K must be below T_C ${TC} K`);
  const m = watsonExponent(TB / TC);
  return dHvb * Math.pow((1 - TS / TC) / (1 - TB / TC), m);
}

export interface HenryTemperatureInput {
  /** Henry's constant at the reference temperature, atm m^3/mol. */
  HR: number;
  /** Enthalpy of vaporization at the normal boiling point, cal/mol. */
  dHvb: number;
  /** Normal boiling point, K. */
  TB: number;
  /** Critical temperature, K. */
  TC: number;
  /** System (soil or groundwater) temperature, K. */
  TS: number;
  /** Reference temperature, K (default 298.15). */
  TR?: number;
}

export interface HenryTemperatureResult {
  /** Enthalpy of vaporization at TS, cal/mol. */
  dHvTS: number;
  /** Henry's constant at TS, atm m^3/mol. */
  H: number;
  /** Dimensionless Henry's constant at TS. */
  Hprime: number;
}

export function henryAtTemperature(p: HenryTemperatureInput): HenryTemperatureResult {
  checkPos('HR', p.HR);
  const TR = p.TR ?? T_REF;
  checkPos('TR', TR);
  const dHvTS = vaporEnthalpyAtTemperature(p.dHvb, p.TS, p.TB, p.TC);
  const H = p.HR * Math.exp(-(dHvTS / R_GAS_CAL) * (1 / p.TS - 1 / TR));
  return { dHvTS, H, Hprime: H / (R_GAS_ATM * p.TS) };
}

export { atmToDimensionlessHenry };
