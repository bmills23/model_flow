import { EFH_AGE_GROUPS, PRODUCE_CLASSES } from '@model-flow/engine';
import { z } from 'zod';
import { cloneData, mergeDefaults } from '../project/merge';
import { flag, partialObject, text, texts } from '../project/fields';
import { DEFAULT_FORM, type PlantsEcoForm } from './form';

/** The plants, ecology and TPH screen's saved state: its form (the held produce feed is saved apart). */
export interface PlantsEcoState {
  form: PlantsEcoForm;
}

const intake = partialObject(texts('gPerKgDay', 'loss', 'homegrown'));

const benchmark = z.object({ ...texts('receptor', 'value', 'citation') });

const fraction = z.object({
  label: text,
  family: z.enum(['aliphatic', 'aromatic']),
  ...texts('massFraction', 'surrogate', 'level'),
});

const formSchema = partialObject({
  ...texts(
    'chemicalId',
    'chemicalName',
    'soilConcentration',
    'logKow',
    'koc',
    'kd',
    'userBcf',
    'bulkDensity',
    'waterFilledPorosity',
    'foc',
    'tscf',
    'transpiration',
    'conductance',
    'leafArea',
    'plantMass',
    'kLeafAir',
    'lossRate',
    'growthPeriod',
    'moistureFraction',
    'tphTotal',
    'tphTargetHi',
    'tphThetaA',
  ),
  ionizable: flag,
  inorganic: flag,
  uptake: z.enum(['legacy', 'modern']),
  intakeMode: z.enum(['efh', 'custom']),
  ageGroup: z.enum(EFH_AGE_GROUPS),
  custom: z.object(
    Object.fromEntries(PRODUCE_CLASSES.map((k) => [k, intake.optional()])) as Record<
      (typeof PRODUCE_CLASSES)[number],
      z.ZodOptional<typeof intake>
    >,
  ),
  benchmarks: z.array(benchmark),
  tphSet: z.enum(['tphcwg', 'madep']),
  tphFractions: z.array(fraction),
});

export const plantsEcoProjectSchema = z.object({ form: formSchema.optional() });
export type PlantsEcoProject = z.infer<typeof plantsEcoProjectSchema>;

export function toProject(state: PlantsEcoState): PlantsEcoProject {
  return cloneData({ form: state.form });
}

export function fromProject(p: PlantsEcoProject | undefined): PlantsEcoState {
  return { form: mergeDefaults(DEFAULT_FORM, p?.form) };
}
