import {
  runLayered,
  runVadsat,
  type LayeredOutput,
  type ResidualPhaseResult,
  type VadsatOutput,
  type Warning,
} from '@model-flow/engine';
import { layerName, type VadoseScenario } from './form';

export type VadoseMethod = 'legacy' | 'modern';

export interface LayerReadout {
  name: string;
  thickness: number;
  /** Volumetric water content under the unit gradient. */
  theta: number;
  /** Seepage velocity, m/s. */
  v: number;
  /** Retardation and dispersion are reported for the layers the leachate crosses. */
  retardation?: number;
  dispersion?: number;
}

/**
 * Mass budget over the whole source area, kg. The source parts (remaining, volatilized, decayed,
 * leached) sum to the initial mass. The leached mass splits into what is still in the profile, what
 * reached the water table and what was lost in transit.
 */
export interface Budget {
  initial: number;
  source: number;
  volatilized: number;
  sourceDecayed: number;
  leached: number;
  delivered: number;
  inProfile: number;
  /** Decayed between the source and the water table (legacy: plus the dispersive flux across it). */
  transitLoss: number;
  /**
   * Legacy only: mass the first-type inlet admits beyond the source's leaching loss. It sits in
   * the profile and the delivered mass but was never debited from the source.
   */
  inletExcess: number;
  /** Relative error of the source parts against the initial mass. */
  closure: number;
}

export interface RunSummary {
  method: VadoseMethod;
  evaluation: string;
  /** Infiltration the column carries, m/s. */
  q: number;
  clamped: boolean;
  layers: LayerReadout[];
  partition: ResidualPhaseResult;
  gamma: number;
  leachedShare: number;
  diffusionPath: number;
  /** Longitudinal dispersivity at the water table, m. */
  dispersivity: number;
  profiles: { times: number[]; depths: number[]; concentrations: number[][] };
  series: {
    times: number[];
    waterTable: number[];
    flux: number[];
    massRate: number[];
    sourcePoreWater: number[];
    sourceMass: number[];
    leached: number[];
    volatilized: number[];
    sourceDecayed: number[];
    delivered: number[];
  };
  budget: Budget;
  /** Finite-volume cells and halvings (modern, multi-layer only). */
  numerics?: { cells: number; converged: boolean };
  warnings: Warning[];
}

export interface TaggedWarning extends Warning {
  method: VadoseMethod;
}

export interface VadoseComputeResult {
  runs: Partial<Record<VadoseMethod, RunSummary>>;
  /** Why a method has no run (inputs it cannot describe, or the engine's input error). */
  unavailable: Partial<Record<VadoseMethod, string>>;
  warnings: TaggedWarning[];
}

export interface VadoseComputeRequest {
  scenario: VadoseScenario;
}

export type VadoseOutcome =
  { ok: true; result: VadoseComputeResult } | { ok: false; error: string };

function closureOf(
  b: Pick<Budget, 'initial' | 'source' | 'volatilized' | 'sourceDecayed' | 'leached'>,
): number {
  const sum = b.source + b.volatilized + b.sourceDecayed + b.leached;
  return b.initial > 0 ? Math.abs(sum - b.initial) / b.initial : 0;
}

function summariseLegacy(s: VadoseScenario, o: VadsatOutput): RunSummary {
  const input = s.legacy!;
  const layers: LayerReadout[] = [];
  const m = o.moisture;
  const soilH = input.depthToSource - (input.lens?.thickness ?? 0);
  if (m.above && soilH > 0) {
    layers.push({
      name: layerName('above', 0),
      thickness: soilH,
      theta: m.above.theta,
      v: m.above.v,
    });
  }
  if (m.lens && input.lens) {
    layers.push({
      name: layerName('above', soilH > 0 ? 1 : 0),
      thickness: input.lens.thickness,
      theta: m.lens.theta,
      v: m.lens.v,
    });
  }
  layers.push({
    name: 'Source',
    thickness: input.source.thickness,
    theta: m.source.theta,
    v: m.source.v,
  });
  layers.push({
    name: layerName('below', 0),
    thickness: input.below.thickness,
    theta: m.below.theta,
    v: m.below.v,
    retardation: o.retardation,
    dispersion: o.waterTableDispersivity * m.below.v,
  });
  const b = o.budget;
  const budget: Budget = {
    initial: b.initialSourceMass,
    source: b.sourceMass,
    volatilized: b.volatilized,
    sourceDecayed: b.sourceDecayed,
    leached: b.leached,
    delivered: b.deliveredToWaterTable,
    inProfile: b.inProfile,
    transitLoss: b.inTransitLoss,
    inletExcess: b.columnInflux - b.leached,
    closure: 0,
  };
  budget.closure = closureOf(budget);
  return {
    method: 'legacy',
    evaluation: o.evaluation,
    q: o.q,
    clamped: o.clamped,
    layers,
    partition: o.partition,
    gamma: o.gamma,
    leachedShare: o.leachedShare,
    diffusionPath: o.diffusionPath,
    dispersivity: o.waterTableDispersivity,
    profiles: {
      times: o.profiles.times,
      depths: o.profiles.depths,
      concentrations: o.profiles.concentrations,
    },
    series: o.series,
    budget,
    warnings: o.warnings,
  };
}

