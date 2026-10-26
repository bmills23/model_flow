import { mergeDefaults } from '../project/merge';
import { DEFAULT_FORM as TRANSPORT_DEFAULT, type TransportForm } from '../transport/form';
import { kdText } from '../transport/chemicalFill';
import { DEFAULT_FORM as VADOSE_DEFAULT, type VadoseForm } from '../vadose/form';
import { DEFAULT_FORM as SATURATED_DEFAULT, type SaturatedForm } from '../saturated/form';
import { DEFAULT_FORM as VAPOR_DEFAULT, type VaporForm } from '../vapor/form';
import { chemicalFields, type VaporChemicalRow } from '../vapor/chemicals';
import { DEFAULT_FORM as SW_DEFAULT, type SwForm } from '../surfaceWater/inputs';
import type { SurfaceWaterFeedMethod } from '../surfaceWater/feed';
import { DEFAULT_FORM as HOUSEHOLD_DEFAULT, type HouseholdForm } from '../household/form';
import { DEFAULT_FORM as PLANTS_DEFAULT, type PlantsEcoForm } from '../plantsEco/form';
import { FATE_FIELDS, type FateKey } from '../overrides/userChemicals';
import { chain, SOURCE_LABELS } from './chain';
import {
  TEMPLATE_STRIPPED,
  type GuidedFormKey,
  type GuidedState,
  type ModeledSourceKey,
  type SourceValueKey,
} from './state';
import { sourceNumber } from './units';

/**
 * The step 3d Run's inputs, derived per chemical (plan section 2): the model forms the Run walks are the
 * step 3a templates laid over each screen's default, with the chemical's database values (with the
 * project's 3c edits, carried by the row the caller passes), its 3b source values in model units, the run
 * settings and the chain's wiring filled in. Pure: no store, no engine call.
 */

/** What the Run knows of one project chemical. */
export interface ChemicalData {
  id: string;
  name: string;
  /**
   * The fate row (`useChemicalRows`: database or user chemical, with the 3c edits laid over), or
   * undefined when the chemical has none.
   */
  fate?: VaporChemicalRow | undefined;
  /** The cleanup partition properties the produce model reads (log Kow, Koc, Kd), when known. */
  props?: { logKow?: number; koc?: number; kd?: number } | undefined;
}

/** The full screen forms one chemical's Run uses, one per chosen model. */
export interface DerivedForms {
  transport?: TransportForm;
  vadose?: VadoseForm;
  saturated?: SaturatedForm;
  vapor?: VaporForm;
  surfaceWater?: SwForm;
  household?: HouseholdForm;
  plantsEco?: PlantsEcoForm;
}

export interface ModelProblem {
  model: GuidedFormKey;
  message: string;
}

export interface DerivedChemical {
  chemicalId: string;
  chemicalName: string;
  forms: DerivedForms;
  /** Why a model cannot run for this chemical (a missing 3b value or database property). */
  problems: ModelProblem[];
}

export type VaporMethodKey = 'legacy' | 'modern' | 'devaull';

/** The run settings as the models read them (plan section 2, "Run settings"). */
export interface RunSettings {
  basis: 'legacy' | 'modern';
  /** Time steps on the well curve: the simulation time over the time step. */
  nCurve: number;
  vaporMethod: VaporMethodKey;
  surfaceMethod: SurfaceWaterFeedMethod;
}

/** How the chain wires the models, the same for every chemical. */
export interface RunPlan {
  models: GuidedFormKey[];
  outputs: string[];
  /** The source the groundwater transport run starts from; null when transport does not run. */
  transportSource: 'groundwater' | 'soilBelow' | 'soilAbove' | null;
  /** The source indoor air takes (precedence: soil gas, soil above, soil below, groundwater). */
  buildingSource: ModeledSourceKey | null;
  downgradient: boolean;
  /** The 3b medium that gives the produce model its soil concentration, or null. */
  produceSoil: SourceValueKey | null;
  settings: RunSettings;
  /** Why the Run cannot start (a run setting it cannot read). */
  problems: string[];
}

