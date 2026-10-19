import type { MethodDescriptor, Warning } from '../../registry/index.js';
import {
  runBenchmarkScreen,
  runEcosslScreen,
  type BenchmarkScreenInput,
  type BenchmarkScreenResult,
  type EcosslScreenInput,
  type EcosslScreenResult,
} from './screen.js';
import { benchmarkUncertainInputs, ecosslUncertainInputs } from './uncertain.js';

export * from './uptake.js';
export * from './wildlife.js';
export * from './screen.js';

export const ecoBenchmarkHq: MethodDescriptor<BenchmarkScreenInput, BenchmarkScreenResult> = {
  id: 'eco.benchmark-hq',
  uncertainInputs: benchmarkUncertainInputs(),
  process: 'eco',
  kind: 'legacy',
  name: 'User-entered benchmark hazard quotients with a simple food web',
  summary:
    'Hazard quotient of the soil concentration over a benchmark the user enters with a citation, and a wildlife dose from a simple food web with user-entered bioaccumulation factors compared with a toxicity reference value. No benchmark table ships with the method.',
  citations: ['sample1996'],
  assumptions: [
    'Benchmarks and bioaccumulation factors are user entered; the expected citation for wildlife benchmarks is the ORNL toxicological benchmark report.',
    'Dose is the food ingestion rate times the area use factor times the diet-weighted food concentrations plus the incidental soil fraction.',
    'Hazard quotients only; no ecological cleanup level is offered.',
  ],
  risc5Choice:
    'RISC5 offers an ecological screen against user-supplied benchmarks with a simple food web.',
  validate: (input): Warning[] => runBenchmarkScreen(input).warnings,
  run: runBenchmarkScreen,
};

export const ecoEcossl2005: MethodDescriptor<EcosslScreenInput, EcosslScreenResult> = {
  id: 'eco.ecossl-2005',
  uncertainInputs: ecosslUncertainInputs(),
  process: 'eco',
  kind: 'modern',
  name: 'EPA Eco-SSL hazard quotients and wildlife food web',
  summary:
    'Hazard quotients of the soil concentration over the EPA ecological soil screening levels for plants, soil invertebrates and the avian and mammalian wildlife guilds, with the guidance wildlife dose model (soil-to-biota uptake ratio, log-linear and linear models) available to back-calculate or check a wildlife level.',
  citations: ['epaecossl', 'epaecosslguidance'],
  assumptions: [
    'Eco-SSLs are screening values, not cleanup levels; the guidance states they are inappropriate as cleanup standards, so only hazard quotients are reported and ECO_SCREENING_ONLY is always shown.',
    'A group without a numeric Eco-SSL (not available, not enough data, or a procedure) gives no hazard quotient and an ECO_NO_SSL warning.',
    'The wildlife dose uses the per-chemical derivation inputs of the Eco-SSL documents; back-calculation reproduces the printed values to the two significant figures they carry (5 percent).',
  ],
  validate: (input): Warning[] => runEcosslScreen(input).warnings,
  run: runEcosslScreen,
};
