import type { AttenuationMedium, FoundationType, SoilTextureCode } from '@model-flow/engine';
import { z } from 'zod';
import { cloneData, mergeDefaults } from '../project/merge';
import { flag, partialObject, text, texts } from '../project/fields';
import {
  DEFAULT_FORM,
  oxygenClassDefaults,
  type SourceKind,
  type SoilGasMode,
  type VaporForm,
} from './form';
import { DEFAULT_OUTDOOR, type OutdoorForm } from './outdoor';
import { DEFAULT_PVI, type AfOptions, type PviForm } from './screening';
import type { OxygenMode } from './oxygenLimited';
import type { SourceChoice } from './VaporPanels';

/**
 * The vapor screen's saved state: the main form and the sub-forms of its outdoor air, attenuation
 * factor and vertical separation panels, plus which source the run reads.
 */
export interface VaporState {
  form: VaporForm;
  outdoor: OutdoorForm;
  af: AfOptions;
  pvi: PviForm;
  choice: SourceChoice;
}

export const DEFAULT_AF: AfOptions = {
  medium: 'groundwater',
  depthBelowFoundation: 0,
  preferential: false,
};
export const DEFAULT_CHOICE: SourceChoice = 'entered';

const TEXTURES = [
  'C',
  'CL',
  'L',
  'LS',
  'S',
  'SC',
  'SCL',
  'SI',
  'SIC',
  'SICL',
  'SIL',
  'SL',
  'custom',
] as const satisfies readonly (SoilTextureCode | 'custom')[];
const FOUNDATIONS = [
  'slabOnGrade',
  'basementSlab',
  'basementDirt',
  'crawlSlab',
  'crawlDirt',
] as const satisfies readonly FoundationType[];
const SOURCES = ['soil', 'soilGas', 'groundwater'] as const satisfies readonly SourceKind[];
const SOIL_GAS_MODES = ['pressure', 'entered', 'default'] as const satisfies readonly SoilGasMode[];
const AF_MEDIA = [
  'groundwater',
  'groundwaterFineGrained',
  'subSlabSoilGas',
  'exteriorSoilGas',
  'crawlspace',
] as const satisfies readonly AttenuationMedium[];
const CHOICES = [
  'entered',
  'vadose',
  'waterTable',
  'saturated',
] as const satisfies readonly SourceChoice[];

const OXYGEN_MODE_VALUES = [
  'entered',
  'fastReaction',
  'coupled',
] as const satisfies readonly OxygenMode[];

const layer = z.object({
  name: text,
  texture: z.enum(TEXTURES),
  ...texts('thickness', 'porosity', 'moisture', 'bulkDensity', 'foc'),
});

const formSchema = partialObject({
  chemicalId: text,
  ...texts('M', 'S', 'H', 'Koc', 'Da', 'Dw', 'TB', 'TC', 'dHvb', 'temperature'),
  source: z.enum(SOURCES),
  soilConc: text,
  tphOn: flag,
  ...texts('tph', 'tphMolarMass', 'soilGas', 'cgw'),
  layers: z.array(layer),
  ...texts('floorDepth', 'capHeight', 'capPorosity', 'capMoisture'),
  foundation: z.enum(FOUNDATIONS),
  ...texts(
    'floorArea',
    'volume',
    'airExchange',
    'crackFraction',
    'foundationThickness',
    'foundationPorosity',
    'foundationMoisture',
  ),
  soilGasMode: z.enum(SOIL_GAS_MODES),
  ...texts('dP', 'kv', 'seam', 'viscosity', 'viscosityModern', 'qsoil'),
  method: z.enum(['legacy', 'modern', 'devaull']),
  ...texts(
    'dvKw',
    'dvAerobicDepth',
    'dvO2Percent',
    'dvMassRatio',
    'dvDa',
    'dvDw',
    'dvH',
    'dvTotalHc',
  ),
  dvOxMode: z.enum(OXYGEN_MODE_VALUES),
  dvRespiration: flag,
});

const outdoorSchema = partialObject(
  texts('windSpeed', 'mixingHeight', 'boxLength', 'boxWidth', 'qOverC'),
);

const afSchema = partialObject({
  medium: z.enum(AF_MEDIA),
  depthBelowFoundation: z.number().finite(),
  preferential: flag,
});

const pviSchema = partialObject({
  sourceType: z.enum(['auto', 'dissolved', 'lnapl']),
  fuel: z.enum(['unweathered', 'weathered']),
  ...texts(
    'soilBenzene',
    'soilTph',
    'gwBenzene',
    'gwTph',
    'separation',
    'smallestDimension',
    'ethanol',
  ),
  preferential: flag,
  leadScavengers: flag,
  surfaceCover: flag,
  contactsBuilding: flag,
});

export const vaporProjectSchema = z.object({
  form: formSchema.optional(),
  outdoor: outdoorSchema.optional(),
  af: afSchema.optional(),
  pvi: pviSchema.optional(),
  choice: z.enum(CHOICES).optional(),
});
export type VaporProject = z.infer<typeof vaporProjectSchema>;

export function toProject(state: VaporState): VaporProject {
  const af = {
    ...state.af,
    depthBelowFoundation: Number.isFinite(state.af.depthBelowFoundation)
      ? state.af.depthBelowFoundation
      : 0,
  };
  return cloneData({
    form: state.form,
    outdoor: state.outdoor,
    af,
    pvi: state.pvi,
    choice: state.choice,
  });
}

export function fromProject(p: VaporProject | undefined): VaporState {
  return {
    // a file saved before the oxygen-limited method reads its chemical's class values, not the fixture's
    form: mergeDefaults(
      {
        ...DEFAULT_FORM,
        ...(p?.form ? oxygenClassDefaults(p.form.chemicalId ?? DEFAULT_FORM.chemicalId) : {}),
      },
      p?.form,
    ),
    outdoor: mergeDefaults(DEFAULT_OUTDOOR, p?.outdoor),
    af: mergeDefaults(DEFAULT_AF, p?.af),
    pvi: mergeDefaults(DEFAULT_PVI, p?.pvi),
    choice: p?.choice ?? DEFAULT_CHOICE,
  };
}
