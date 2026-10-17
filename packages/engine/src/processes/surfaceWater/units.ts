/**
 * Unit conversions for the surface water kernels (M8).
 *
 * Engine units are SI: kg, m, s. Flows m^3/s, water concentrations kg/m^3, loadings kg/s, bed
 * conductivity m/s, decay 1/s, Kd and Koc m^3/kg, sediment concentration kg/kg. RISC-style units
 * (m^3/d, mg/L, mg/d, m/d, 1/d, L/kg, mg/kg) appear only in the functions named here, which sit at the
 * input and output boundaries. Days are 86,400 s.
 */

export const DAY_S = 86400;

/** m^3/d (or m/d) to m^3/s (or m/s). */
export const perDayToPerSecond = (x: number): number => x / DAY_S;
/** 1/d to 1/s. */
export const ratePerDayToPerSecond = (x: number): number => x / DAY_S;
/** 1/s to 1/d. */
export const ratePerSecondToPerDay = (x: number): number => x * DAY_S;
/** m^3/s to m^3/d. */
export const flowToCubicMetresPerDay = (x: number): number => x * DAY_S;
/** mg/L to kg/m^3 (numerically equal to g/m^3 over 1000: 1 mg/L = 1e-3 kg/m^3). */
export const mgPerLToKgPerM3 = (x: number): number => x * 1e-3;
/** kg/m^3 to mg/L. */
export const kgPerM3ToMgPerL = (x: number): number => x * 1e3;
/** ug/L to kg/m^3 (the unit EPA publishes water quality criteria in). */
export const ugPerLToKgPerM3 = (x: number): number => x * 1e-6;
/** kg/s to mg/d. */
export const kgPerSToMgPerDay = (x: number): number => x * 1e6 * DAY_S;
/** L/kg (equal to mL/g) to m^3/kg. */
export const lPerKgToM3PerKg = (x: number): number => x * 1e-3;
/** m^3/kg to L/kg. */
export const m3PerKgToLPerKg = (x: number): number => x * 1e3;
/** mg/kg to kg/kg. */
export const mgPerKgToKgPerKg = (x: number): number => x * 1e-6;
/** kg/kg to mg/kg. */
export const kgPerKgToMgPerKg = (x: number): number => x * 1e6;
