/**
 * Unit conversions and shared types for the exposure kernels (legacy and modern).
 *
 * Engine units are SI: kg, m, s. Concentrations are kg/kg (soil) and kg/m^3 (water, air); contact
 * rates are m^3/s or kg/s; skin area m^2; adherence kg/m^2; permeability m/s; dose rates are kg per kg
 * body weight per second; slope factors are their reciprocal; reference doses are kg/(kg s);
 * inhalation unit risk is m^3/kg; reference concentration is kg/m^3. Times written as a share of a day
 * or a year are dimensionless fractions. RISC-style and RSL-style units appear only in the functions
 * named below, which sit at the input and output boundaries.
 *
 * Exposure years are 365 days, the convention of every guidance document cited for M4, and not the
 * 365.25-day year of the transport time axis (`numerics/units`).
 */

export const DAY_S = 86400;
export const DAYS_PER_YEAR = 365;
/** One exposure year, 365 days, in seconds. */
export const YEAR_S = DAYS_PER_YEAR * DAY_S;
/** Conventional lifetime for cancer averaging, years. */
export const LIFETIME_YEARS = 70;

/** The nine direct exposure pathways of M4. */
export const PATHWAY_IDS = [
  'soilIngestion',
  'soilDermal',
  'waterIngestion',
  'waterDermal',
  'showerInhalation',
  'indoorInhalation',
  'outdoorInhalation',
  'swimIngestion',
  'swimDermal',
] as const;
export type PathwayId = (typeof PATHWAY_IDS)[number];

export type Medium =
  'soil' | 'groundwater' | 'bathroomAir' | 'indoorAir' | 'outdoorAir' | 'surfaceWater';
export type Route = 'oral' | 'dermal' | 'inhalation';

export interface PathwayInfo {
  medium: Medium;
  route: Route;
  /** Boundary unit of the EPC (documentation, not used in arithmetic). */
  epcUnit: 'mg/kg' | 'mg/L' | 'mg/m3';
}

export const PATHWAYS: Record<PathwayId, PathwayInfo> = {
  soilIngestion: { medium: 'soil', route: 'oral', epcUnit: 'mg/kg' },
  soilDermal: { medium: 'soil', route: 'dermal', epcUnit: 'mg/kg' },
  waterIngestion: { medium: 'groundwater', route: 'oral', epcUnit: 'mg/L' },
  waterDermal: { medium: 'groundwater', route: 'dermal', epcUnit: 'mg/L' },
  showerInhalation: { medium: 'bathroomAir', route: 'inhalation', epcUnit: 'mg/m3' },
  indoorInhalation: { medium: 'indoorAir', route: 'inhalation', epcUnit: 'mg/m3' },
  outdoorInhalation: { medium: 'outdoorAir', route: 'inhalation', epcUnit: 'mg/m3' },
  swimIngestion: { medium: 'surfaceWater', route: 'oral', epcUnit: 'mg/L' },
  swimDermal: { medium: 'surfaceWater', route: 'dermal', epcUnit: 'mg/L' },
};

/**
 * An exposure point concentration series, SI: sample times in s (strictly increasing, not negative)
 * and concentrations in kg/kg or kg/m^3, linear between samples.
 */
export interface EpcSeries {
  times: readonly number[];
  values: readonly number[];
}

/** Where an EPC came from: `entered` by the user, or the id of the method that produced it. */
export type EpcOrigin = 'entered' | (string & {});

/** Chemical toxicity values in SI. Any may be absent (no value is "not quantified", never zero). */
export interface ToxicityValues {
  /** Oral slope factor, (kg/(kg s))^-1. */
  sfo?: number;
  /** Oral reference dose, kg/(kg s). */
  rfdo?: number;
  /** Inhalation unit risk, m^3/kg. */
  iur?: number;
  /** Inhalation reference concentration, kg/m^3. */
  rfc?: number;
}

// ---- Boundary conversions: into the engine ----

