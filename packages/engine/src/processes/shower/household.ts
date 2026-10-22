import type { Warning } from '../../registry/index.js';
import { checkNonNeg } from '../vapor/units.js';

/**
 * RSL volatility criterion (RSL user's guide section 4.9.4, verified in S0): a chemical is volatile when
 * its Henry's law constant exceeds 1E-5 atm m^3/mol or its vapor pressure exceeds 1 mm Hg.
 */
export function rslVolatile(p: { henryAtmM3PerMol?: number; vaporPressureMmHg?: number }): boolean {
  return (
    (p.henryAtmM3PerMol !== undefined && p.henryAtmM3PerMol > 1e-5) ||
    (p.vaporPressureMmHg !== undefined && p.vaporPressureMmHg > 1)
  );
}

export interface HouseholdInput {
  /** Tap water concentration, kg/m^3. */
  waterConcentration: number;
  /**
   * Water-to-indoor-air transfer factor K, L water per m^3 air. Required: S0 could not verify the RSL
   * value from a primary page, so no default is supplied.
   */
  transferFactorLPerM3: number;
  /** Result of `rslVolatile` (or the user's override). */
  volatile: boolean;
}

export interface HouseholdResult {
  concentration: number;
  coefficient: number;
  warnings: Warning[];
}

/** Whole-house air from tap water, C_a = C_w K, with K in L/m^3 converted to kg/m^3 per kg/m^3 (K / 1000). */
export function showerHouseholdAir(p: HouseholdInput): HouseholdResult {
  checkNonNeg('water concentration', p.waterConcentration);
  checkNonNeg('household transfer factor', p.transferFactorLPerM3);
  const warnings: Warning[] = [
    {
      code: 'shower.household-factor-unverified',
      message:
        "The household transfer factor K is an entered value, not verified against a primary page of the RSL documentation. Entered as 0.5 L/m3 (table 1 of the archived RSL user's guide) it reproduces the tap water inhalation screening levels of the RSL November 2024 table, all but the trichloroethylene and vinyl chloride cells (see the validation page).",
    },
  ];
  if (!p.volatile) {
    warnings.push({
      code: 'shower.not-volatile',
      message:
        'The chemical fails the RSL volatility criterion; the household inhalation term is zero.',
    });
    return { concentration: 0, coefficient: 0, warnings };
  }
  const coefficient = p.transferFactorLPerM3 / 1000;
  return { concentration: coefficient * p.waterConcentration, coefficient, warnings };
}
