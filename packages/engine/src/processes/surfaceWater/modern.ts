import {
  aboveSolubilityWarning,
  checkNonNegative,
  lowDilutionWarning,
  type SurfaceWaterWarning,
} from './checks.js';
import { sedimentConcentration, type SedimentResult } from './sediment.js';

/** Which water the bed sediment equilibrates with in the modern method (DEFAULT ruling 8). */
export type PoreWaterSource = 'discharge' | 'centreline' | 'surface';

export interface ModernSedimentInput {
  /** `discharge`: flux-averaged discharging groundwater W / Q_gw (default); `centreline`: the legacy reading; `surface`: the mixed surface water. */
  poreWater?: PoreWaterSource;
  /** Flux-averaged groundwater concentration at the bank, kg/m^3. */
  dischargeConcentration?: number;
  /** Centreline (screen-averaged) groundwater concentration at the bank, kg/m^3. */
  centrelineConcentration?: number;
  /** Mixed surface water concentration, kg/m^3. */
  surfaceConcentration?: number;
  /** Fraction organic carbon f_oc, kg/kg. */
  fractionOrganicCarbon: number;
  /** Koc, m^3/kg, when the database has one. */
  koc?: number;
  /** Database Kd, m^3/kg, used when there is no Koc. */
  kd?: number;
}

export interface ModernSedimentResult extends SedimentResult {
  poreWater: PoreWaterSource;
  /** The pore water concentration used, kg/m^3. */
  poreWaterConcentration: number;
}

/**
 * Equilibrium-partitioning sediment, C_sed = Kd C_pw, with a selectable pore water; also reports the
 * organic-carbon-normalized concentration when Kd came from a Koc. A selected source with no value is a
 * RangeError.
 */
export function modernSediment(i: ModernSedimentInput): ModernSedimentResult {
  const poreWater = i.poreWater ?? 'discharge';
  const value =
    poreWater === 'discharge'
      ? i.dischargeConcentration
      : poreWater === 'centreline'
        ? i.centrelineConcentration
        : i.surfaceConcentration;
  if (value === undefined) {
    throw new RangeError(`the ${poreWater} pore water concentration was not provided`);
  }
  checkNonNegative('pore water concentration', value);
  const r = sedimentConcentration({
    poreWaterConcentration: value,
    fractionOrganicCarbon: i.fractionOrganicCarbon,
    ...(i.koc !== undefined ? { koc: i.koc } : {}),
    ...(i.kd !== undefined ? { kd: i.kd } : {}),
  });
  return { ...r, poreWater, poreWaterConcentration: value };
}

export interface ModernWarningInput {
  groundwaterFlow: number;
  mixingFraction: number;
  upstreamFlow: number;
  /** Largest flux-averaged groundwater concentration, kg/m^3. */
  peakGroundwaterConcentration: number;
  /** Largest surface water concentration, kg/m^3. */
  peakSurfaceConcentration: number;
  /** Solubility, kg/m^3. */
  solubility?: number;
}

/** The warnings the modern method shares with the legacy one (low dilution, above solubility). */
export function modernWarnings(i: ModernWarningInput): SurfaceWaterWarning[] {
  return [
    ...lowDilutionWarning(i.groundwaterFlow, i.mixingFraction, i.upstreamFlow),
    ...aboveSolubilityWarning(
      'groundwater concentration',
      i.peakGroundwaterConcentration,
      i.solubility,
    ),
    ...aboveSolubilityWarning(
      'surface water concentration',
      i.peakSurfaceConcentration,
      i.solubility,
    ),
  ];
}
