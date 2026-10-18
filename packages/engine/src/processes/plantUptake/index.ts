import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { hhrapProduce, type HhrapProduceInput, type HhrapProduceResult } from './hhrap.js';
import { legacyPlantUptake, type LegacyPlantInput, type LegacyPlantResult } from './legacy.js';

export * from './partition.js';
export * from './briggs.js';
export * from './leaf.js';
export * from './hhrap.js';
export * from './legacy.js';
export type { PlantWarning } from './checks.js';

export const plantUptakeLegacy: MethodDescriptor<LegacyPlantInput, LegacyPlantResult> = {
  id: 'plantUptake.trapp-matthies-1995',
  process: 'plantUptake',
  kind: 'legacy',
  name: 'Briggs root factor with a one-compartment leaf model',
  summary:
    'Soil pore water from the shared partitioning step; root produce as the Briggs root concentration factor times pore water; above-ground produce from a one-compartment leaf mass balance with a transpiration stream term and a gas exchange term, at steady state or as the exact exponential at harvest.',
  citations: ['briggs1982', 'trappmatthies1995', 'epa2005hhrap'],
  assumptions: [
    'Neutral organic chemicals only; ionizable chemicals and inorganics are warned, and an inorganic needs a user bioconcentration factor.',
    'The root factor constants are those the HHRAP appendix prints for the Briggs correlation; the transpiration stream concentration factor and the leaf-air partition coefficient are user inputs because their published regressions were not read.',
    'The leaf and stem form one well-mixed compartment with constant inputs over the growing period and zero initial concentration.',
    'Concentrations are fresh weight; the root factor is in L/kg of root fresh weight per water concentration.',
  ],
  risc5Choice:
    'RISC5 offers Briggs-type root and transpiration factors with a one-compartment leaf model for vegetable uptake of organics.',
  validate: (input): Warning[] => legacyPlantUptake(input).warnings,
  run: legacyPlantUptake,
};

export const plantUptakeModern: MethodDescriptor<HhrapProduceInput, HhrapProduceResult> = {
  id: 'plantUptake.hhrap-2005',
  process: 'plantUptake',
  kind: 'modern',
  name: 'EPA HHRAP 2005 produce equations (fallback for the modern plant model)',
  summary:
    'Root uptake with the Travis and Arms plant-soil factor for above-ground produce, the Briggs root factor over Kd with the empirical skin correction for root produce, and Bacci-type air-to-plant vapor transfer for exposed produce, all on a dry weight basis with the published log Kow caps.',
  citations: ['epa2005hhrap', 'briggs1982'],
  assumptions: [
    'Fallback for the Trapp modern model, whose publication could not be verified (DECISIONS, 2026-10-18); the switch is recorded, not silent.',
    'Neutral organic chemicals only; an inorganic needs a user plant-soil factor.',
    'Particle deposition is not modelled; only root uptake and vapor-phase air-to-plant transfer.',
    'Concentrations are dry weight, as HHRAP states them; the root factor is converted from fresh weight with the 87 percent moisture content HHRAP uses.',
    'The empirical correction factor is 0.01 above log Kow 4 and 1.0 otherwise.',
  ],
  validate: (input): Warning[] => hhrapProduce(input).warnings,
  run: hhrapProduce,
};
