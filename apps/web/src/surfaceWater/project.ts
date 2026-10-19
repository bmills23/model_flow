import { z } from 'zod';
import { cloneData, mergeDefaults } from '../project/merge';
import { flag, partialObject, texts } from '../project/fields';
import { DEFAULT_FORM, type SwForm } from './inputs';

/** The surface water screen's saved state: its form. */
export interface SurfaceWaterState {
  form: SwForm;
}

const formSchema = partialObject({
  bodyType: z.enum(['river', 'lake']),
  ...texts('crossSection', 'volume', 'upstreamFlow', 'background', 'mixingFraction', 'decay'),
  dischargeMode: z.enum(['darcy', 'flow']),
  ...texts('bedConductivity', 'gradient', 'flow', 'thickness'),
  reachMode: z.enum(['entered', 'domenico']),
  ...texts('reachLength', 'sourceWidth', 'bankX', 'groundwaterConcentration', 'durationYr'),
  linked: flag,
  sedimentOn: flag,
  ...texts('foc', 'koc', 'kd'),
  poreWater: z.enum(['discharge', 'centreline', 'surface']),
  ...texts('downstream', 'solubility'),
  scale: z.enum(['linear', 'log']),
});

export const surfaceWaterProjectSchema = z.object({ form: formSchema.optional() });
export type SurfaceWaterProject = z.infer<typeof surfaceWaterProjectSchema>;

export function toProject(state: SurfaceWaterState): SurfaceWaterProject {
  return cloneData({ form: state.form });
}

export function fromProject(p: SurfaceWaterProject | undefined): SurfaceWaterState {
  return { form: mergeDefaults(DEFAULT_FORM, p?.form) };
}
