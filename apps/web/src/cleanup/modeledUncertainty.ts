import { DAY_S, YEAR_S, registry, solveCleanupRows, type UncertainInput } from '@model-flow/engine';
import type { UnitDisplay } from '../uncertainty/DistributionEditor';
import type { ModeledRowsRequest, PoolResponse } from '../uncertainty/protocol';
import { FROM_SI, MEDIUM_UNIT } from './build';
import { solveModeledIteration } from './compute';
import type { Method } from './modeledChains';
import type { ModeledOutcome, ModeledRequest } from './modeledTypes';

/**
 * Probabilistic cleanup levels of a modeled source (groundwater dissolved, vadose or saturated soil
 * source carried to the well). The sampled inputs are the engine's own declarations of the methods the
 * chain runs, lifted onto the plain-data request: the aquifer and chemical transport scalars of the
 * groundwater screen, the source method's inputs (never the source concentration, which is the solved
 * variable), and on the legacy side the receptor factors. One iteration is one full modeled solve, so
 * the rows run on the worker pool.
 */

/**
 * Default iteration count for a modeled source. One solve costs tens of milliseconds for a dissolved
 * source and from about 0.4 s to several seconds for a soil source, so the direct default (1000) would
 * often pass the run budget; 200 keeps the 95 percent level on SMALL_TAIL_DRAWS draws or more.
 */
export const MODELED_DEFAULT_N = 200;
/** Fewer draws than this below the chosen protection level raise `uncertainty.small-sample-tail`. */
export const SMALL_TAIL_DRAWS = 10;

/** The solved variable of each source method: set by the chain on every forward run, never sampled. */
const SOLVED_IDS = new Set(['vadose.source.F', 'saturatedSource.chemical.F']);

/** Groundwater screen scalars the chain reads, by the suffix of the transport method's declaration id. */
const TRANSPORT_KEYS = [
  'velocity',
  'porosity',
  'retardation',
  'decayRate',
  'dx',
  'dy',
  'dz',
] as const;
type TransportKey = (typeof TRANSPORT_KEYS)[number];

const TRANSPORT_METHOD: Record<Method, string> = {
  legacy: 'groundwater.at123d',
  modern: 'groundwater.wexler1992',
};
const VADOSE_METHOD: Record<Method, string> = { legacy: 'vadose.vadsat', modern: 'vadose.layered' };
const SATURATED_METHOD: Record<Method, string> = {
  legacy: 'saturatedSource.two-region',
  modern: 'saturatedSource.exponential',
};
const EXPOSURE_METHOD = 'exposure.rags-a-1989';

function declared(id: string): readonly UncertainInput<unknown>[] {
  return (registry.get(id).uncertainInputs ?? []) as readonly UncertainInput<unknown>[];
}

/** A declaration of an inner input, read and written through `at` and `put` on the request. */
function lift<T>(
  u: UncertainInput<T>,
  at: (r: ModeledRequest) => T,
  put: (r: ModeledRequest, inner: T) => ModeledRequest,
  label?: string,
): UncertainInput<ModeledRequest> {
  return {
    id: u.id,
    label: label ?? u.label,
    unit: u.unit,
    category: u.category,
    bounds: u.bounds,
    get: (r) => u.get(at(r)),
    set: (r, v) => put(r, u.set(at(r), v)),
  };
}

function transportInputs(method: Method): UncertainInput<ModeledRequest>[] {
  const decl = new Map(declared(TRANSPORT_METHOD[method]).map((u) => [u.id, u]));
  const out: UncertainInput<ModeledRequest>[] = [];
  for (const key of TRANSPORT_KEYS) {
    const u = decl.get(`groundwater.${key}`);
    if (!u) continue;
    out.push({
      id: u.id,
      label: `Aquifer: ${u.label}`,
      unit: u.unit,
      category: u.category,
      bounds: u.bounds,
      get: (r) => r.transport[key as TransportKey] ?? Number.NaN,
      set: (r, v) => ({ ...r, transport: { ...r.transport, [key]: v } }),
    });
  }
  return out;
}

function sourceInputs(req: ModeledRequest, method: Method): UncertainInput<ModeledRequest>[] {
  const src = req.source;
  if (src.kind === 'vadose') {
    const side = method === 'legacy' ? 'legacy' : 'modern';
    return declared(VADOSE_METHOD[method])
      .filter((u) => !SOLVED_IDS.has(u.id))
      .map((u) =>
        lift(
          u,
          (r) => (r.source.kind === 'vadose' ? r.source.vadose[side] : null),
          (r, inner) =>
            r.source.kind === 'vadose'
              ? {
                  ...r,
                  source: { ...r.source, vadose: { ...r.source.vadose, [side]: inner } },
                }
              : r,
          `Vadose source: ${u.label}`,
        ),
      );
  }
  if (src.kind === 'saturated') {
    return declared(SATURATED_METHOD[method])
      .filter((u) => !SOLVED_IDS.has(u.id))
      .map((u) =>
        lift(
          u,
          (r) => (r.source.kind === 'saturated' ? r.source.input : null),
          (r, inner) =>
            r.source.kind === 'saturated'
              ? { ...r, source: { ...r.source, input: inner as typeof r.source.input } }
              : r,
          `Saturated source: ${u.label}`,
        ),
      );
  }
  return [];
}

