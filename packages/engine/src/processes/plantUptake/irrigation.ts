import type { IrrigationSource } from '../irrigation/pathways.js';
import { checkFinite, checkNonNegative, type PlantWarning } from './checks.js';

/**
 * The irrigation interface of the plant uptake engines. Irrigation water can enter a plant two ways and
 * no other (soil build-up from irrigation belongs to the M7 soil model): as the root-zone water, which
 * replaces the soil pore water concentration, and as a foliar term, the intercepted fraction of the
 * applied mass, retained on the leaf and lost with the same first-order rate as everything else.
 */
export interface PlantIrrigationInput {
  /** Irrigation water concentration, mg/L. */
  concentration_mg_per_L: number;
  /** Water depth applied per day while irrigating, L/m^2/d (numerically mm/d). */
  applicationRate_L_per_m2_per_d: number;
  /** `user` when typed in, `m7` when taken from the M7 irrigation source. */
  source: 'user' | 'm7';
  /** Irrigation period within the year, days; carried from the M7 source, not applied by the engines. */
  season?: { startDay: number; endDay: number };
}

const SECONDS_PER_DAY = 86400;

/**
 * Evaluates the M7 `IrrigationSource` at a time (s) and converts it to the plant interface:
 * kg/m^3 to mg/L (times 1000) and m/s to L/m^2/d (times 86400 and 1000).
 */
export function irrigationInputFromSource(
  source: IrrigationSource,
  time_s: number,
): PlantIrrigationInput {
  checkNonNegative('time', time_s);
  const c = source.waterConcentration(time_s);
  checkNonNegative('irrigation water concentration', c);
  return {
    concentration_mg_per_L: c * 1e3,
    applicationRate_L_per_m2_per_d: source.applicationRate * SECONDS_PER_DAY * 1e3,
    source: 'm7',
    ...(source.season ? { season: { ...source.season } } : {}),
  };
}

export interface PlantIrrigationUse {
  input: PlantIrrigationInput;
  /** Use the irrigation water as the root-zone water (replaces the soil pore water). */
  rootZone?: boolean;
  /** Fraction of the applied water mass intercepted by the foliage, [0, 1]; with `plantedArea_m2`. */
  interceptionFraction?: number;
  /** Planted ground area the application reaches, m^2. */
  plantedArea_m2?: number;
}

export interface IrrigationTerms {
  /** Root-zone water concentration, kg/m^3, or undefined when irrigation does not replace pore water. */
  rootZone_kg_per_m3: number | undefined;
  /** Foliar source, kg/d. */
  foliar_kg_per_d: number;
  warnings: PlantWarning[];
}

export function irrigationTerms(use: PlantIrrigationUse): IrrigationTerms {
  const i = use.input;
  checkNonNegative('irrigation concentration', i.concentration_mg_per_L);
  checkNonNegative('irrigation application rate', i.applicationRate_L_per_m2_per_d);
  const cw = i.concentration_mg_per_L * 1e-3; // kg/m^3
  const warnings: PlantWarning[] = [];
  if (i.source === 'user') {
    warnings.push({
      code: 'IRRIGATION_USER_ENTERED',
      message: 'the irrigation input is user entered rather than from the M7 irrigation model',
    });
  }
  if (i.season !== undefined) {
    warnings.push({
      code: 'IRRIGATION_SEASON_NOT_APPLIED',
      message:
        'the irrigation season is not applied: the application is taken to cover the whole growing period',
    });
  }
  let foliar = 0;
  if (use.interceptionFraction !== undefined) {
    const f = use.interceptionFraction;
    checkFinite('interception fraction', f);
    if (f < 0 || f > 1) throw new RangeError('interception fraction must be in [0, 1]');
    if (use.plantedArea_m2 === undefined) {
      throw new RangeError('a foliar term needs the planted area');
    }
    checkNonNegative('planted area', use.plantedArea_m2);
    // mass per day = f * C_w [kg/m^3] * depth [m/d] * area [m^2]
    foliar = f * cw * (i.applicationRate_L_per_m2_per_d * 1e-3) * use.plantedArea_m2;
  }
  return {
    rootZone_kg_per_m3: use.rootZone ? cw : undefined,
    foliar_kg_per_d: foliar,
    warnings,
  };
}