export const mgPerKgToKgPerKg = (x: number): number => x * 1e-6;
export const mgPerLToKgPerM3 = (x: number): number => x * 1e-3;
export const ugPerLToKgPerM3 = (x: number): number => x * 1e-6;
export const mgPerM3ToKgPerM3 = (x: number): number => x * 1e-6;
export const ugPerM3ToKgPerM3 = (x: number): number => x * 1e-9;
export const lPerDayToM3PerS = (x: number): number => (x * 1e-3) / DAY_S;
export const mgPerDayToKgPerS = (x: number): number => (x * 1e-6) / DAY_S;
export const m3PerHourToM3PerS = (x: number): number => x / 3600;
export const m3PerDayToM3PerS = (x: number): number => x / DAY_S;
export const mlPerHourToM3PerS = (x: number): number => (x * 1e-6) / 3600;
export const lPerHourToM3PerS = (x: number): number => (x * 1e-3) / 3600;
export const cm2ToM2 = (x: number): number => x * 1e-4;
export const mgPerCm2ToKgPerM2 = (x: number): number => x * 1e-2;
export const cmPerHourToMPerS = (x: number): number => (x * 1e-2) / 3600;
export const hoursToSeconds = (x: number): number => x * 3600;
/** Hours of exposure per day, as a fraction of the day. */
export const hoursPerDayToFraction = (x: number): number => x / 24;
/** Exposure frequency in days per year, as a fraction of the 365-day year. */
export const daysPerYearToFraction = (x: number): number => x / DAYS_PER_YEAR;
/** Years (365 days) to seconds. */
export const yearsToSeconds = (x: number): number => x * YEAR_S;

/** Dose in mg/kg-d to kg/(kg s). */
export const doseFromMgPerKgDay = (x: number): number => (x * 1e-6) / DAY_S;
/** Reference dose in mg/kg-d to kg/(kg s). */
export const rfdFromMgPerKgDay = doseFromMgPerKgDay;
/** Slope factor in (mg/kg-d)^-1 to (kg/(kg s))^-1. */
export const sfFromPerMgKgDay = (x: number): number => (x * DAY_S) / 1e-6;
/** Inhalation unit risk in (ug/m^3)^-1 to m^3/kg. */
export const iurFromPerUgM3 = (x: number): number => x * 1e9;
/** Reference concentration in mg/m^3 to kg/m^3. */
export const rfcFromMgPerM3 = (x: number): number => x * 1e-6;

// ---- Boundary conversions: out of the engine ----

/** Dose in kg/(kg s) to mg/kg-d. */
export const doseToMgPerKgDay = (x: number): number => x * 1e6 * DAY_S;
/** Slope factor in (kg/(kg s))^-1 to (mg/kg-d)^-1. */
export const sfToPerMgKgDay = (x: number): number => (x * 1e-6) / DAY_S;
export const kgPerM3ToMgPerL = (x: number): number => x * 1e3;
export const kgPerM3ToMgPerM3 = (x: number): number => x * 1e6;
export const kgPerKgToMgPerKg = (x: number): number => x * 1e6;

// ---- Inhalation as a dose (legacy method) ----

/** Standard adult body weight of the 1991 default exposure factors, kg. */
export const STANDARD_ADULT_BW = 70;
/** Standard adult inhalation rate of the 1991 default exposure factors, 20 m^3/d, in m^3/s. */
export const STANDARD_ADULT_INHALATION = m3PerDayToM3PerS(20);

/**
 * Inhalation slope factor from an IUR for a stated breathing rate and body weight: a concentration C
 * gives a dose C ir / bw, so SFi = IUR bw / ir, (kg/(kg s))^-1 for IUR in m^3/kg, ir in m^3/s, bw in kg.
 */
export const sfiFromIur = (iur: number, ir: number, bw: number): number => (iur * bw) / ir;
/** Inhalation reference dose from an RfC: RfDi = RfC ir / bw, kg/(kg s). */
export const rfdiFromRfc = (rfc: number, ir: number, bw: number): number => (rfc * ir) / bw;
