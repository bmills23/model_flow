import {
  NUMERICAL_TOLERANCE,
  SHORTCUT_TOLERANCE,
  backCalculateLegacy,
  backCalculateModern,
  evaluateModeled,
  legacyEvaluator,
  modernEvaluator,
  resolveConcentrationTarget,
  resolveRiskTargets,
  solveModeled,
  type ChainChemical,
  type DirectResult,
  type ModeledEndpoint,
  type ModeledInput,
  type PathwayId,
} from '@model-flow/engine';
import { curveDomain, logGrid } from './chartData';
import { buildChain, LABELS, type Method } from './modeledChains';
import type {
  Convergence,
  MetricCurve,
  ModeledMethodOutcome,
  ModeledOutcome,
  ModeledRequest,
  ModeledRun,
} from './modeledTypes';
import type { CleanupLegacyInput, CleanupModernInput } from './build';

export type MethodOutcome<R> = { ok: true; result: R } | { ok: false; error: string };

export interface CleanupOutcome {
  legacy: MethodOutcome<DirectResult>;
  modern: MethodOutcome<DirectResult>;
}

function attempt<I>(run: (input: I) => DirectResult, input: I): MethodOutcome<DirectResult> {
  try {
    return { ok: true, result: run(input) };
  } catch (e) {
    // The engine throws RangeError for inputs it refuses; one method refusing does not stop the other.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Runs both methods on the same scenario; an input one of them refuses is reported for it alone. */
export function runCleanup(inputs: {
  legacy: CleanupLegacyInput;
  modern: CleanupModernInput;
}): CleanupOutcome {
  return {
    legacy: attempt(backCalculateLegacy, inputs.legacy),
    modern: attempt(backCalculateModern, inputs.modern),
  };
}

const CURVE_POINTS = 21;

function runMethod(req: ModeledRequest, method: Method): ModeledRun {
  const { chain, tph, sourceStart } = buildChain(req, method);
  const side = method === 'legacy' ? req.legacy : req.modern;
  const pathways = [...new Set(side.receptors.flatMap((r) => r.pathways))] as PathwayId[];
  const start = req.start ?? sourceStart ?? chain.reference;
  const cc: ChainChemical<never> = {
    id: req.chemical.id,
    chemical: side.chemical as never,
    chain,
    ...(req.start !== undefined ? { entered: req.start } : {}),
    ...(tph ? { tph } : {}),
    ...(req.chemical.csat !== undefined ? { csat: req.chemical.csat } : {}),
  };
  if (req.target.kind !== 'risk') {
    cc.concentrationTarget =
      req.target.kind === 'user' ? { kind: 'user', value: req.target.value } : { kind: 'mcl' };
    if (req.chemical.mcl !== undefined) {
      cc.mcl = { value: req.chemical.mcl, ...(req.chemical.mclGroup ? { group: true } : {}) };
    }
  }
  const evaluate =
    method === 'legacy'
      ? legacyEvaluator(req.legacy.receptors, req.additive)
      : modernEvaluator(req.modern.receptors, req.additive);
  const input = {
    evaluate,
    pathways,
    chemicals: [cc],
    targets: req.targets,
    allocation: 'individual',
    averagingWindow: req.windowSeconds,
    secantParity: req.secantParity,
  } as unknown as ModeledInput<never>;
  const result = solveModeled(input);
  const lv = result.levels[0]!;

  const endpoint: ModeledEndpoint =
    lv.solves.concentration !== undefined
      ? 'concentration'
      : (lv.limiting ?? ((lv.solves.cancer?.maxMetric ?? 0) > 0 ? 'cancer' : 'noncancer'));
  const risk = resolveRiskTargets(req.targets);
  let target: number;
  if (endpoint === 'concentration') {
    const spec =
      req.target.kind === 'user'
        ? ({ kind: 'user', value: req.target.value } as const)
        : { kind: 'mcl' as const };
    target = resolveConcentrationTarget(
      req.chemical.id,
      spec,
      req.chemical.mcl === undefined ? undefined : { value: req.chemical.mcl },
    ).value!;
  } else {
    target = endpoint === 'cancer' ? risk.risk : risk.hq;
  }

  const cap = chain.cap ?? null;
  const [lo, hi] = curveDomain(lv.level, start, chain.cap);
  const conc = logGrid(lo, hi, CURVE_POINTS);
  const curve: MetricCurve = { conc, cancer: [], hi: [], peak: [] };
  for (const c of conc) {
    const m = evaluateModeled(input, 0, c);
    curve.cancer.push(m.cancer);
    curve.hi.push(m.hi);
    curve.peak.push(m.peak);
  }

  const solve = lv.solves[endpoint];
  const numerical = chain.numerical;
  const convergence: Convergence = {
    method: solve?.method ?? 'none',
    evaluations: solve?.evaluations ?? 0,
    iterations: solve?.iterations ?? 0,
    residual: solve?.residual ?? Number.NaN,
    acceptance: numerical ? NUMERICAL_TOLERANCE : SHORTCUT_TOLERANCE,
    ...(solve?.secant ? { secant: solve.secant } : {}),
  };
  return {
    result,
    shown: { endpoint, target },
    curve,
    convergence,
    start,
    cap,
    numerical,
    transportLabel: LABELS[method],
  };
}

/** Solves the request for the legacy and modern methods; a method that refuses is reported for itself. */
export function computeModeled(req: ModeledRequest): ModeledOutcome {
  const attemptOne = (m: Method): ModeledMethodOutcome => {
    try {
      return { ok: true, run: runMethod(req, m) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };
  const out: ModeledOutcome = {
    medium: req.source.kind === 'dissolved' ? 'groundwater' : 'soil',
  };
  if (req.only !== 'modern') out.legacy = attemptOne('legacy');
  if (req.only !== 'legacy') out.modern = attemptOne('modern');
  return out;
}
