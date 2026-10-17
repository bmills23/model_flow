/**
 * Unit constants and boundary conversions for the vapor models. Engine units are SI: m, s, kg, Pa, K,
 * J/mol. Henry's constant is dimensionless (gas over water, both kg/m^3). RISC-style and EPA-style
 * units (g/(cm s^2), cal/mol, atm m^3/mol, deg C) appear only in the functions named here.
 */

/** Thermochemical calorie, J. */
export const CAL_TO_J = 4.184;
/** Gas constant, J/(mol K). */
export const R_GAS = 8.314462618;
/** Gas constant, atm m^3/(mol K). */
export const R_GAS_ATM = 8.205736608e-5;
/** Gas constant, cal/(mol K) (R / 4.184). */
export const R_GAS_CAL = R_GAS / CAL_TO_J;
/** Standard gravity, m/s^2. */
export const GRAVITY = 9.80665;
/** Reference temperature of tabulated Henry's constants, K (25 deg C). */
export const T_REF = 298.15;

export function celsiusToKelvin(c: number): number {
  return c + 273.15;
}

/** g/(cm s^2) (pressure) or g/(cm s) (dynamic viscosity) to Pa or Pa s: both are 0.1. */
export function convertGcmsToPa(x: number): number {
  return x * 0.1;
}

/** cm^2 (soil vapor permeability) to m^2. */
export function cm2ToM2(x: number): number {
  return x * 1e-4;
}

export function calPerMolToJPerMol(x: number): number {
  return x * CAL_TO_J;
}

/** Henry's constant in atm m^3/mol to the dimensionless H' at temperature T (K). */
export function atmToDimensionlessHenry(hAtm: number, T: number): number {
  return hAtm / (R_GAS_ATM * T);
}

/** Dimensionless Henry's constant to atm m^3/mol at temperature T (K). */
export function dimensionlessToAtmHenry(hPrime: number, T: number): number {
  return hPrime * R_GAS_ATM * T;
}

export function checkNonNeg(name: string, x: number): void {
  if (!Number.isFinite(x) || x < 0)
    throw new RangeError(`${name} must be finite and >= 0, got ${x}`);
}

export function checkPos(name: string, x: number): void {
  if (!Number.isFinite(x) || !(x > 0))
    throw new RangeError(`${name} must be finite and > 0, got ${x}`);
}