function receptorInputs(req: ModeledRequest): UncertainInput<ModeledRequest>[] {
  const count = req.legacy.receptors.length;
  return declared(EXPOSURE_METHOD).flatMap((u) => {
    const m = /^exposure\.receptor(\d+)\./.exec(u.id);
    if (m === null || Number(m[1]) >= count) return [];
    const name = req.legacy.receptors[Number(m[1])]!.label;
    return [
      lift(
        u,
        (r) => r.legacy,
        (r, inner) => ({ ...r, legacy: inner as typeof r.legacy }),
        u.label.replace(/^Receptor \d+/, name),
      ),
    ];
  });
}

/**
 * The inputs a modeled request can sample for one method: those with a finite base value only (an
 * absent layer, lens or optional factor is not offered).
 */
export function modeledUncertainInputs(
  req: ModeledRequest,
  method: Method,
): UncertainInput<ModeledRequest>[] {
  const all = [
    ...transportInputs(method),
    ...sourceInputs(req, method),
    ...(method === 'legacy' ? receptorInputs(req) : []),
  ];
  return all.filter((u) => {
    try {
      return Number.isFinite(u.get(req));
    } catch {
      return false;
    }
  });
}

/** Entered unit of a declared SI unit; the factor multiplies an entered value into SI. */
const BY_UNIT: Record<string, UnitDisplay> = {
  'm/s': { unit: 'm/yr', factor: 1 / YEAR_S },
  '1/s': { unit: '1/yr', factor: 1 / YEAR_S },
  'm^2/s': { unit: 'cm^2/s', factor: 1e-4 },
  'kg/m^3': { unit: 'mg/L', factor: 1e-3 },
  'm^3/kg': { unit: 'L/kg', factor: 1e-3 },
};
const BY_ID: Record<string, UnitDisplay> = {
  'groundwater.dx': { unit: 'm^2/yr', factor: 1 / YEAR_S },
  'groundwater.dy': { unit: 'm^2/yr', factor: 1 / YEAR_S },
  'groundwater.dz': { unit: 'm^2/yr', factor: 1 / YEAR_S },
};

/** Entered units of the offered inputs, as the screens enter them where they have one. */
export function modeledDisplays(
  inputs: readonly UncertainInput<ModeledRequest>[],
): Record<string, UnitDisplay> {
  const out: Record<string, UnitDisplay> = {};
  for (const u of inputs) {
    const exposure = /^exposure\.receptor\d+\.(ed|waterIngestionRate)$/.exec(u.id);
    if (exposure) {
      out[u.id] =
        exposure[1] === 'ed'
          ? { unit: 'yr', factor: YEAR_S }
          : { unit: 'L/day', factor: 1e-3 / DAY_S };
      continue;
    }
    if (/\.rhoB$/.test(u.id)) {
      out[u.id] = { unit: 'g/cm^3', factor: 1000 };
      continue;
    }
    const d = BY_ID[u.id] ?? BY_UNIT[u.unit];
    if (d) out[u.id] = d;
  }
  return out;
}

export interface ModeledSetup {
  ok: true;
  method: Method;
  request: ModeledRequest;
  model: { uncertainInputs: readonly UncertainInput<ModeledRequest>[] };
  displays: Record<string, UnitDisplay>;
  /** Screen unit of the solved concentration and the factor from SI to it. */
  unit: string;
  fromSi: number;
  /** The screen's own level for the point values, SI; null when not reachable. */
  deterministic: number | null;
  /** The chain's search ceiling, SI; censored iterations sit there. */
  cap: number | undefined;
}

export type ModeledSetupBuild = ModeledSetup | { ok: false; error: string };

/**
 * The setup of one method from the screen's request and the outcome its worker solved: the
 * deterministic level and the cap come from that solve, so nothing is solved on this thread.
 */
export function buildModeledSetup(
  req: ModeledRequest,
  outcome: ModeledOutcome,
  method: Method,
): ModeledSetupBuild {
  const m = outcome[method];
  if (!m) return { ok: false, error: `The ${method} method was not solved for this source.` };
  if (!m.ok) return { ok: false, error: m.error };
  const inputs = modeledUncertainInputs(req, method);
  return {
    ok: true,
    method,
    request: req,
    model: { uncertainInputs: inputs },
    displays: modeledDisplays(inputs),
    unit: MEDIUM_UNIT(outcome.medium),
    fromSi: FROM_SI(outcome.medium),
    deterministic: m.run.result.levels[0]?.level ?? null,
    cap: m.run.cap ?? undefined,
  };
}

/**
 * Solves one chunk of modeled cleanup rows (the worker's handler, pure over its arguments). A row's
 * output is its level in SI, +Infinity when the target is not reachable below the cap, NaN when the
 * row was refused (listed in `failures`).
 */
export function handleModeledRows(
  req: ModeledRowsRequest,
  now: () => number = () => performance.now(),
): PoolResponse {
  try {
    const model = { uncertainInputs: modeledUncertainInputs(req.request, req.method) };
    const t0 = now();
    const { outcomes, failures } = solveCleanupRows(model, req.request, req.ids, req.rows, (r) =>
      solveModeledIteration(r, req.method),
    );
    return {
      type: 'rows',
      job: req.job,
      outputs: outcomes.map((o) => (o.censored ? Number.POSITIVE_INFINITY : o.level)),
      evaluations: outcomes.map((o) => o.evaluations),
      failures,
      elapsedMs: now() - t0,
    };
  } catch (e) {
    return { type: 'error', job: req.job, message: e instanceof Error ? e.message : String(e) };
  }
}
