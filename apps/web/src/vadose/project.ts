import { z } from 'zod';
import { cloneData, mergeDefaults } from '../project/merge';
import { flag, partialObject, texts } from '../project/fields';
import { DEFAULT_FORM, type VadoseForm } from './form';

/** The vadose screen's saved state: its form. */
export interface VadoseState {
  form: VadoseForm;
}

const layer = z.object({ ...texts('thickness', 'thetaS', 'thetaR', 'n', 'Ks', 'rhoB', 'foc') });

const formSchema = partialObject({
  ...texts('infiltration', 'M', 'S', 'H', 'Koc', 'Da', 'Dw', 'mu'),
  source: layer.partial(),
  ...texts('srcLength', 'srcWidth', 'srcF'),
  tphOn: flag,
  ...texts('srcFT', 'srcMT', 'srcDecay'),
  above: z.array(layer),
  below: z.array(layer),
  ...texts('durationYr', 'alphaL'),
  hydraulicModel: z.enum(['default', 'brooksCorey1964', 'vanGenuchten1980']),
  method: z.enum(['legacy', 'modern']),
  scale: z.enum(['linear', 'log']),
  measure: z.enum(['concentration', 'flux']),
});

export const vadoseProjectSchema = z.object({ form: formSchema.optional() });
export type VadoseProject = z.infer<typeof vadoseProjectSchema>;

export function toProject(state: VadoseState): VadoseProject {
  return cloneData({ form: state.form });
}

export function fromProject(p: VadoseProject | undefined): VadoseState {
  return { form: mergeDefaults(DEFAULT_FORM, p?.form) };
}