function summariseModern(s: VadoseScenario, o: LayeredOutput): RunSummary {
  const input = s.modern;
  const layers: LayerReadout[] = [];
  input.above.forEach((l, k) =>
    layers.push({
      name: layerName('above', k),
      thickness: l.thickness,
      theta: o.moisture.above[k]!.theta,
      v: o.moisture.above[k]!.v,
    }),
  );
  layers.push({
    name: 'Source',
    thickness: input.source.thickness,
    theta: o.moisture.source.theta,
    v: o.moisture.source.v,
  });
  o.layers.forEach((l, k) =>
    layers.push({
      name: layerName('below', k),
      thickness: l.thickness,
      theta: l.theta,
      v: l.v,
      retardation: l.R,
      dispersion: l.D,
    }),
  );
  const b = o.budget;
  const budget: Budget = {
    initial: b.initialSourceMass,
    source: b.sourceMass,
    volatilized: b.volatilized,
    sourceDecayed: b.sourceDecayed,
    leached: b.leached,
    delivered: b.deliveredToWaterTable,
    inProfile: b.inProfile,
    transitLoss: b.decayedInTransit,
    inletExcess: 0,
    closure: 0,
  };
  budget.closure = closureOf(budget);
  return {
    method: 'modern',
    evaluation: o.evaluation,
    q: o.q,
    clamped: false,
    layers,
    partition: o.partition,
    gamma: o.gamma,
    leachedShare: o.leachedShare,
    diffusionPath: o.diffusionPath,
    dispersivity: o.dispersivity,
    profiles: o.profiles,
    series: o.series,
    budget,
    ...(o.numerics
      ? { numerics: { cells: o.numerics.cells, converged: o.numerics.converged } }
      : {}),
    warnings: o.warnings,
  };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Runs both methods on the same scenario so switching the displayed method never recomputes. A
 * method that cannot describe the profile or rejects an input is reported in `unavailable`; the
 * outcome is an error only when neither method ran.
 */
export function compute(req: VadoseComputeRequest): VadoseOutcome {
  const s = req.scenario;
  const runs: VadoseComputeResult['runs'] = {};
  const unavailable: VadoseComputeResult['unavailable'] = {};
  if (s.legacy) {
    try {
      runs.legacy = summariseLegacy(s, runVadsat(s.legacy));
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      unavailable.legacy = message(e);
    }
  } else if (s.legacyReason) {
    unavailable.legacy = s.legacyReason;
  }
  try {
    runs.modern = summariseModern(s, runLayered(s.modern));
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    unavailable.modern = message(e);
  }
  if (!runs.legacy && !runs.modern) {
    return {
      ok: false,
      error: unavailable.modern ?? unavailable.legacy ?? 'Nothing could be computed.',
    };
  }
  const warnings: TaggedWarning[] = [];
  for (const method of ['legacy', 'modern'] as const) {
    for (const w of runs[method]?.warnings ?? []) warnings.push({ ...w, method });
  }
  return { ok: true, result: { runs, unavailable, warnings } };
}

/** Mean of the last twelve month-end values of a monthly series, or null for under a year. */
export function lastYearMean(values: readonly number[]): number | null {
  if (values.length < 13) return null;
  const last = values.slice(-12);
  return last.reduce((a, b) => a + b, 0) / 12;
}

/**
 * The water-table flux series of one method over `duration` seconds, for the groundwater coupling:
 * only the series is wanted, so the profile is a single point and no profile times are requested.
 * Flux is clamped at zero: the finite-volume scheme can undershoot by round-off ahead of a front,
 * and a mass-release schedule cannot be negative.
 */
export function vadoseFluxSeries(
  s: VadoseScenario,
  method: VadoseMethod,
  duration: number,
): { times: number[]; flux: number[]; delivered: number[] } {
  if (method === 'legacy') {
    if (!s.legacy)
      throw new RangeError(s.legacyReason ?? 'The legacy method cannot describe this profile.');
    const o = runVadsat({ ...s.legacy, duration, depths: [0], profileTimes: [] });
    return {
      times: o.series.times,
      flux: o.series.flux.map((f) => Math.max(0, f)),
      delivered: o.series.delivered,
    };
  }
  const o = runLayered({ ...s.modern, duration, depths: [0], profileTimes: [] });
  return {
    times: o.series.times,
    flux: o.series.flux.map((f) => Math.max(0, f)),
    delivered: o.series.delivered,
  };
}
