import { z } from 'zod';
import { cloneData, mergeDefaults } from '../project/merge';
import { flag, partialObject, texts } from '../project/fields';
import { DEFAULT_FORM, type SwForm } from './inputs';
import {
  CRITERIA_SET_CHOICES,
  DEFAULT_CRITERIA_SET,
  type CriteriaSetChoice,
} from './criteriaSetChoice';

/** The surface water screen's saved state: its form and the criteria set chosen for the comparison. */
export interface SurfaceWaterState {
  form: SwForm;
  /** Absent reads as the default (the US sets); `fromProject` always fills it. */
  criteriaSet?: CriteriaSetChoice | undefined;
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
  ...texts('foc', 'koc', 'kd', 'chemicalId'),
  poreWater: z.enum(['discharge', 'centreline', 'surface']),
  ...texts('downstream', 'solubility'),
  scale: z.enum(['linear', 'log']),
});

export const surfaceWaterProjectSchema = z.object({
  form: formSchema.optional(),
  /** Optional inside the current format version: a file without it opens with the US sets. */
  criteriaSet: z.enum(CRITERIA_SET_CHOICES).optional(),
});
export type SurfaceWaterProject = z.infer<typeof surfaceWaterProjectSchema>;

export function toProject(state: SurfaceWaterState): SurfaceWaterProject {
  const set = state.criteriaSet ?? DEFAULT_CRITERIA_SET;
  // the default is not written, so a project that never chose a set is byte for byte what it was before
  return cloneData({
    form: state.form,
    ...(set !== DEFAULT_CRITERIA_SET ? { criteriaSet: set } : {}),
  });
}

export function fromProject(p: SurfaceWaterProject | undefined): SurfaceWaterState {
  return {
    form: mergeDefaults(DEFAULT_FORM, p?.form),
    criteriaSet: p?.criteriaSet ?? DEFAULT_CRITERIA_SET,
  };
}
