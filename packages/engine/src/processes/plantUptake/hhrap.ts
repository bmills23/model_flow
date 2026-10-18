import { briggsRootConcentrationFactor, type Capped } from './briggs.js';
import {
  checkFinite,
  checkNonNegative,
  checkPositive,
  inorganicWarning,
  logKowWarning,
  type PlantWarning,
} from './checks.js';

/**
 * Produce concentrations from the EPA 2005 HHRAP equations (the fallback for the modern method, see
 * DECISIONS). All constants were read from the HHRAP chapter 5 and appendix A-2 PDFs on 2026-10-18.
 * Concentrations are dry weight (kg/kg DW), as HHRAP gives them.
 */
export const HHRAP_BR_LOGKOW_MIN = 1.15;
export const HHRAP_BR_LOGKOW_MAX = 9.35;
/** Moisture content of root vegetables used for the fresh to dry weight RCF conversion (A-2.12.1). */
export const HHRAP_ROOT_MOISTURE = 0.87;
/** Bacci et al. air-to-plant constants (A-2-19, A-2-20): air 1.19 g/L, forage 770 g/L, water fraction 0.85. */
export const HHRAP_AIR_DENSITY_KG_PER_M3 = 1.19;
const FORAGE_DENSITY_G_PER_L = 770;
const FORAGE_WATER_FRACTION = 0.85;
/** Bv is reduced by 100 for organics other than dioxins and furans (A-2.12.4). */
const BV_REDUCTION = 100;

/** Travis and Arms plant-soil factor (A-2-17), dry weight, log Kow capped at 1.15 and 9.35. */
export function hhrapPlantSoilBr(logKow: number): Capped {
  checkFinite('log Kow', logKow);
  const x = Math.min(Math.max(logKow, HHRAP_BR_LOGKOW_MIN), HHRAP_BR_LOGKOW_MAX);
  return { value: Math.pow(10, 1.588 - 0.578 * x), clamped: x !== logKow };
}

/** Air-to-plant Bv (A-2-19, A-2-20, then the factor of 100); kaw is the dimensionless H / (R T). */
export function hhrapAirToPlantBv(logKow: number, kaw: number): number {
  checkFinite('log Kow', logKow);
  checkPositive('Henry constant (dimensionless)', kaw);
  const bvol = Math.pow(10, 1.065 * logKow - Math.log10(kaw) - 1.654);
  const bv = (1.19 * bvol) / ((1 - FORAGE_WATER_FRACTION) * FORAGE_DENSITY_G_PER_L);
  return bv / BV_REDUCTION;
}

export type HhrapProduceClass = 'aboveground-exposed' | 'aboveground-protected' | 'root';

export interface HhrapProduceInput {
  logKow: number;
  /** Dimensionless Henry constant; required for exposed produce with a vapor air concentration. */
  kaw?: number;
  /** Soil-water partition coefficient, m^3/kg (needed for root produce). */
  kd_m3_per_kg: number;
  soilConcentration_kg_per_kg: number;
  /** Vapor-phase air concentration, kg/m^3 (zero when no vapor run exists). */
  vaporAirConcentration_kg_per_m3?: number;
  produce: HhrapProduceClass;
  /** User plant-soil BCF (kg/kg DW) replacing Br, required for an inorganic. */
  userBr?: number;
  inorganic?: boolean;
}

export interface HhrapProduceResult {
  rootUptake_kg_per_kg_dw: number | null;
  vaporTransfer_kg_per_kg_dw: number | null;
  total_kg_per_kg_dw: number | null;
  warnings: PlantWarning[];
}

/** Empirical correction factor: 0.01 for log Kow above 4, else 1.0 (HHRAP 5.3.2.1 and 5.3.3). */
export const hhrapVg = (logKow: number): number => (logKow > 4 ? 0.01 : 1.0);

export function hhrapProduce(input: HhrapProduceInput): HhrapProduceResult {
  checkNonNegative('soil concentration', input.soilConcentration_kg_per_kg);
  const warnings: PlantWarning[] = [];
  const air = input.vaporAirConcentration_kg_per_m3 ?? 0;
  checkNonNegative('vapor air concentration', air);

  if (input.inorganic && input.userBr === undefined) {
    return {
      rootUptake_kg_per_kg_dw: null,
      vaporTransfer_kg_per_kg_dw: null,
      total_kg_per_kg_dw: null,
      warnings: [inorganicWarning()],
    };
  }

  let root: number;
  if (input.produce === 'root' && input.userBr === undefined) {
    checkPositive('Kd', input.kd_m3_per_kg);
    const rcf = briggsRootConcentrationFactor(input.logKow);
    if (rcf.clamped) warnings.push(logKowWarning('-0.57 to 8.2, the HHRAP capping range for RCF'));
    const rcfDw = rcf.value / (1 - HHRAP_ROOT_MOISTURE);
    // Equation 5-20B: Cs RCF VG / (Kd 1 kg/L), with Kd in L/kg.
    root =
      (input.soilConcentration_kg_per_kg * rcfDw * hhrapVg(input.logKow)) /
      (input.kd_m3_per_kg * 1000);
  } else if (input.userBr !== undefined) {
    checkNonNegative('user plant-soil BCF', input.userBr);
    root = input.soilConcentration_kg_per_kg * input.userBr;
  } else {
    const br = hhrapPlantSoilBr(input.logKow);
    if (br.clamped) warnings.push(logKowWarning('1.15 to 9.35, the HHRAP capping range for Br'));
    root = input.soilConcentration_kg_per_kg * br.value; // Equation 5-20A
  }

  let vapor = 0;
  if (input.produce === 'aboveground-exposed' && air > 0) {
    if (input.kaw === undefined)
      throw new RangeError('exposed produce with a vapor air concentration needs kaw');
    vapor =
      (air * hhrapAirToPlantBv(input.logKow, input.kaw) * hhrapVg(input.logKow)) /
      HHRAP_AIR_DENSITY_KG_PER_M3; // Equation 5-18 with the vapor air concentration
  }
  return {
    rootUptake_kg_per_kg_dw: root,
    vaporTransfer_kg_per_kg_dw: vapor,
    total_kg_per_kg_dw: root + vapor,
    warnings,
  };
}
