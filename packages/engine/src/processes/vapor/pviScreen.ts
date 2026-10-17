import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { FEET_TO_METRES } from './attenuationFactor.js';
import { checkNonNeg, checkPos } from './units.js';

/**
 * Petroleum vapor intrusion vertical-separation screen (EPA 2015 petroleum guide, Table 3). A verdict,
 * not a concentration. Inputs are SI (kg/kg, kg/m^3, m); the published thresholds are stored in the units
 * they are printed in and converted here.
 */

const MG_PER_KG = 1e-6;
const MG_PER_L = 1e-3;

export const PVI_THRESHOLDS = {
  /** Soil benzene, mg/kg. */
  soilBenzeneMgKg: 10,
  /** Soil TPH, mg/kg: unweathered gasoline and weathered gasoline or diesel. */
  soilTphUnweatheredMgKg: 100,
  soilTphWeatheredMgKg: 250,
  /** Groundwater benzene and TPH, mg/L. */
  groundwaterBenzeneMgL: 5,
  groundwaterTphMgL: 30,
  /** Vertical separation, feet. */
  dissolvedSeparationFt: 6,
  lnaplSeparationFt: 15,
  /** A building with every side at least this long is outside the LNAPL recommendation, feet. */
  lnaplLargeBuildingFt: 66,
  /** Dissolved benzene above this may behave like LNAPL (information), mg/L. */
  dissolvedBenzeneNoteMgL: 1,
  /** Ethanol volume fraction at or above which the blend is precluding (E20). */
  highEthanolFraction: 0.2,
} as const;

export type PviSourceType = 'dissolved' | 'lnapl';
export type PviVerdict = 'screened-out' | 'further-assessment';

export interface PviInput {
  /** Soil benzene and TPH, kg/kg. */
  soilBenzene?: number;
  soilTph?: number;
  /** Fuel type for the soil TPH threshold: unweathered gasoline (default) or weathered gasoline or diesel. */
  fuel?: 'unweathered' | 'weathered';
  /** Groundwater benzene and TPH, kg/m^3. */
  groundwaterBenzene?: number;
  groundwaterTph?: number;
  /** Explicit source type, overriding the classification from concentrations. */
  sourceType?: PviSourceType;
  /** Clean, biologically active soil between the top of the contamination and the lowest point of the building, m. */
  separation: number;
  /** Shortest side of the building footprint, m (required for an LNAPL source). */
  smallestBuildingDimension?: number;
  preferentialPathways?: boolean;
  /** Ethanol volume fraction of the fuel (0.2 is E20). */
  ethanolFraction?: number;
  leadScavengers?: boolean;
  extensiveSurfaceCover?: boolean;
  contaminationContactsBuilding?: boolean;
}

export interface PviResult {
  verdict: PviVerdict;
  sourceType: PviSourceType;
  /** Which Table 3 indicators classified the source as LNAPL. */
  lnaplIndicators: string[];
  /** Recommended separation, m. */
  requiredSeparation: number;
  separation: number;
  separationMet: boolean;
  /** Precluding factors found. */
  precluding: string[];
  /** Informational notes (not warnings, not verdict changes). */
  information: string[];
  warnings: Warning[];
}

