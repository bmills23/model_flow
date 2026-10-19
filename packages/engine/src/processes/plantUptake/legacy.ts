import {
  BRIGGS_FIT_LOGKOW_MAX,
  BRIGGS_LOGKOW_MIN,
  briggsRootConcentrationFactor,
} from './briggs.js';
import {
  checkFinite,
  checkNonNegative,
  checkPositive,
  inorganicWarning,
  ionizableWarning,
  logKowWarning,
  type PlantWarning,
} from './checks.js';
import { leafSteadyState, leafTimeDependent, type LeafParameters } from './leaf.js';
import { irrigationTerms, type PlantIrrigationUse } from './irrigation.js';
import { poreWaterConcentration } from './partition.js';

export interface LegacyPlantInput {
  logKow: number;
  soil: {
    concentration_kg_per_kg: number;
    bulkDensity_kg_per_m3: number;
    waterFilledPorosity: number;
    kd_m3_per_kg: number;
  };
  /** Gas-phase air concentration, kg/m^3 (zero when there is no vapor run). */
  airConcentration_kg_per_m3?: number;
  produce: 'root' | 'aboveground';
  /** Leaf model parameters (TSCF and K_la are user inputs). Used for above-ground produce. */
  leaf: LeafParameters;
  /** Growing period, d; omitted means steady state. */
  growthPeriod_d?: number;
  /** Root-zone water concentration replacing the soil pore water (irrigation interface option). */
  rootZoneWater_kg_per_m3?: number;
  /**
   * Irrigation water as a plant source (the M9 interface fed from the M7 `IrrigationSource` or typed in):
   * the root-zone water option replaces `rootZoneWater_kg_per_m3` and the soil pore water, and a foliar
   * term adds the intercepted applied mass to the above-ground leaf.
   */
  irrigation?: PlantIrrigationUse;
  ionizable?: boolean;
  inorganic?: boolean;
  /** User bioconcentration factor, kg/kg soil to kg/kg plant (fresh weight); required for an inorganic. */
  userBcf?: number;
}

export interface LegacyPlantResult {
  poreWater_kg_per_m3: number;
  /** Fresh-weight plant concentration, kg/kg; null when not quantified. */
  concentration_kg_per_kg: number | null;
  warnings: PlantWarning[];
}

/** Briggs root factor times pore water for roots; the one-compartment leaf model for above-ground produce. */
export function legacyPlantUptake(input: LegacyPlantInput): LegacyPlantResult {
  checkFinite('log Kow', input.logKow);
  const s = input.soil;
  const air = input.airConcentration_kg_per_m3 ?? 0;
  checkNonNegative('air concentration', air);
  const warnings: PlantWarning[] = [];
  if (input.ionizable) warnings.push(ionizableWarning());

  const irr = input.irrigation === undefined ? undefined : irrigationTerms(input.irrigation);
  if (irr !== undefined) warnings.push(...irr.warnings);
  const rootZone = irr?.rootZone_kg_per_m3 ?? input.rootZoneWater_kg_per_m3;
  const pw =
    rootZone !== undefined
      ? rootZone
      : poreWaterConcentration(
          s.concentration_kg_per_kg,
          s.bulkDensity_kg_per_m3,
          s.waterFilledPorosity,
          s.kd_m3_per_kg,
        );
  checkNonNegative('root-zone water concentration', pw);

  if (input.inorganic) {
    if (input.userBcf === undefined) {
      warnings.push(inorganicWarning());
      return { poreWater_kg_per_m3: pw, concentration_kg_per_kg: null, warnings };
    }
    checkNonNegative('user BCF', input.userBcf);
    return {
      poreWater_kg_per_m3: pw,
      concentration_kg_per_kg: input.userBcf * s.concentration_kg_per_kg,
      warnings,
    };
  }

  if (input.logKow < BRIGGS_LOGKOW_MIN || input.logKow > BRIGGS_FIT_LOGKOW_MAX) {
    warnings.push(logKowWarning(`${BRIGGS_LOGKOW_MIN} to ${BRIGGS_FIT_LOGKOW_MAX}`));
  }

  if (input.produce === 'root') {
    // RCF is in L/kg: kg/kg = RCF [L/kg] * 1e-3 [m^3/L] * C_pw [kg/m^3].
    const rcf = briggsRootConcentrationFactor(input.logKow).value;
    return { poreWater_kg_per_m3: pw, concentration_kg_per_kg: rcf * 1e-3 * pw, warnings };
  }

  const foliar = irr?.foliar_kg_per_d ?? 0;
  const ss = leafSteadyState(input.leaf, pw, air, foliar);
  if (input.growthPeriod_d === undefined) {
    return { poreWater_kg_per_m3: pw, concentration_kg_per_kg: ss.concentration, warnings };
  }
  checkPositive('growing period', input.growthPeriod_d);
  if (input.growthPeriod_d < 3 * ss.timeConstant_d) {
    warnings.push({
      code: 'PLANT_NOT_STEADY',
      message:
        'the growing period is shorter than three time constants, so the steady state would overstate the harvest concentration; the time-dependent value is reported',
    });
  }
  return {
    poreWater_kg_per_m3: pw,
    concentration_kg_per_kg: leafTimeDependent(input.leaf, pw, air, input.growthPeriod_d, 0, foliar)
      .concentration,
    warnings,
  };
}
