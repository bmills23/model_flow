import { z } from 'zod';
import { cloneData, mergeDefaults } from '../project/merge';
import { flag, partialObject, text, texts } from '../project/fields';
import type { MethodKey } from './compute';
import { DEFAULT_FORM, type TransportForm } from './form';

/** The groundwater screen's saved state: its form and the method whose result it offers downstream. */
export interface TransportState {
  form: TransportForm;
  method: MethodKey;
}

export const DEFAULT_METHOD: MethodKey = 'modern';

const step = z.object({ ...texts('start', 'end', 'factor') });

const formSchema = partialObject({
  aquiferMode: z.enum(['darcy', 'velocity']),
  ...texts('K', 'gradient', 'velocityYr', 'porosity'),
  thicknessMode: z.enum(['infinite', 'finite']),
  ...texts('thickness', 'width'),
  retardMode: z.enum(['factor', 'kd']),
  ...texts('retardation', 'kd', 'bulkDensity', 'halfLifeYr', 'srcLength', 'srcWidth', 'srcDepth'),
  sourceMode: z.enum(['concentration', 'massRate']),
  ...texts('c0', 'massRate'),
  loading: z.enum(['continuous', 'pulse', 'steps']),
  pulseYr: text,
  steps: z.array(step),
  feedFromVadose: flag,
  feedFromSaturated: flag,
  dispLaw: z.enum(['legacy', 'modern', 'schulze-makuch']),
  ...texts('alphaLOverride', 'alphaTOverride', 'alphaVOverride', 'rx', 'ry', 'rDepth'),
  screen: flag,
  ...texts('screenTop', 'screenBottom', 'timeYr', 'xMin', 'xMax', 'yHalf'),
  mapMethod: z.enum(['legacy', 'modern']),
  showDomenico: flag,
  scale: z.enum(['linear', 'log']),
});

export const transportProjectSchema = z.object({
  form: formSchema.optional(),
  method: z.enum(['legacy', 'modern', 'domenico']).optional(),
});
export type TransportProject = z.infer<typeof transportProjectSchema>;

export function toProject(state: TransportState): TransportProject {
  return cloneData({ form: state.form, method: state.method });
}

export function fromProject(p: TransportProject | undefined): TransportState {
  return {
    form: mergeDefaults(DEFAULT_FORM, p?.form),
    method: p?.method ?? DEFAULT_METHOD,
  };
}
