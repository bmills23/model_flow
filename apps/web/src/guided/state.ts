import type { PathwayId } from '@model-flow/engine';
import { defaultReceptor, type ReceptorForm } from '../risk/form';
import type { HouseholdProject } from '../household/project';
import type { PlantsEcoProject } from '../plantsEco/project';
import type { SaturatedProject } from '../saturated/project';
import type { SurfaceWaterProject } from '../surfaceWater/project';
import type { TransportProject } from '../transport/project';
import type { VadoseProject } from '../vadose/project';
import type { VaporProject } from '../vapor/project';
import { stableStringify } from '../project/hash';
import type { GuidedKeptLevel } from './levels';

/**
 * The guided flow's project state (format version 3, the `guided` key): every step's answers and the
 * outputs of the step 3d Run. The model screens keep their own forms and sent feeds untouched.
 */

export type GuidedReceptors = 'human' | 'ecological';
export type GuidedBasis = 'modeled' | 'measured';
/** The sources the fate models start from. */
export const MODELED_SOURCE_KEYS = ['soilAbove', 'groundwater', 'soilGas', 'soilBelow'] as const;
export type ModeledSourceKey = (typeof MODELED_SOURCE_KEYS)[number];
/** The media a measured concentration can be entered for. */
export const MEASURED_MEDIUM_KEYS = [
  'soil',
  'groundwater',
  'surfaceWater',
  'indoorAir',
  'outdoorAir',
] as const;
export type MeasuredMediumKey = (typeof MEASURED_MEDIUM_KEYS)[number];
/** A key of `GuidedSource.values`: a modeled source or a measured medium. */
export type SourceValueKey = ModeledSourceKey | MeasuredMediumKey;
export type GuidedLocation = 'onsite' | 'downgradient';
export type IndoorModel = 'legacy' | 'modern' | 'oxygenLimited';
export type GuidedProduce = 'none' | 'soil' | 'irrigation';

export interface GuidedSite {
  receptors: GuidedReceptors;
  basis: GuidedBasis;
  sources: ModeledSourceKey[];
  measured: MeasuredMediumKey[];
  location: GuidedLocation;
  paths: { leaching: boolean; well: boolean; building: boolean; stream: boolean };
  indoorModel: IndoorModel;
  produce: GuidedProduce;
}

/** The step 3a templates: a screen form with the chemical fields and source concentrations left out. */
export interface GuidedForms {
  transport?: NonNullable<TransportProject['form']>;
  vadose?: NonNullable<VadoseProject['form']>;
  saturated?: NonNullable<SaturatedProject['form']>;
  vapor?: NonNullable<VaporProject['form']>;
  surfaceWater?: NonNullable<SurfaceWaterProject['form']>;
  household?: NonNullable<HouseholdProject['form']>;
  plantsEco?: NonNullable<PlantsEcoProject['form']>;
}
export type GuidedFormKey = keyof GuidedForms;
export const GUIDED_FORM_KEYS = [
  'transport',
  'vadose',
  'saturated',
  'vapor',
  'surfaceWater',
  'household',
  'plantsEco',
] as const satisfies readonly GuidedFormKey[];

/**
 * The fields of each screen form that a template leaves out, because a chemical or a source
 * concentration fills them per chemical at Run. Every other field of the form stays in the template.
 */
export const TEMPLATE_STRIPPED: Readonly<Record<GuidedFormKey, readonly string[]>> = {
  transport: ['chemicalId', 'halfLifeYr', 'kd', 'c0'],
  vadose: ['chemicalId', 'M', 'S', 'H', 'Koc', 'Da', 'Dw', 'mu', 'srcF'],
  saturated: ['chemicalId', 'M', 'S', 'H', 'Koc', 'F'],
  vapor: [
    'chemicalId',
    'M',
    'S',
    'H',
    'Koc',
    'Da',
    'Dw',
    'TB',
    'TC',
    'dHvb',
    'soilConc',
    'soilGas',
    'cgw',
  ],
  surfaceWater: ['chemicalId', 'koc', 'kd', 'solubility', 'groundwaterConcentration'],
  household: [
    'chemicalId',
    'chemicalName',
    'henry',
    'molecularWeight',
    'henryAtm',
    'vaporPressure',
    'waterConcentration',
    'soilConcentration',
  ],
  plantsEco: [
    'chemicalId',
    'chemicalName',
    'logKow',
    'koc',
    'kd',
    'userBcf',
    'tscf',
    'ionizable',
    'inorganic',
    'soilConcentration',
  ],
};

export interface SourceValue {
  value: string;
  unit: string;
}
/** Step 3b: one chemical's source concentrations by medium, with a note and its TPH total. */
export interface GuidedSource {
  values: Partial<Record<SourceValueKey, SourceValue>>;
  note: string;
  tph: string;
}

