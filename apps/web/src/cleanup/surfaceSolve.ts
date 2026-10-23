import {
  runLayered,
  solveSourceLevel,
  tphSource,
  type LoadingStep,
  type SaturatedSourceInput,
  type SolveResult,
} from '@model-flow/engine';
import {
  compute,
  computeBase,
  computeScaled,
  type SwBase,
  type SwOutcome,
} from '../surfaceWater/compute';
import type { SurfaceWaterFeedMethod } from '../surfaceWater/feed';
import type { SwRequest } from '../surfaceWater/inputs';
import { withFedSteps } from '../transport/compute';
import { makeZOf, type FedSource, type Scenario } from '../transport/form';
import type { VadoseScenario } from '../vadose/form';

/**
 * Surface water source levels on paths that are not linear in the source (wave V slice V2b).
 *
 * The level is the source concentration whose forward run of the surface water screen's own model gives a
 * peak surface water concentration equal to the target. The search is the engine's `solveSourceLevel`
 * (the modeled cleanup's solve: a verified linear shortcut, otherwise a bracket and Brent's method in the
 * logarithm of the source), never a table or an extrapolation. Three routes:
 *
 * - `groundwater`: a typed groundwater source (unlinked) or the held concentration c0 of a linked
 *   transport run, with the upstream background the run was entered with. The surface water is affine
 *   in the source plus the fixed background part, so the shortcut fails its check and Brent solves it.
 * - `fed`: the run's plume is fed by a vadose or saturated source screen. The unknown is that screen's
 *   soil concentration F (kg/kg); the vadose or saturated run is repeated for each trial F, the
 *   loading steps it gives feed the same aquifer, bank and surface water model.
 * - `soil`: a cleanup soil source (a vadose or saturated screen sent to the cleanup screen) carried
 *   through the same linked aquifer and bank of the surface water run, so the run must be linked.
 *
 * Every forward evaluation is the surface water screen's own model. A linked run costs seconds (the
 * transport integrals on the bank plane) and a fed one tens of seconds, so the transport is split from the
 * rest: the aquifer's response is exactly linear in the loading, so it is done once (`computeBase`) and a
 * trial is that response times the trial loading, sent through the same mixing, decay and sediment model
 * (`computeScaled`). A typed linked source is one factor on one response; a fed chain's loading steps
 * (which are not proportional to F once the leachate reaches the solubility) are a sum of the responses of
 * the single steps, built once per step. The trial equals the screen's full run to rounding (the
 * superposition test holds a forward run of each solved level to 1e-8 of the target). Only when the steps of a trial change their boundaries (a
 * depletion time that moves with F) is the trial a full run.
 */

export type SurfaceRoute = 'groundwater' | 'fed' | 'soil';

/** The soil source a cleanup carries to the surface water (route `soil`). Exactly one of the two sources. */
export interface SurfaceSoilSource {
  vadose?: VadoseScenario;
  saturated?: SaturatedSourceInput;
  /** TPH mode of the search: the entered TPH held (true) or scaled with the chemical (false, default). */
  tphHeld: boolean;
  label: string;
}

export interface SurfaceSolveJob {
  /** Hash of everything below: equal keys are the same solve. */
  key: string;
  /** The surface water run's own request. */
  request: SwRequest;
  method: SurfaceWaterFeedMethod;
  route: SurfaceRoute;
  soil?: SurfaceSoilSource;
  /** Peak surface water concentrations the source must give, kg/m3 (one solve each, sharing the forward runs). */
  targets: number[];
}

export interface SurfaceSolved {
  /** The target this solve answers, kg/m3. */
  target: number;
  /** Source level, SI (kg/m3 for groundwater, kg/kg for soil); null when not reached. */
  level: number | null;
  reached: boolean;
  /** Search ceiling, SI: the solubility of a dissolved source, pure substance (or the TPH bound) for soil. */
  limit: number | null;
  /** The largest surface water concentration seen up to the limit, kg/m3. */
  maxSurface: number;
  /** `linear` means the verified two-run shortcut held; `brent` the root find; `cap` the ceiling itself. */
  solver: SolveResult['method'];
  residual: number;
  acceptance: number;
  evaluations: number;
  iterations: number;
  warnings: string[];
  /** Why there is no level, apart from not reaching the limit (a refused input, no downward bracket). */
  reason: string | null;
}