/** The most curve steps a Run computes: a finer time step is coarsened to this. */
export const MAX_CURVE_STEPS = 500;

export const MODEL_WORDS: Record<GuidedFormKey, string> = {
  transport: 'groundwater transport model',
  vadose: 'leaching model',
  saturated: 'saturated soil source model',
  vapor: 'indoor air model',
  surfaceWater: 'surface water model',
  household: 'shower and irrigation model',
  plantsEco: 'produce model',
};

const positive = (s: string): number | null => {
  const v = s.trim() === '' ? NaN : Number(s);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** The chain and run settings as the Run reads them, or null while step 2 has a problem. */
export function runPlan(guided: GuidedState): RunPlan | null {
  const c = chain(guided.site);
  if (c.problems.length > 0) return null;
  const run = guided.run;
  const problems: string[] = [];
  const time = positive(run.timeYr);
  const step = positive(run.stepYr);
  let nCurve = 32;
  if (step === null) {
    problems.push('The time step must be a number of years above zero.');
  } else if (time !== null) {
    nCurve = Math.min(MAX_CURVE_STEPS, Math.max(1, Math.round(time / step)));
  }

  const runsTransport = c.models.includes('transport');
  const wellPath = c.paths.find(
    (p) => (p.path === 'well' || p.path === 'stream') && p.source !== null,
  );
  const building = c.paths.find((p) => p.path === 'building');
  let transportSource: RunPlan['transportSource'] = null;
  if (runsTransport) {
    const s = wellPath?.source ?? (building?.source === 'groundwater' ? 'groundwater' : null);
    if (s === 'groundwater' || s === 'soilBelow' || s === 'soilAbove') transportSource = s;
  }
  const buildingSource =
    building?.source === 'soilGas' ||
    building?.source === 'soilAbove' ||
    building?.source === 'soilBelow' ||
    building?.source === 'groundwater'
      ? building.source
      : null;

  let produceSoil: SourceValueKey | null = null;
  if (c.models.includes('plantsEco') && guided.site.produce === 'soil') {
    produceSoil = guided.site.basis === 'measured' ? 'soil' : 'soilAbove';
  } else if (c.models.includes('plantsEco') && guided.site.receptors === 'ecological') {
    produceSoil = guided.site.sources.includes('soilAbove') ? 'soilAbove' : null;
  }

  return {
    models: c.models,
    outputs: c.outputs,
    transportSource,
    buildingSource,
    downgradient: guided.site.location === 'downgradient',
    produceSoil,
    settings: {
      basis: run.basis,
      nCurve,
      vaporMethod:
        guided.site.indoorModel === 'oxygenLimited'
          ? 'devaull'
          : guided.site.indoorModel === 'legacy'
            ? 'legacy'
            : 'modern',
      surfaceMethod: run.basis === 'legacy' ? 'well-mixed' : 'mass-discharge',
    },
    problems,
  };
}

/** A number as form text, without float noise (0.0012000000000000001 reads 0.0012). */
const numText = (v: number): string => String(Number(v.toPrecision(12)));
/** A database value as the screens fill it (`fateFill`): its own text. */
const text = (v: number | undefined): string => (v === undefined ? '' : String(v));

/** The template laid over the screen default, with every per-chemical field blanked. */
function base<T>(key: GuidedFormKey, defaults: T, guided: GuidedState): T {
  const out = mergeDefaults(defaults, guided.forms[key]) as Record<string, unknown>;
  const def = defaults as Record<string, unknown>;
  for (const k of TEMPLATE_STRIPPED[key]) {
    const d = def[k];
    out[k] = typeof d === 'boolean' ? false : '';
  }
  return out as T;
}

/** The fate properties each model cannot run without. */
const REQUIRED: Partial<Record<GuidedFormKey, readonly FateKey[]>> = {
  vadose: ['mw', 's', 'hPrime', 'koc', 'dia', 'diw'],
  saturated: ['mw', 's', 'hPrime', 'koc'],
  vapor: ['mw', 's', 'hPrime', 'dia', 'diw'],
  household: ['mw', 'hPrime'],
};

export function deriveChemical(
  guided: GuidedState,
  plan: RunPlan,
  chem: ChemicalData,
): DerivedChemical {
  const problems: ModelProblem[] = [];
  const forms: DerivedForms = {};
  const has = (m: GuidedFormKey): boolean => plan.models.includes(m);
  const rsl = chem.fate?.rsl ?? {};
  const prop = (k: FateKey): string => text(rsl[k]?.value);
  const { settings } = plan;
  const run = guided.run;

  /** The 3b value of a medium in model units, or '' with a problem for the model that needs it. */
  const source = (medium: SourceValueKey, model: GuidedFormKey): string => {
    const v = guided.sources[chem.id]?.values[medium];
    const n = v === undefined ? null : sourceNumber(v.value, v.unit, medium);
    if (n === null) {
      if (!problems.some((p) => p.model === model)) {
        problems.push({
          model,
          message: `${chem.name} has no usable ${SOURCE_LABELS[medium].toLowerCase()} concentration in step 3b, so the ${MODEL_WORDS[model]} cannot run for it. Enter a number above zero, or ND for not detected.`,
        });
      }
      return '';
    }
    return numText(n);
  };
  const tph = ((): string | null => {
    const t = guided.sources[chem.id]?.tph ?? '';
    const n = positive(t);
    return n === null ? null : numText(n);
  })();

  for (const m of plan.models) {
    const need = REQUIRED[m] ?? [];
    const missing = FATE_FIELDS.filter((f) => need.includes(f.key) && rsl[f.key] === undefined);
    if (missing.length === 0) continue;
    problems.push({
      model: m,
      message:
        chem.fate === undefined
          ? `${chem.name} has no chemical properties in the database, so the ${MODEL_WORDS[m]} cannot run for it. Define it as your own chemical in step 1.`
          : `${chem.name} has no ${missing.map((f) => f.label.toLowerCase()).join(', ')} in the database, so the ${MODEL_WORDS[m]} cannot run for it. Enter the value in step 3c.`,
    });
  }

  if (has('vadose')) {
    const f = base('vadose', VADOSE_DEFAULT, guided);
    f.chemicalId = chem.id;
    f.M = prop('mw');
    f.S = prop('s');
    f.H = prop('hPrime');
    f.Koc = prop('koc');
    f.Da = prop('dia');
    f.Dw = prop('diw');
    // no per-chemical decay input yet: the leachate does not decay
    f.mu = '0';
    f.srcF = source('soilAbove', 'vadose');
    f.tphOn = tph !== null;
    if (tph !== null) f.srcFT = tph;
    f.durationYr = run.timeYr;
    f.method = settings.basis;
    forms.vadose = f;
  }

  if (has('saturated')) {
    const f = base('saturated', SATURATED_DEFAULT, guided);
    f.chemicalId = chem.id;
    f.M = prop('mw');
    f.S = prop('s');
    f.H = prop('hPrime');
    f.Koc = prop('koc');
    f.F = source('soilBelow', 'saturated');
    f.tphOn = tph !== null;
    if (tph !== null) f.FT = tph;
    f.horizonYr = run.timeYr;
    f.method = settings.basis;
    forms.saturated = f;
  }

  if (has('transport')) {
    const f = base('transport', TRANSPORT_DEFAULT, guided);
    f.chemicalId = chem.id;
    // the half-life is not in the database and has no guided input yet: no decay
    f.halfLifeYr = '';
    const koc = rsl.koc?.value;
    if (koc !== undefined) {
      f.retardMode = 'kd';
      f.kd = kdText(koc, f.foc, '');
    }
    f.timeYr = run.timeYr;
    f.feedFromVadose = plan.transportSource === 'soilAbove';
    f.feedFromSaturated = plan.transportSource === 'soilBelow';
    if (plan.transportSource === 'groundwater') {
      f.sourceMode = 'concentration';
      f.c0 = source('groundwater', 'transport');
      const pulse = positive(run.sourceYr);
      if (pulse === null) {
        f.loading = 'continuous';
      } else {
        f.loading = 'pulse';
        f.pulseYr = run.sourceYr.trim();
      }
    }
    forms.transport = f;
  }

  if (has('vapor')) {
    const f = base('vapor', VAPOR_DEFAULT, guided);
    if (chem.fate !== undefined) Object.assign(f, chemicalFields(chem.fate));
    f.chemicalId = chem.id;
    f.method = settings.vaporMethod;
    const b = plan.buildingSource;
    if (b === 'soilGas') {
      f.source = 'soilGas';
      f.soilGas = source('soilGas', 'vapor');
    } else if (b === 'soilAbove') {
      f.source = 'soil';
      f.soilConc = source('soilAbove', 'vapor');
      f.tphOn = tph !== null;
      if (tph !== null) f.tph = tph;
      if (f.Koc === '') {
        problems.push({
          model: 'vapor',
          message: `${chem.name} has no koc in the database, so the ${MODEL_WORDS.vapor} cannot run for it from soil. Enter the value in step 3c.`,
        });
      }
    } else if (b === 'groundwater' && !plan.downgradient) {
      f.source = 'groundwater';
      f.cgw = source('groundwater', 'vapor');
    } else if (b === 'groundwater') {
      // the water table series of the transport run is the source; the entered value is not read
      f.source = 'groundwater';
      f.cgw = '0';
    } else if (b === 'soilBelow') {
      // the pore water series of the saturated run is the source; the entered value is not read
      f.source = 'soilGas';
      f.soilGas = '0';
    }
    forms.vapor = f;
  }

  if (has('surfaceWater')) {
    const f = base('surfaceWater', SW_DEFAULT, guided);
    f.chemicalId = chem.id;
    f.koc = prop('koc');
    f.kd = '';
    f.solubility = prop('s');
    // the linked transport run is the groundwater; the entered value is not read
    f.groundwaterConcentration = '0';
    f.linked = true;
    f.durationYr = run.timeYr;
    if (f.bankX.trim() === '' && forms.transport) f.bankX = forms.transport.rx;
    forms.surfaceWater = f;
  }

  if (has('household')) {
    const f = base('household', HOUSEHOLD_DEFAULT, guided);
    f.chemicalId = chem.id;
    f.chemicalName = chem.name;
    f.henry = prop('hPrime');
    f.molecularWeight = prop('mw');
    f.showerWaterSource = 'well';
    f.irrigationWaterSource = 'well';
    if (guided.site.sources.includes('soilAbove')) {
      const v = guided.sources[chem.id]?.values.soilAbove;
      const n = v === undefined ? null : sourceNumber(v.value, v.unit, 'soilAbove');
      if (n !== null) f.soilConcentration = numText(n);
    }
    forms.household = f;
  }

  if (has('plantsEco')) {
    const f = base('plantsEco', PLANTS_DEFAULT, guided);
    f.chemicalId = chem.id;
    f.chemicalName = chem.name;
    f.logKow = text(chem.props?.logKow);
    // a 3c edit of Koc rides on the fate row; the cleanup properties fill in when it has none
    f.koc = rsl.koc !== undefined ? prop('koc') : text(chem.props?.koc);
    f.kd = text(chem.props?.kd);
    if (plan.produceSoil !== null) f.soilConcentration = source(plan.produceSoil, 'plantsEco');
    forms.plantsEco = f;
  }

  return { chemicalId: chem.id, chemicalName: chem.name, forms, problems };
}