export interface GuidedRun {
  timeYr: string;
  stepYr: string;
  sourceYr: string;
  basis: 'modern' | 'legacy';
}

/**
 * One step 3d output slot: the value in the shape of the feed it stands for (`feedShapes` in
 * `project/schema.ts`), with the hash of the inputs it was run from.
 */
export interface GuidedOutput {
  inputsHash: string;
  value: unknown;
}
/** Output slots by feed key, then by chemical id. */
export type GuidedOutputs = Record<string, Record<string, GuidedOutput>>;

/**
 * What the last Run found for one chemical: why a model did not run (a missing value, a refused input), and
 * the live inputs hash of each chain output the Run could not produce. An output with no result is
 * "blocked", not "missing", while the live hash still equals the one recorded here, so running again is
 * known to change nothing until an input changes.
 */
export interface GuidedRunNote {
  problems: { model: GuidedFormKey; message: string }[];
  feeds: Record<string, string>;
  /**
   * Each 3b value the Run counted as half its reporting limit ("<x") or as zero (ND), in plain words with
   * the unit, per chemical and medium. Absent when the chemical had none.
   */
  substitutions?: string[];
}
/** Run notes by chemical id. */
export type GuidedRunNotes = Record<string, GuidedRunNote>;

export interface GuidedExposure {
  pathways: Partial<Record<PathwayId, boolean>>;
  a: ReceptorForm;
  b: ReceptorForm | null;
  additive: boolean;
}

export type StandardKind = 'risk' | 'mcl' | 'state';
export interface GuidedStandard {
  kind: StandardKind;
  value: string;
  unit: string;
  source: string;
}
export type GuidedAllocation = 'individual' | 'cumulative' | 'equal';
export interface GuidedTargets {
  mode: 'risk' | 'cleanup';
  allocation: GuidedAllocation;
  targetRisk: string;
  targetHq: string;
  standards: Record<string, GuidedStandard>;
}

export interface GuidedState {
  site: GuidedSite;
  forms: GuidedForms;
  sources: Record<string, GuidedSource>;
  run: GuidedRun;
  outputs: GuidedOutputs;
  /** The reasons of the last Run, kept with the project so a reload or a return to 3d still shows them. */
  runNotes: GuidedRunNotes;
  exposure: GuidedExposure;
  targets: GuidedTargets;
  /**
   * The step 5 cleanup levels kept per chemical (`guided/levels.ts`), judged current by the guided
   * fingerprint (`guided/solve.ts`). Optional: absent means none are kept.
   */
  levels?: Record<string, GuidedKeptLevel>;
}

export const defaultGuidedSite = (): GuidedSite => ({
  receptors: 'human',
  basis: 'modeled',
  sources: [],
  measured: [],
  location: 'onsite',
  paths: { leaching: false, well: false, building: false, stream: false },
  indoorModel: 'modern',
  produce: 'none',
});

export const defaultGuidedRun = (): GuidedRun => ({
  timeYr: '30',
  stepYr: '1',
  sourceYr: '10',
  basis: 'modern',
});

export const defaultGuidedExposure = (): GuidedExposure => ({
  pathways: {},
  a: defaultReceptor('resident'),
  b: null,
  additive: false,
});

export const defaultGuidedTargets = (): GuidedTargets => ({
  mode: 'risk',
  allocation: 'individual',
  targetRisk: '',
  targetHq: '',
  standards: {},
});

/** A new project's guided state: nothing chosen, nothing run. */
export const defaultGuided = (): GuidedState => ({
  site: defaultGuidedSite(),
  forms: {},
  sources: {},
  run: defaultGuidedRun(),
  outputs: {},
  runNotes: {},
  exposure: defaultGuidedExposure(),
  targets: defaultGuidedTargets(),
});

export const isDefaultGuided = (g: GuidedState): boolean =>
  stableStringify(g) === stableStringify(defaultGuided());

/** The state without a chemical's sources and outputs (it left the project). */
export function withoutGuidedChemical(g: GuidedState, chemicalId: string): GuidedState {
  const { [chemicalId]: _source, ...sources } = g.sources;
  void _source;
  const { [chemicalId]: _standard, ...standards } = g.targets.standards;
  void _standard;
  const outputs: GuidedOutputs = {};
  for (const [key, slots] of Object.entries(g.outputs)) {
    const { [chemicalId]: _gone, ...rest } = slots;
    void _gone;
    if (Object.keys(rest).length > 0) outputs[key] = rest;
  }
  const { [chemicalId]: _note, ...runNotes } = g.runNotes;
  void _note;
  const next: GuidedState = {
    ...g,
    sources,
    outputs,
    runNotes,
    targets: { ...g.targets, standards },
  };
  if (g.levels !== undefined) {
    const { [chemicalId]: _level, ...levels } = g.levels;
    void _level;
    if (Object.keys(levels).length > 0) next.levels = levels;
    else delete next.levels;
  }
  return next;
}