export interface SurfaceSolveResult {
  medium: 'groundwater' | 'soil';
  numerical: boolean;
  solved: SurfaceSolved[];
  /** Set when the forward run could not be built for any target. */
  error: string | null;
}

export type SurfaceSolves = ReadonlyMap<string, SurfaceSolveResult>;

// ---------------------------------------------------------------- keys

function replacer(_k: string, v: unknown): unknown {
  return v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : v;
}

/** A 53-bit string hash (cyrb53): a stable short key for the text of a job. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + `.${text.length.toString(36)}`;
}

export function makeSurfaceJob(job: Omit<SurfaceSolveJob, 'key'>): SurfaceSolveJob {
  return { ...job, key: hash(JSON.stringify(job, replacer)) };
}

/** The key of the forward model a job runs: everything but the targets, so jobs of one source share it. */
function modelKey(job: SurfaceSolveJob): string {
  const { key: _k, targets: _t, ...rest } = job;
  void _k;
  void _t;
  return hash(JSON.stringify(rest, replacer));
}

// ---------------------------------------------------------------- the forward model

const MG_PER_L = 1e-3;
const MG_PER_KG = 1e-6;

const peakOf = (out: SwOutcome, method: SurfaceWaterFeedMethod): number => {
  if (!out.ok) throw new Error(out.error);
  const series =
    method === 'well-mixed' ? out.result.legacy.surfaceWater : out.result.modern.surfaceWater;
  return series.reduce((a, b) => Math.max(a, b), 0);
};

interface Evaluator {
  /** Peak surface water, kg/m3, for the source concentration c (memoized). */
  metric: (c: number) => number;
  start: number;
  cap: number | undefined;
  medium: 'groundwater' | 'soil';
  numerical: boolean;
}

type MassInput = { source: { F: number; FT?: number; MT?: number }; chemical: { M: number } };

/** The soil source at concentration f with TPH scaled (kept) or held, and the largest f the TPH allows. */
function sourceAt<I extends MassInput>(
  input: I,
  f: number,
  held: boolean,
): { input: I; cap: number } {
  const { F, FT, MT } = input.source;
  const tph =
    FT === undefined
      ? null
      : tphSource(
          F,
          FT,
          held ? 'held' : 'kept',
          MT === undefined ? undefined : { M: input.chemical.M, MT },
        );
  const a = tph ? tph.at(f) : { F: f, FT: undefined };
  return {
    input: {
      ...input,
      source: { ...input.source, F: a.F, ...(a.FT !== undefined ? { FT: a.FT } : {}) },
    },
    cap: tph ? tph.cap : 1,
  };
}

type Chain = 'legacy' | 'modern';

/** The vadose scenario with the source soil concentration f (both methods), and the search ceiling of `chain`. */
export function vadoseAtF(
  v: VadoseScenario,
  f: number,
  held: boolean,
  chain: Chain,
): { scenario: VadoseScenario; cap: number } {
  const modern = sourceAt(v.modern, f, held);
  const legacy = v.legacy ? sourceAt(v.legacy, f, held) : null;
  const used = chain === 'legacy' ? (legacy ?? modern) : modern;
  return {
    scenario: { ...v, modern: modern.input, legacy: legacy ? legacy.input : null },
    cap: used.cap,
  };
}

/** The saturated source input with the source soil concentration f, and the search ceiling. */
export function saturatedAtF(
  input: SaturatedSourceInput,
  f: number,
  held: boolean,
): { input: SaturatedSourceInput; cap: number } {
  const a = sourceAt({ source: input.chemical, chemical: input.chemical }, f, held);
  return { input: { ...input, chemical: { ...input.chemical, ...a.input.source } }, cap: a.cap };
}

const memoized = (f: (c: number) => number): ((c: number) => number) => {
  const seen = new Map<number, number>();
  return (c) => {
    let m = seen.get(c);
    if (m === undefined) {
      m = f(c);
      seen.set(c, m);
    }
    return m;
  };
};

