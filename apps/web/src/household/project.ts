import { z } from 'zod';
import { cloneData, mergeDefaults } from '../project/merge';
import { flag, partialObject, texts } from '../project/fields';
import { DEFAULT_FORM, type HouseholdForm } from './form';

/** The household screen's saved state: its form (the held feed is saved apart, under `feeds`). */
export interface HouseholdState {
  form: HouseholdForm;
}

const formSchema = partialObject({
  ...texts(
    'chemicalId',
    'chemicalName',
    'waterConcentration',
    'soilConcentration',
    'henry',
    'molecularWeight',
    'henryAtm',
    'vaporPressure',
    'householdFactor',
    'filmGas',
    'filmLiquid',
    'showerDropletDiameter',
    'showerFallTime',
    'showerFlow',
    'showerMinutes',
    'stallVolume',
    'ventilation',
    'postShowerMinutes',
    'sprayDropletDiameter',
    'sprayFallTime',
    'sprinklerFlow',
    'applicationRate',
    'windSpeed',
    'mixingHeight',
    'boxLength',
    'boxWidth',
    'vegetativeCover',
    'meanWind',
    'thresholdWind',
    'fx',
    'qOverC',
    'pm10Flux',
  ),
  volatileOverride: z.enum(['auto', 'volatile', 'nonvolatile']),
  alsoPotable: flag,
  showerMethod: z.enum(['legacy', 'little', 'rsl']),
  particulateMethod: z.enum(['box', 'pef1996', 'pef2002']),
  showerWaterSource: z.enum(['entered', 'well']),
  irrigationWaterSource: z.enum(['entered', 'well', 'surface']),
});

export const householdProjectSchema = z.object({ form: formSchema.optional() });
export type HouseholdProject = z.infer<typeof householdProjectSchema>;

export function toProject(state: HouseholdState): HouseholdProject {
  return cloneData({ form: state.form });
}

export function fromProject(p: HouseholdProject | undefined): HouseholdState {
  return { form: mergeDefaults(DEFAULT_FORM, p?.form) };
}
