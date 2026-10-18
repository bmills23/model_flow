import type { MethodDescriptor, Warning } from '../../registry/index.js';
import {
  runUncertainty,
  specWarnings,
  type SamplingKind,
  type UncertaintyResult,
  type UncertaintySpec,
} from './runner.js';
import { runSobol, type SobolResult, type SobolSpec } from './sensitivity.js';

export * from './distributions.js';
export * from './samplers.js';
export * from './runner.js';
export * from './sensitivity.js';

/** Specifications reach the registered methods type-erased; build them with this helper. */
export function uncertaintySpec<I, O>(
  spec: UncertaintySpec<I, O>,
): UncertaintySpec<unknown, unknown> {
  return spec as unknown as UncertaintySpec<unknown, unknown>;
}

type Spec = UncertaintySpec<unknown, unknown>;

const COMMON_ASSUMPTIONS = [
  'Every sampled value is x = F^-1(u) for a uniform u from the sampling design; truncation maps u into the truncated range and never rejects a draw.',
  'The sample matrix is built on one thread before any model run and rows are written back by index, so the result is bit-identical for the same seed, n, inputs and engine version whatever the chunking.',
  'An iteration refused by the deterministic checks is recorded as failed, not dropped; summaries use the successful iterations, and more than 1 percent failed raises a warning.',
  'Percentiles use linear interpolation between order statistics (Hyndman and Fan definition 7).',
];

export const uncertaintySrsExposure: MethodDescriptor<Spec, UncertaintyResult> = {
  id: 'uncertainty.srs-exposure',
  process: 'montecarlo',
  kind: 'legacy',
  name: 'Simple random sampling of exposure parameters',
  summary:
    'Independent simple random draws of exposure parameters only (fate and transport inputs stay at their point values), 500 iterations by default, reporting the sorted sample with its minimum, 5th, 25th, 50th, 75th, 90th and 95th percentiles, maximum, mean and standard deviation.',
  citations: ['epa1997mc', 'rags3a2001', 'blackman2021', 'wichura1988', 'hyndmanfan1996'],
  assumptions: [
    ...COMMON_ASSUMPTIONS,
    'Only inputs in the exposure category are sampled, and they are sampled independently (no correlation).',
    'Default 500 iterations, the count of the RISC v4.0 review comparison; the seed defaults to the literal model-flow and is shown and editable.',
  ],
  risc5Choice:
    'RISC5 offers Monte Carlo for human receptor exposure parameters only, with fate and transport held at point values; the manual does not state the input distributions, the sampling scheme beyond random draws, or a seeding rule, so this method reproduces the scope and not any undocumented internals.',
  validate: (spec): Warning[] => specWarnings('srs', spec),
  run: (spec) => runUncertainty('srs', spec),
};

export const uncertaintyLhsIc: MethodDescriptor<Spec, UncertaintyResult> = {
  id: 'uncertainty.lhs-ic',
  process: 'montecarlo',
  kind: 'modern',
  name: 'Latin hypercube sampling with Iman-Conover rank correlation',
  summary:
    'Latin hypercube draws of exposure, transport, site and chemical inputs through each inverse CDF, reordered with the Iman and Conover restricted pairing to a target rank correlation, 1000 iterations by default; reports the summary, the failed-iteration count and the target and achieved Spearman matrices.',
  citations: [
    'mckay1979',
    'imanconover1982',
    'epa1997mc',
    'rags3a2001',
    'blackman2021',
    'wichura1988',
    'hyndmanfan1996',
  ],
  assumptions: [
    ...COMMON_ASSUMPTIONS,
    'Each input range is split into n equal strata with one draw per stratum, permuted independently per input; rank correlation only permutes sampled values, so every marginal and the stratification are preserved exactly.',
    'The target correlation must be symmetric with a unit diagonal and positive definite; n must exceed the number of correlated inputs and n below 5 times that number is warned.',
    'Inputs not named in the correlation stay independent.',
    'Default 1000 iterations; the seed defaults to the literal model-flow and is shown and editable.',
  ],
  validate: (spec): Warning[] => specWarnings('lhs', spec),
  run: (spec) => runUncertainty('lhs', spec),
};

export type { SamplingKind };

type SobolInput = SobolSpec<unknown, unknown>;

export const uncertaintySobolSaltelli: MethodDescriptor<SobolInput, SobolResult> = {
  id: 'uncertainty.sobol-saltelli',
  process: 'montecarlo',
  kind: 'modern',
  name: 'Sobol variance-based sensitivity (Saltelli design, Jansen total effect)',
  summary:
    'First order and total Sobol indices from two independent Latin hypercube matrices A and B and the k hybrid matrices, N (k + 2) model runs (N = 512 by default), on log10 of the output by default, with 500-resample bootstrap 95 percent intervals and a convergence flag.',
  citations: [
    'saltelli2010',
    'jansen1999',
    'sobol2001',
    'mckay1979',
    'blackman2021',
    'wichura1988',
    'hyndmanfan1996',
  ],
  assumptions: [
    'Inputs are independent; a correlation matrix is removed for this analysis with a warning.',
    'The first order index uses the Saltelli 2010 estimator mean(f(B)(f(A_B) - f(A))) / V and the total index the Jansen estimator mean((f(A) - f(A_B))^2) / (2V), with V the variance of the pooled 2N values of f(A) and f(B).',
    'A and B are independent Latin hypercube designs from the purpose-labelled seed streams sobol-A and sobol-B; the low-discrepancy Sobol sequence is not used.',
    'Indices describe log10 of the output unless the raw scale is requested; an output at or below zero falls back to the raw scale with a warning.',
    'Intervals are the 2.5th and 97.5th percentiles of 500 bootstrap resamples of the N rows (stream bootstrap); a half-width above 0.05 is flagged not converged. A negative first order estimate inside its interval of zero is shown as zero.',
    'A row with a refused or non-finite run in any design is dropped from all designs together and counted.',
  ],
  validate: (): Warning[] => [],
  run: (spec) => runSobol(spec),
};
