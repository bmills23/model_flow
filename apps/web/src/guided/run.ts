import { toScenario as transportScenario } from '../transport/form';
import { compute as transportCompute } from '../transport/compute';
import { buildBankFeed, buildWaterTableFeed, buildWellFeed } from '../transport/sendBuild';
import type { BankFeed } from '../transport/bankFeed';
import type { WellFeed } from '../transport/wellFeed';
import { isR7Case, toScenario as vadoseScenario } from '../vadose/form';
import { compute as vadoseCompute } from '../vadose/compute';
import type { VadoseFeed } from '../vadose/feed';
import { buildVadoseFeed } from '../vadose/sendBuild';
import { isCaseA, toScenario as saturatedScenario } from '../saturated/form';
import { compute as saturatedCompute } from '../saturated/compute';
import type { SaturatedFeed } from '../saturated/feed';
import { buildSaturatedFeed, buildSaturatedVaporFeed } from '../saturated/sendBuild';
import { toInputs as vaporInputs } from '../vapor/form';
import { runVapor } from '../vapor/compute';
import { vaporEpcs, type SourceSeries } from '../vapor/series';
import { DEFAULT_OUTDOOR } from '../vapor/outdoor';
import { buildVaporRiskFeed } from '../vapor/sendBuild';
import { toRequest as surfaceRequest } from '../surfaceWater/inputs';
import { compute as surfaceCompute } from '../surfaceWater/compute';
import { buildSurfaceWaterFeed } from '../surfaceWater/sendBuild';
import { buildHouseholdFeed } from '../household/feed';
import { buildProduceFeed, computeProduce } from '../plantsEco/produce';
import type { GuidedFormKey, GuidedState } from './state';
import {
  deriveChemical,
  MODEL_WORDS,
  runPlan,
  type ChemicalData,
  type DerivedForms,
  type ModelProblem,
  type RunPlan,
} from './derive';

/**
 * The step 3d Run for one chemical (plan section 2): it walks the chain's models in order with the
 * derived forms and calls the code the screens call (their parse, compute and send builders), so an output
 * equals what a workbench send of the same inputs holds. Pure and plain data in and out, so it runs in the
 * Run's worker; the main thread derives the jobs and records the outputs.
 */

export interface RunJob {
  chemicalId: string;
  chemicalName: string;
  plan: RunPlan;
  forms: DerivedForms;
  /** What the derivation already found (a missing value or property): those models are not run. */
  problems: ModelProblem[];
  /** The 3b values counted as half a reporting limit or as zero, in words, for the Run's notes. */
  substitutions: string[];
}

export interface ChemicalRun {
  chemicalId: string;
  /** Output values by feed key, in the shapes the screens send; only the chain's outputs. */
  outputs: Record<string, unknown>;
  problems: ModelProblem[];
}

export interface RunProgress {
  done: number;
  total: number;
  chemicalId: string;
}

