import { DEFAULT_SEED, DEFAULT_SOBOL_N } from '@model-flow/engine';
import { z } from 'zod';
import { cloneData, mergeDefaults } from '../project/merge';
import { flag, partialObject, text, texts } from '../project/fields';
import type { DistRow } from './editor';

/**
 * What the user set up on one uncertainty panel: the distribution editor rows by input id, the
 * correlation pairs, and the run settings, all as typed. Results are never saved: a run is repeated
 * from these settings and the seed.
 */
export interface UncertaintySetup {
  rows: Record<string, DistRow>;
  /** Rank correlation entries keyed `a|b` (sorted ids), as typed. */
  correlation: Record<string, string>;
  sampling: 'srs' | 'lhs';
  iterations: string;
  seed: string;
  /** Output id on the exposure panel; blank takes the first. */
  output: string;
  sobol: boolean;
  sobolN: string;
  /** Protected percentage on the cleanup panel. */
  protection: string;
  /** Chemical and medium choice on the cleanup panel, `chemicalId|medium`; blank takes the first. */
  choice: string;
}

/** The two panels: the exposure screen's and the cleanup screen's. */
export interface UncertaintyState {
  risk: UncertaintySetup;
  cleanup: UncertaintySetup;
}

export const defaultSetup = (): UncertaintySetup => ({
  rows: {},
  correlation: {},
  sampling: 'srs',
  iterations: '',
  seed: DEFAULT_SEED,
  output: '',
  sobol: false,
  sobolN: String(DEFAULT_SOBOL_N),
  protection: '95',
  choice: '',
});

export const defaultUncertainty = (): UncertaintyState => ({
  risk: defaultSetup(),
  cleanup: defaultSetup(),
});

const row = z.object({
  kind: z.enum([
    'point',
    'constant',
    'uniform',
    'loguniform',
    'triangular',
    'normal',
    'lognormal',
    'empirical',
  ]),
  params: z.record(z.string(), text),
  lnForm: z.enum(['geometric', 'arithmetic']),
  ...texts('lo', 'hi', 'table'),
});

const setupSchema = partialObject({
  rows: z.record(z.string(), row),
  correlation: z.record(z.string(), text),
  sampling: z.enum(['srs', 'lhs']),
  ...texts('iterations', 'seed', 'output', 'sobolN', 'protection', 'choice'),
  sobol: flag,
});

const formSchema = partialObject({ risk: setupSchema, cleanup: setupSchema });

export const uncertaintyProjectSchema = z.object({ form: formSchema.optional() });
export type UncertaintyProject = z.infer<typeof uncertaintyProjectSchema>;

export function toProject(state: UncertaintyState): UncertaintyProject {
  return cloneData({ form: state });
}

export function fromProject(p: UncertaintyProject | undefined): UncertaintyState {
  return mergeDefaults(defaultUncertainty(), p?.form);
}
