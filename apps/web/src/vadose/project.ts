import { z } from 'zod';
import { SOIL_TEXTURES, type SoilTextureCode } from '@model-flow/engine';
import { cloneData, mergeDefaults } from '../project/merge';
import { flag, partialObject, texts } from '../project/fields';
import { DEFAULT_FORM, legacyDispersivityBasis, type LayerForm, type VadoseForm } from './form';

/** The vadose screen's saved state: its form. */
export interface VadoseState {
  form: VadoseForm;
}

const textureChoice = z.enum([
  'custom',
  ...(Object.keys(SOIL_TEXTURES) as [SoilTextureCode, ...SoilTextureCode[]]),
]);

const layer = z.object({
  ...texts('thickness', 'thetaS', 'thetaR', 'n', 'Ks', 'rhoB', 'foc'),
  texture: textureChoice.optional(),
});

const formSchema = partialObject({
  ...texts('infiltration', 'chemicalId', 'M', 'S', 'H', 'Koc', 'Da', 'Dw', 'mu'),
  source: layer.partial(),
  ...texts('srcLength', 'srcWidth', 'srcF'),
  tphOn: flag,
  ...texts('srcFT', 'srcMT', 'srcDecay'),
  above: z.array(layer),
  below: z.array(layer),
  ...texts('durationYr', 'alphaL'),
  dispersivityBasis: z.enum(['entered', 'regression']),
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
  const form = mergeDefaults(DEFAULT_FORM, p?.form);
  // a file written before the choice existed: a blank dispersivity was the regression, chosen now
  // explicitly so its numbers do not change; a typed one stays an entered value
  if (p?.form !== undefined && p.form.dispersivityBasis === undefined) {
    form.dispersivityBasis = legacyDispersivityBasis(form);
  }
  // a file written before texture presets existed has layers without the key: they were hand entered
  const withTexture = (l: LayerForm): LayerForm => ({ ...l, texture: l.texture ?? 'custom' });
  return {
    form: {
      ...form,
      source: withTexture(form.source),
      above: form.above.map(withTexture),
      below: form.below.map(withTexture),
    },
  };
}
