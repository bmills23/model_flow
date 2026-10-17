import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { henryAtTemperature, type HenryTemperatureInput } from './henry.js';
import { checkNonNeg, checkPos } from './units.js';

/**
 * Empirical attenuation factors for vapor intrusion screening (EPA 2015 technical guide, Table 6-1;
 * the VISL calculator applies the same factors). C_in = AF x (vapor concentration of the medium); for
 * groundwater the vapor is the equilibrium vapor H'(T_gw) C_gw. SI throughout.
 */

/** Feet to metres, exact. The guides publish their distance thresholds in feet. */
export const FEET_TO_METRES = 0.3048;

/** Generic residential attenuation factors, EPA 2015 Table 6-1. */
export const ATTENUATION_FACTORS = {
  groundwater: 0.001,
  groundwaterFineGrained: 0.0005,
  subSlabSoilGas: 0.03,
  exteriorSoilGas: 0.03,
  crawlspace: 1.0,
} as const;

export type AttenuationMedium = keyof typeof ATTENUATION_FACTORS;

/** Minimum depth of the source below the foundation for the generic factors to apply, 5 ft. */
export const AF_MIN_SEPARATION = 5 * FEET_TO_METRES;

const isGroundwater = (m: AttenuationMedium): boolean =>
  m === 'groundwater' || m === 'groundwaterFineGrained';

export interface AttenuationFactorInput {
  medium: AttenuationMedium;
  /** Groundwater concentration (kg/m^3) or vapor concentration of the medium (kg/m^3). */
  concentration: number;
  /** Dimensionless Henry's constant at the groundwater temperature (groundwater media). */
  H?: number;
  /** Thermodynamic data to compute H prime at the groundwater temperature (used when H is absent). */
  henry?: HenryTemperatureInput;
  /** Depth of the water table or vadose source below the foundation, m (shallow-source warning). */
  depthBelowFoundation?: number;
  /** User flag: preferential pathways are present. */
  preferentialPathway?: boolean;
}

export interface AttenuationFactorResult {
  factor: number;
  /** H prime used (groundwater media). */
  hPrime?: number;
  /** Vapor concentration the factor acts on, kg/m^3. */
  sourceVapor: number;
  /** Indoor air concentration, kg/m^3. */
  indoorAir: number;
  warnings: Warning[];
}

function hPrimeOf(p: { H?: number; henry?: HenryTemperatureInput }): number {
  if (p.H !== undefined) {
    checkPos('H', p.H);
    return p.H;
  }
  if (p.henry !== undefined) return henryAtTemperature(p.henry).Hprime;
  throw new RangeError("groundwater media need H (dimensionless Henry's constant) or henry data");
}

function applicabilityWarnings(p: {
  medium: AttenuationMedium;
  depthBelowFoundation?: number;
  preferentialPathway?: boolean;
}): Warning[] {
  const warnings: Warning[] = [];
  if (p.medium === 'groundwaterFineGrained') {
    warnings.push({
      code: 'vapor.af-fine-grained',
      message:
        'the lower groundwater factor applies only to fine-grained, laterally extensive vadose soils; confirm this with site geology',
    });
  }
  if (p.depthBelowFoundation !== undefined) {
    checkNonNeg('depthBelowFoundation', p.depthBelowFoundation);
    const applies = isGroundwater(p.medium) || p.medium === 'exteriorSoilGas';
    if (applies && p.depthBelowFoundation < AF_MIN_SEPARATION) {
      warnings.push({
        code: 'vapor.af-shallow-source',
        message: `the source is ${p.depthBelowFoundation / FEET_TO_METRES} ft below the foundation; the generic attenuation factors are not intended for a source less than 5 ft below it`,
      });
    }
  }
  if (p.preferentialPathway) {
    warnings.push({
      code: 'vapor.af-preferential-pathway',
      message:
        'preferential pathways are present; the generic attenuation factors do not account for them',
    });
  }
  return warnings;
}

export function attenuationFactorRun(input: AttenuationFactorInput): AttenuationFactorResult {
  checkNonNeg('concentration', input.concentration);
  const factor = ATTENUATION_FACTORS[input.medium];
  const warnings = applicabilityWarnings(input);
  if (isGroundwater(input.medium)) {
    const hPrime = hPrimeOf(input);
    const sourceVapor = hPrime * input.concentration;
    return { factor, hPrime, sourceVapor, indoorAir: factor * sourceVapor, warnings };
  }
  return {
    factor,
    sourceVapor: input.concentration,
    indoorAir: factor * input.concentration,
    warnings,
  };
}

export interface AttenuationScreeningInput {
  medium: AttenuationMedium;
  /** Target indoor air concentration, kg/m^3. */
  targetIndoorAir: number;
  H?: number;
  henry?: HenryTemperatureInput;
}

export interface AttenuationScreeningResult {
  /** Concentration in the medium (groundwater kg/m^3, or vapor kg/m^3) giving the target indoor air. */
  screeningLevel: number;
  factor: number;
  hPrime?: number;
}

/** Inverse of the forward run: the medium concentration whose indoor air equals the target. */
export function attenuationFactorScreeningLevel(
  input: AttenuationScreeningInput,
): AttenuationScreeningResult {
  checkNonNeg('targetIndoorAir', input.targetIndoorAir);
  const factor = ATTENUATION_FACTORS[input.medium];
  if (isGroundwater(input.medium)) {
    const hPrime = hPrimeOf(input);
    return { screeningLevel: input.targetIndoorAir / (factor * hPrime), factor, hPrime };
  }
  return { screeningLevel: input.targetIndoorAir / factor, factor };
}

export const vaporAttenuationFactor2015: MethodDescriptor<
  AttenuationFactorInput,
  AttenuationFactorResult
> = {
  id: 'vapor.attenuation-factor-2015',
  process: 'vapor',
  kind: 'modern',
  name: 'Empirical attenuation factors (EPA 2015)',
  summary:
    'Indoor air as a generic attenuation factor times the vapor concentration of the medium (groundwater through its equilibrium vapor at the groundwater temperature, sub-slab or exterior soil gas, crawlspace air). An empirical screening option, not a fate model.',
  citations: ['epa2015vi', 'epavisl', 'epa2004je'],
  assumptions: [
    'Generic residential factors from the EPA 2015 technical guide, upper-percentile empirical values.',
    'The groundwater factor acts on the vapor in equilibrium with groundwater, H prime at the groundwater temperature.',
    'Not intended for a source less than 5 ft below the foundation or where preferential pathways exist.',
  ],
  validate: (input) => attenuationFactorRun(input).warnings,
  run: attenuationFactorRun,
};