export function pviScreenRun(input: PviInput): PviResult {
  checkNonNeg('separation', input.separation);
  const T = PVI_THRESHOLDS;
  const optional: [string, number | undefined][] = [
    ['soilBenzene', input.soilBenzene],
    ['soilTph', input.soilTph],
    ['groundwaterBenzene', input.groundwaterBenzene],
    ['groundwaterTph', input.groundwaterTph],
    ['ethanolFraction', input.ethanolFraction],
  ];
  for (const [name, v] of optional) if (v !== undefined) checkNonNeg(name, v);
  if (input.smallestBuildingDimension !== undefined) {
    checkPos('smallestBuildingDimension', input.smallestBuildingDimension);
  }

  const warnings: Warning[] = [];
  const information: string[] = [];
  const lnaplIndicators: string[] = [];
  if (input.soilBenzene !== undefined && input.soilBenzene > T.soilBenzeneMgKg * MG_PER_KG) {
    lnaplIndicators.push('soil benzene');
  }
  if (input.soilTph !== undefined) {
    const limit = input.fuel === 'weathered' ? T.soilTphWeatheredMgKg : T.soilTphUnweatheredMgKg;
    if (input.soilTph > limit * MG_PER_KG) lnaplIndicators.push('soil TPH');
  }
  if (
    input.groundwaterBenzene !== undefined &&
    input.groundwaterBenzene > T.groundwaterBenzeneMgL * MG_PER_L
  ) {
    lnaplIndicators.push('groundwater benzene');
  }
  if (input.groundwaterTph !== undefined && input.groundwaterTph > T.groundwaterTphMgL * MG_PER_L) {
    lnaplIndicators.push('groundwater TPH');
  }

  const classified = optional.slice(0, 4).some(([, v]) => v !== undefined);
  let sourceType: PviSourceType;
  if (input.sourceType !== undefined) {
    sourceType = input.sourceType;
  } else {
    sourceType = lnaplIndicators.length > 0 ? 'lnapl' : 'dissolved';
    if (!classified) {
      warnings.push({
        code: 'vapor.pvi-source-unclassified',
        message:
          'no soil or groundwater concentration or source type was given; the source is treated as dissolved',
      });
    }
  }

  if (
    sourceType === 'dissolved' &&
    input.groundwaterBenzene !== undefined &&
    input.groundwaterBenzene > T.dissolvedBenzeneNoteMgL * MG_PER_L
  ) {
    information.push(
      'dissolved benzene above 1 mg/L in groundwater may behave like an LNAPL source (EPA 2015 petroleum guide)',
    );
  }

  const precluding: string[] = [];
  if (input.preferentialPathways) precluding.push('preferential-pathways');
  if (input.ethanolFraction !== undefined && input.ethanolFraction >= T.highEthanolFraction) {
    precluding.push('high-ethanol-blend');
  }
  if (input.leadScavengers) precluding.push('lead-scavengers');
  if (input.extensiveSurfaceCover) precluding.push('impermeable-surface-cover');
  if (input.contaminationContactsBuilding) precluding.push('contamination-contacts-building');

  let requiredFt: number = T.dissolvedSeparationFt;
  if (sourceType === 'lnapl') {
    requiredFt = T.lnaplSeparationFt;
    if (input.smallestBuildingDimension === undefined) {
      throw new RangeError('an LNAPL source needs smallestBuildingDimension (the 66 ft side test)');
    }
    if (!(input.smallestBuildingDimension < T.lnaplLargeBuildingFt * FEET_TO_METRES)) {
      precluding.push('large-building-over-lnapl');
    }
  }
  const requiredSeparation = requiredFt * FEET_TO_METRES;
  const separationMet = input.separation >= requiredSeparation;
  if (precluding.length > 0) {
    warnings.push({
      code: 'vapor.pvi-precluded',
      message: `precluding factors: ${precluding.join(', ')}; the vertical separation screen does not apply and further assessment is needed`,
    });
  }
  const verdict: PviVerdict =
    separationMet && precluding.length === 0 ? 'screened-out' : 'further-assessment';
  return {
    verdict,
    sourceType,
    lnaplIndicators,
    requiredSeparation,
    separation: input.separation,
    separationMet,
    precluding,
    information,
    warnings,
  };
}

export const vaporPviScreen2015: MethodDescriptor<PviInput, PviResult> = {
  id: 'vapor.pvi-screen-2015',
  process: 'vapor',
  kind: 'modern',
  name: 'Petroleum vapor intrusion vertical separation screen (EPA 2015)',
  summary:
    'A screened-out or further-assessment verdict from the clean-soil separation between the contamination and the building: 6 ft for a dissolved source, 15 ft for LNAPL under a building with a side shorter than 66 ft, with precluding factors forcing further assessment.',
  citations: ['epa2015pvi', 'lahvis2013'],
  assumptions: [
    'The Table 3 thresholds classify the source as dissolved or LNAPL; the separation is clean, biologically active soil.',
    'A verdict, not a concentration: it does not predict indoor air.',
    'Precluding factors (preferential pathways, high-ethanol blends, lead scavengers, a larger building over LNAPL, extensive impermeable cover, contamination in contact with the building) force further assessment.',
  ],
  validate: (input) => pviScreenRun(input).warnings,
  run: pviScreenRun,
};