function groundwaterEvaluator(job: SurfaceSolveJob): Evaluator {
  const req = job.request;
  const cap = req.solubility;
  const link = req.link;
  if (link === null) {
    const given = req.groundwaterConcentration;
    return {
      metric: memoized((c) => peakOf(compute({ ...req, groundwaterConcentration: c }), job.method)),
      start: given > 0 ? given : MG_PER_L,
      cap,
      medium: 'groundwater',
      numerical: false,
    };
  }
  const c0 = link.scenario.c0;
  if (!(c0 > 0)) {
    throw new RangeError(
      'The linked transport run holds no source concentration, so there is nothing to scale to the target.',
    );
  }
  // the aquifer's response to the held source, done once (on the first trial)
  let base: SwBase | null = null;
  const baseOf = (): SwBase => {
    if (base === null) {
      const first = computeBase(req);
      if (!first.base) {
        throw new Error(
          first.outcome.ok ? 'The linked run has no bank plane.' : first.outcome.error,
        );
      }
      base = first.base;
    }
    return base;
  };
  return {
    metric: memoized((c) => peakOf(computeScaled(req, baseOf(), c / c0), job.method)),
    start: c0,
    cap,
    medium: 'groundwater',
    numerical: false,
  };
}

function soilEvaluator(job: SurfaceSolveJob): Evaluator {
  const req = job.request;
  const link = req.link;
  if (link === null) {
    throw new RangeError(
      'The surface water run is not linked to a groundwater transport run, so it has no aquifer to carry a soil source to the bank.',
    );
  }
  const scene: Omit<Scenario, 'zOf'> = link.scenario;
  let chain: Chain;
  let origin: {
    vadose?: VadoseScenario;
    saturated?: SaturatedSourceInput;
    held: boolean;
    label: string;
  };
  if (job.route === 'fed') {
    const fed = scene.fed;
    if (!fed) throw new RangeError('The linked run is not fed by a source screen.');
    chain = fed.method;
    origin = {
      ...(fed.vadose ? { vadose: fed.vadose } : {}),
      ...(fed.saturated ? { saturated: fed.saturated } : {}),
      held: false,
      label: fed.label,
    };
  } else {
    const soil = job.soil;
    if (!soil) throw new RangeError('No soil source was given.');
    chain = job.method === 'well-mixed' ? 'legacy' : 'modern';
    origin = {
      ...(soil.vadose ? { vadose: soil.vadose } : {}),
      ...(soil.saturated ? { saturated: soil.saturated } : {}),
      held: soil.tphHeld,
      label: soil.label,
    };
  }
  const { vadose, saturated, held, label } = origin;
  const f0 = vadose
    ? (chain === 'legacy' ? (vadose.legacy ?? vadose.modern) : vadose.modern).source.F
    : saturated!.chemical.F;
  const start = f0 > 0 ? f0 : MG_PER_KG;
  let cap = 1;
  const zOf = makeZOf(scene.thickness);
  /** The loading steps (kg/s) of the source at concentration f, with the fed source that holds them. */
  const stepsAt = (f: number): { steps: LoadingStep[]; fed: FedSource } => {
    let fed: FedSource;
    if (vadose) {
      const a = vadoseAtF(vadose, f, held, chain);
      cap = a.cap;
      fed = { vadose: a.scenario, method: chain, label };
    } else {
      const a = saturatedAtF(saturated!, f, held);
      cap = a.cap;
      fed = { saturated: a.input, method: chain, label };
    }
    const resolved = withFedSteps({ ...scene, zOf, fed });
    return { steps: resolved.fed!.steps!, fed: resolved.fed! };
  };
  const requestWith = (fed: FedSource): SwRequest => ({
    ...req,
    link: { ...link, scenario: { ...scene, fed } },
  });
  let numerical = false;
  if (vadose && chain === 'modern') {
    numerical =
      runLayered({ ...vadose.modern, duration: scene.time, depths: [0], profileTimes: [] })
        .evaluation === 'finite-volume';
  }
  const ref = stepsAt(start);
  // the ceiling (pure substance, or the bound the TPH sets) does not depend on the trial
  const limit = cap;
  const refReq = requestWith(ref.fed);
  const sameBounds = (steps: readonly LoadingStep[]): boolean =>
    steps.length === ref.steps.length &&
    steps.every((s, j) => s.start === ref.steps[j]!.start && s.end === ref.steps[j]!.end);
  let top = 0;
  ref.steps.forEach((s, j) => {
    if (s.rate > ref.steps[top]!.rate) top = j;
  });
  const topRate = ref.steps[top]?.rate ?? 0;
  // the single-step runs the sum is built from: the reference rate of the step, or the largest
  // reference rate for a step that is idle at the reference
  const unit = ref.steps.map((s) => (s.rate > 0 ? s.rate : topRate));
  const columns = new Map<number, SwBase>();
  const column = (j: number): SwBase => {
    let b = columns.get(j);
    if (b === undefined) {
      const s = ref.steps[j]!;
      const one = computeBase(
        requestWith({ ...ref.fed, steps: [{ start: s.start, end: s.end, rate: unit[j]! }] }),
      );
      if (!one.base) {
        throw new Error(one.outcome.ok ? 'The linked run has no bank plane.' : one.outcome.error);
      }
      b = one.base;
      columns.set(j, b);
    }
    return b;
  };
  const superpose = (steps: readonly LoadingStep[]): SwBase => {
    const first = column(top);
    const gw = first.gw.map(() => 0);
    const discharge = first.discharge.map(() => 0);
    steps.forEach((s, j) => {
      if (!(s.rate > 0)) return;
      const a = s.rate / unit[j]!;
      const col = column(j);
      col.gw.forEach((v, i) => (gw[i] = gw[i]! + a * v));
      col.discharge.forEach((v, i) => (discharge[i] = discharge[i]! + a * v));
    });
    return { gw, discharge, groundwaterFlow: first.groundwaterFlow };
  };
  return {
    metric: memoized((c) => {
      const trial = stepsAt(c);
      if (topRate > 0 && sameBounds(trial.steps)) {
        return peakOf(computeScaled(refReq, superpose(trial.steps), 1), job.method);
      }
      return peakOf(compute(requestWith(trial.fed)), job.method);
    }),
    start,
    cap: limit,
    medium: 'soil',
    numerical,
  };
}

