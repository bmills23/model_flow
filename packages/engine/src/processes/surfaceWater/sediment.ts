import { checkNonNegative, type SurfaceWaterWarning } from './checks.js';

/** Equilibrium-partitioning sediment concentration, C_sed = Kd C_pw (methods note, "Sediment"). */

export interface SedimentInput {
  /** Pore water concentration, kg/m^3. */
  poreWaterConcentration: number;
  /** Fraction organic carbon f_oc, kg/kg. */
  fractionOrganicCarbon: number;
  /** Organic carbon partition coefficient Koc, m^3/kg, when the database has one. */
  koc?: number;
  /** Database Kd, m^3/kg, used when there is no Koc. */
  kd?: number;
}

export interface SedimentResult {
  /** True when a Kd could be formed. */
  quantified: boolean;
  /** Kd used, m^3/kg (undefined when not quantified). */
  kd?: number;
  /** C_sed, kg/kg dry weight (undefined when not quantified, never zero). */
  concentration?: number;
  /** C_sed / f_oc, kg/kg organic carbon, only when Kd came from a Koc and f_oc is positive. */
  organicCarbonNormalized?: number;
  warnings: SurfaceWaterWarning[];
}

/** Kd = f_oc Koc when the chemical has a Koc, otherwise the database Kd; neither is not quantified. */
export function sedimentConcentration(i: SedimentInput): SedimentResult {
  checkNonNegative('pore water concentration', i.poreWaterConcentration);
  if (
    !Number.isFinite(i.fractionOrganicCarbon) ||
    i.fractionOrganicCarbon < 0 ||
    i.fractionOrganicCarbon > 1
  ) {
    throw new RangeError('fraction organic carbon must be in [0, 1]');
  }
  if (i.koc !== undefined) checkNonNegative('Koc', i.koc);
  if (i.kd !== undefined) checkNonNegative('Kd', i.kd);
  let kd: number;
  let fromKoc = false;
  if (i.koc !== undefined) {
    kd = i.fractionOrganicCarbon * i.koc;
    fromKoc = true;
  } else if (i.kd !== undefined) {
    kd = i.kd;
  } else {
    return {
      quantified: false,
      warnings: [
        {
          code: 'surfaceWater.sediment-not-quantified',
          message: 'the chemical has neither a Koc nor a Kd, so sediment is not quantified',
        },
      ],
    };
  }
  const concentration = kd * i.poreWaterConcentration;
  const result: SedimentResult = { quantified: true, kd, concentration, warnings: [] };
  if (fromKoc && i.fractionOrganicCarbon > 0) {
    result.organicCarbonNormalized = concentration / i.fractionOrganicCarbon;
  }
  return result;
}