/** One job per project chemical, or none while step 2 or a run setting has a problem. */
export function jobsOf(guided: GuidedState, chemicals: readonly ChemicalData[]): RunJob[] {
  const plan = runPlan(guided);
  if (plan === null || plan.problems.length > 0) return [];
  return chemicals.map((c) => {
    const d = deriveChemical(guided, plan, c);
    return {
      chemicalId: d.chemicalId,
      chemicalName: d.chemicalName,
      plan,
      forms: d.forms,
      problems: d.problems,
      substitutions: d.substitutions,
    };
  });
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function runChemical(job: RunJob): ChemicalRun {
  const { plan, forms, chemicalId, chemicalName } = job;
  const { settings } = plan;
  const problems: ModelProblem[] = [...job.problems];
  const outputs: Record<string, unknown> = {};
  const wants = (feed: string): boolean => plan.outputs.includes(feed);
  const put = (feed: string, v: unknown): void => {
    if (wants(feed)) outputs[feed] = v;
  };
  const failed = (m: GuidedFormKey): boolean => problems.some((p) => p.model === m);
  const fail = (m: GuidedFormKey, why: string): void => {
    if (!failed(m)) problems.push({ model: m, message: why });
  };
  const blocked = (m: GuidedFormKey, upstream: GuidedFormKey): void =>
    fail(
      m,
      `The ${MODEL_WORDS[m]} cannot run for ${chemicalName}, because the ${MODEL_WORDS[upstream]} gave no result for it.`,
    );
  const refused = (m: GuidedFormKey, why: string): void =>
    fail(m, `The ${MODEL_WORDS[m]} did not run for ${chemicalName}: ${why}`);
  /** Run one model's step, turning anything it throws into a problem of that model. */
  const step = (m: GuidedFormKey, go: () => void): void => {
    if (!plan.models.includes(m) || failed(m)) return;
    try {
      go();
    } catch (e) {
      refused(m, message(e));
    }
  };

  // what each model gave, for the models after it (a holder, since the steps assign it in callbacks)
  const got: {
    vadose: VadoseFeed | null;
    saturated: SaturatedFeed | null;
    satVapor: SourceSeries | null;
    well: WellFeed | null;
    bank: BankFeed | null;
    waterTable: SourceSeries | null;
  } = { vadose: null, saturated: null, satVapor: null, well: null, bank: null, waterTable: null };
  step('vadose', () => {
    const f = forms.vadose!;
    const parsed = vadoseScenario(f);
    if (!parsed.ok) return refused('vadose', parsed.errors.join('; '));
    const out = vadoseCompute({ scenario: parsed.scenario });
    if (!out.ok) return refused('vadose', out.error);
    const other = f.method === 'legacy' ? 'modern' : 'legacy';
    const run = out.result.runs[f.method] ?? out.result.runs[other];
    if (!run) return refused('vadose', 'neither method gave a result.');
    got.vadose = buildVadoseFeed({
      scenario: parsed.scenario,
      method: run.method,
      r7: isR7Case(f),
      chemicalId,
    });
    put('vadose', got.vadose);
  });

  step('saturated', () => {
    const f = forms.saturated!;
    const parsed = saturatedScenario(f);
    if (!parsed.ok) return refused('saturated', parsed.errors.join('; '));
    const out = saturatedCompute({ scenario: parsed.scenario });
    if (!out.ok) return refused('saturated', out.error);
    const runs = out.result.runs;
    const method = runs[settings.basis] ? settings.basis : runs.legacy ? 'legacy' : 'modern';
    const caseA = isCaseA(f);
    got.saturated = buildSaturatedFeed({ input: parsed.scenario.input, method, caseA, chemicalId });
    put('saturated', got.saturated);
    got.satVapor = buildSaturatedVaporFeed({ run: runs[method]!, method, caseA, chemicalId });
    if (got.satVapor !== null) put('vaporSaturated', got.satVapor);
  });

  if (plan.transportSource === 'soilAbove' && got.vadose === null) blocked('transport', 'vadose');
  if (plan.transportSource === 'soilBelow' && got.saturated === null)
    blocked('transport', 'saturated');
  step('transport', () => {
    const f = forms.transport!;
    const parsed = transportScenario(f, got.vadose, got.saturated);
    if (!parsed.ok) return refused('transport', parsed.errors.join('; '));
    const scenario = parsed.scenario;
    // only the receptor curve is read, so the plan-view grid is the smallest the compute takes
    const out = transportCompute({
      scenario,
      mapMethod: settings.basis,
      domenico: false,
      nx: 2,
      ny: 2,
      nCurve: settings.nCurve,
    });
    if (!out.ok) return refused('transport', out.error);
    got.well = buildWellFeed({
      method: settings.basis,
      result: out.result,
      scenario,
      timeYr: f.timeYr,
      chemicalId,
    });
    if (got.well !== null) put('well', got.well);
    got.bank = buildBankFeed({ scenario, timeYr: f.timeYr, chemicalId });
    put('bank', got.bank);
    if (wants('vaporWaterTable') || (plan.buildingSource === 'groundwater' && plan.downgradient)) {
      got.waterTable = buildWaterTableFeed({
        scenario,
        method: settings.basis,
        timeYr: f.timeYr,
        chemicalId,
      });
      put('vaporWaterTable', got.waterTable);
    }
  });

  const series = (): SourceSeries | null | undefined => {
    if (plan.buildingSource === 'soilBelow') return got.satVapor;
    if (plan.buildingSource === 'groundwater' && plan.downgradient) return got.waterTable;
    return undefined;
  };
  const active = series();
  if (active === null) {
    if (plan.buildingSource === 'soilBelow' && got.saturated !== null) {
      refused(
        'vapor',
        'the saturated source never has pore water above the water table, so it gives no vapor source.',
      );
    } else {
      blocked('vapor', plan.buildingSource === 'soilBelow' ? 'saturated' : 'transport');
    }
  }
  step('vapor', () => {
    const f = forms.vapor!;
    const parsed = vaporInputs(f);
    if (!parsed.ok) return refused('vapor', parsed.errors.join('; '));
    const shown = runVapor(parsed);
    const source = active ?? null;
    const feedEpcs = source ? vaporEpcs(f, parsed, source, DEFAULT_OUTDOOR) : null;
    const feed = buildVaporRiskFeed({
      form: f,
      formValid: true,
      shownParsed: parsed,
      shown,
      outdoorForm: DEFAULT_OUTDOOR,
      method: f.method,
      chemical: { id: chemicalId, name: chemicalName },
      refusedChoice: false,
      active: source,
      feedEpcs,
    });
    if (feed === null) {
      const o = shown[f.method];
      return refused(
        'vapor',
        o && !o.ok ? o.error : (feedEpcs?.errors[f.method] ?? 'the method gave no indoor air.'),
      );
    }
    put('vaporRisk', feed);
  });

  if (plan.models.includes('surfaceWater') && got.bank === null)
    blocked('surfaceWater', 'transport');
  step('surfaceWater', () => {
    const f = forms.surfaceWater!;
    const parsed = surfaceRequest(f, got.bank);
    if (!parsed.ok) return refused('surfaceWater', parsed.errors.join('; '));
    const out = surfaceCompute(parsed.request);
    if (!out.ok) return refused('surfaceWater', out.error);
    put(
      'surfaceWater',
      buildSurfaceWaterFeed({
        result: out.result,
        request: parsed.request,
        method: settings.surfaceMethod,
        chemicalId,
      }),
    );
  });

  if (plan.models.includes('household') && got.well === null) blocked('household', 'transport');
  step('household', () => {
    const r = buildHouseholdFeed(forms.household!, { well: got.well, surface: null });
    if (!r.ok) return refused('household', r.reasons.join('; '));
    put('household', r.feed);
  });

  if (wants('produce')) {
    step('plantsEco', () => {
      const f = forms.plantsEco!;
      const r = buildProduceFeed(f, computeProduce(f));
      if (!r.ok) return refused('plantsEco', r.reasons.join('; '));
      put('produce', r.feed);
    });
  }

  return { chemicalId, outputs, problems };
}

/** Every job one after another, with progress after each chemical. */
export function runAll(
  jobs: readonly RunJob[],
  onProgress?: (p: RunProgress) => void,
): ChemicalRun[] {
  const out: ChemicalRun[] = [];
  jobs.forEach((job, i) => {
    out.push(runChemical(job));
    onProgress?.({ done: i + 1, total: jobs.length, chemicalId: job.chemicalId });
  });
  return out;
}

/** What the Run's worker posts: progress after each chemical, then the runs or the error that stopped it. */
export type RunReply = { ok: true; runs: ChemicalRun[] } | { ok: false; error: string };
export type RunMessage = RunReply | { progress: RunProgress };

/** The worker's whole conversation for one Run, apart from the worker so it can be tested. */
export function runMessages(jobs: readonly RunJob[], post: (m: RunMessage) => void): void {
  try {
    post({ ok: true, runs: runAll(jobs, (progress) => post({ progress })) });
  } catch (err) {
    post({ ok: false, error: message(err) });
  }
}
