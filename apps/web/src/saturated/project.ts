import { z } from 'zod';
import { cloneData, mergeDefaults } from '../project/merge';
import { flag, partialObject, texts } from '../project/fields';
import type { SaturatedMethod } from './feed';
import { DEFAULT_FORM, type SaturatedForm } from './form';

/** The saturated source screen's saved state: its form and the method whose result it offers on. */
export interface SaturatedState {
  form: SaturatedForm;
  method: SaturatedMethod;
}

export const DEFAULT_METHOD: SaturatedMethod = 'legacy';

const formSchema = partialObject({
  ...texts('srcLength', 'srcWidth', 'srcThickness', 'hMin', 'dh', 'fractionHigh'),
  schedule: z.enum(['annual-mean', 'seasonal']),
  ...texts('porosity', 'rhoB', 'foc', 'thetaR', 'n'),
  hydraulicModel: z.enum(['default', 'brooksCorey1964', 'vanGenuchten1980']),
  ...texts('K', 'gradient', 'infiltration', 'chemicalId', 'F', 'M', 'S', 'H', 'Koc'),
  tphOn: flag,
  ...texts('FT', 'MT', 'srcDecay', 'horizonYr'),
  method: z.enum(['legacy', 'modern', 'both']),
});

export const saturatedProjectSchema = z.object({
  form: formSchema.optional(),
  method: z.enum(['legacy', 'modern']).optional(),
});
export type SaturatedProject = z.infer<typeof saturatedProjectSchema>;

export function toProject(state: SaturatedState): SaturatedProject {
  return cloneData({ form: state.form, method: state.method });
}

export function fromProject(p: SaturatedProject | undefined): SaturatedState {
  return {
    form: mergeDefaults(DEFAULT_FORM, p?.form),
    method: p?.method ?? DEFAULT_METHOD,
  };
}