/** The forward models built so far in this thread, by model key; a worker keeps them for a batch of jobs. */
const MODELS = new Map<string, Evaluator>();
const MODELS_KEPT = 6;

function evaluatorOf(job: SurfaceSolveJob): Evaluator {
  const key = modelKey(job);
  let ev = MODELS.get(key);
  if (ev === undefined) {
    ev = job.route === 'groundwater' ? groundwaterEvaluator(job) : soilEvaluator(job);
    MODELS.set(key, ev);
    if (MODELS.size > MODELS_KEPT) MODELS.delete(MODELS.keys().next().value!);
  }
  return ev;
}

// ---------------------------------------------------------------- the solve

/**
 * Solves every target of a job against one shared, memoized forward model (kept between jobs of the same
 * source, so the legacy and modern receptors of one chemical build it once). Never throws.
 */
export function solveSurfaceJob(job: SurfaceSolveJob): SurfaceSolveResult {
  const medium = job.route === 'groundwater' ? 'groundwater' : 'soil';
  let ev: Evaluator;
  try {
    ev = evaluatorOf(job);
  } catch (e) {
    return {
      medium,
      numerical: false,
      solved: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
  const limit = ev.cap ?? null;
  const solved = job.targets.map((target): SurfaceSolved => {
    const base = {
      target,
      limit,
      acceptance: ev.numerical ? 1e-3 : 1e-9,
    };
    try {
      const r = solveSourceLevel({
        metric: ev.metric,
        target,
        reference: ev.start,
        cap: ev.cap,
        numerical: ev.numerical,
      });
      return {
        ...base,
        level: r.level,
        reached: r.reachable,
        maxSurface: r.maxMetric,
        solver: r.method,
        residual: r.residual,
        evaluations: r.evaluations,
        iterations: r.iterations,
        warnings: r.warnings
          .filter((w) => w.code !== 'cleanup.target-not-reachable')
          .map((w) => w.message),
        reason: null,
      };
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      const background = job.request.background > 0;
      return {
        ...base,
        level: null,
        reached: false,
        maxSurface: 0,
        solver: 'none',
        residual: Number.NaN,
        evaluations: 0,
        iterations: 0,
        warnings: [],
        reason:
          background && /no downward bracket/.test(text)
            ? 'The upstream background alone gives a surface water concentration above this target, so no source level can meet it.'
            : text,
      };
    }
  });
  return { medium: ev.medium, numerical: ev.numerical, solved, error: null };
}

/** Solves jobs in order; a job that fails is reported on its own result. */
export function solveSurfaceJobs(
  jobs: readonly SurfaceSolveJob[],
  onProgress?: (p: { done: number; total: number }) => void,
): SurfaceSolveResult[] {
  const out: SurfaceSolveResult[] = [];
  for (const job of jobs) {
    out.push(solveSurfaceJob(job));
    onProgress?.({ done: out.length, total: jobs.length });
  }
  return out;
}
