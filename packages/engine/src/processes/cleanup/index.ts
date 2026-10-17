import type { MethodDescriptor, Warning } from '../../registry/index.js';
import type { LegacyChemical, LegacyReceptor } from '../exposure/index.js';
import type { ModernChemical, ModernReceptor } from '../exposure/index.js';
import {
  backCalculateLegacy,
  backCalculateModern,
  type DirectInput,
  type DirectResult,
} from './direct.js';
import { ssgLeachingLevel, type SsgLeachingInput, type SsgLeachingResult } from './ssg.js';

export * from './ssg.js';
export * from './direct.js';
export * from './targets.js';
export * from './solve.js';
export * from './chains.js';

const COMMON_ASSUMPTIONS = [
  'A cleanup level is the source concentration whose forward risk or well concentration equals the target; the forward models are the registered exposure, vadose, groundwater and saturated-source methods.',
  'Target risk and target hazard quotient are user inputs (defaults 1e-6 and 1); a risk target above 0.01 is warned because the dose-response is linear only at low dose.',
  'Cancer and noncancer endpoints are solved separately and the lower level governs; hazard quotients are grouped by life stage or receptor and never added across groups.',
  'Individual levels treat each chemical alone; cumulative and equal allocation scale the entered ratios or split the target equally across chemicals, and are refused for concentration targets.',
  'A pathway or medium without toxicity or exposure data is reported as not quantified, never as an unlimited level.',
  'Modeled chains are solved in the logarithm of the source concentration with Brent root finding after a bracket search capped at the solubility or saturation limit; a target that cannot be reached is reported as such, not extrapolated.',
];

export type CleanupLegacyInput = DirectInput<LegacyReceptor, LegacyChemical>;
export type CleanupModernInput = DirectInput<ModernReceptor, ModernChemical>;

export const cleanupLegacy: MethodDescriptor<CleanupLegacyInput, DirectResult> = {
  id: 'cleanup.rags-b-1991',
  process: 'cleanup',
  kind: 'legacy',
  name: 'RAGS Part B preliminary remediation goals with 1989 exposure coefficients',
  summary:
    'Back-calculates a concentration in soil, groundwater, air or surface water from a target risk and hazard quotient, using the RAGS Part A (1989) intake coefficients with the 1991 default factors, summed over pathways within a receptor, with modeled source-to-well chains solved by Brent root finding.',
  citations: ['ragsb1991', 'rags1989', 'epa1991sdef', 'epa1992dea', 'brent1973'],
  assumptions: [
    ...COMMON_ASSUMPTIONS,
    'Cancer risks of two receptors are added only when the additive option is switched on.',
  ],
  risc5Choice:
    'RISC5 back-calculates a cleanup level for each medium from a target risk and hazard quotient with the legacy exposure equations, optionally additive over two receptors, and for modeled pathways solves for the source concentration whose forward result meets the target.',
  validate: (input): Warning[] => backCalculateLegacy(input).warnings,
  run: backCalculateLegacy,
};

export const cleanupModern: MethodDescriptor<CleanupModernInput, DirectResult> = {
  id: 'cleanup.rags-e-f-2014',
  process: 'cleanup',
  kind: 'modern',
  name: 'RAGS Parts E and F back-calculation with 2014 default factors',
  summary:
    'Back-calculates cleanup levels with age-segmented intakes, the Part E dermal event model, Part F concentration-based inhalation and the age-dependent adjustment factors, with individual, cumulative and equal allocation and modeled source-to-well chains.',
  citations: ['ragsb1991', 'ragse2004', 'ragsf2009', 'epa2014ef', 'epa2005adaf', 'brent1973'],
  assumptions: [
    ...COMMON_ASSUMPTIONS,
    'Mutagens use the four age segments with the adjustment factors 10, 3, 3 and 1; life-stage hazard quotients are never added.',
  ],
  validate: (input): Warning[] => backCalculateModern(input).warnings,
  run: backCalculateModern,
};

export const cleanupSsgLeaching: MethodDescriptor<SsgLeachingInput, SsgLeachingResult> = {
  id: 'cleanup.ssg-leaching',
  process: 'cleanup',
  kind: 'modern',
  name: 'Soil screening guidance soil-to-groundwater leaching level',
  summary:
    'Soil concentration whose equilibrium leachate, divided by a dilution attenuation factor, meets a groundwater target, using the three-phase partition equation, the generic or site-specific dilution attenuation factor with a capped mixing zone, and the mass-limit alternative for a finite source.',
  citations: ['epa1996ssg', 'epa1996ssgug', 'epa2002ssg'],
  assumptions: [
    'Equilibrium partitioning among soil, pore water and soil gas, with no biodegradation, no colloidal transport and no leachate attenuation in the vadose zone.',
    'The dilution attenuation factor is 20 (half-acre source), 1 (no dilution) or computed from the aquifer hydraulics with the mixing depth capped at the aquifer thickness.',
    'The mass-limit level applies only when a source depth is given, and the higher of the partition and mass-limit levels is reported.',
    'Levels above the soil saturation concentration or a leachate above solubility are warned, not corrected.',
  ],
  risc5Choice:
    'RISC5 evaluates leaching to groundwater with its own vadose-zone and aquifer models rather than the generic dilution attenuation factor; this method reproduces the screening-guidance equations for comparison.',
  validate: (input): Warning[] => ssgLeachingLevel(input).warnings,
  run: ssgLeachingLevel,
};
