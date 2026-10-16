import {
  convert,
  runExponential,
  runTwoRegion,
  type RegionState,
  type SaturatedSourceOutput,
  type Warning,
} from '@model-flow/engine';
import type { SaturatedMethod } from './feed';
import type { SaturatedScenario } from './form';

const DAY = 86400;
/** Seasonal switch times are added to the chart nodes only while they stay a plottable number. */
const MAX_EXTRA_NODES = 400;

/** One method's run as plain data (the engine's schedule holds functions and cannot cross a worker). */
export interface RunSummary {
  method: SaturatedMethod;
  methodId: string;
  seasonal: boolean;
  initialMass: number;
  /** s; Infinity when nothing is released and for the modern method. */
  depletionTime: number;
  levels: SaturatedSourceOutput['levels'];
  regions: SaturatedSourceOutput['regions'];
  rates: SaturatedSourceOutput['rates'];
  gamma?: number;
  budget: SaturatedSourceOutput['budget'];
  warnings: Warning[];
}

export interface TaggedWarning extends Warning {
  method: SaturatedMethod;
}

export interface Curves {
  timesYr: number[];
  /** Release rate, kg/d, and mass left in the source, kg, at each time. */
  rate: Partial<Record<SaturatedMethod, number[]>>;
  remaining: Partial<Record<SaturatedMethod, number[]>>;
}

export interface SaturatedComputeResult {
  runs: Partial<Record<SaturatedMethod, RunSummary>>;
  unavailable: Partial<Record<SaturatedMethod, string>>;
  warnings: TaggedWarning[];
  curves: Curves;
}

export interface SaturatedComputeRequest {
  scenario: SaturatedScenario;
}

export type SaturatedOutcome =
  { ok: true; result: SaturatedComputeResult } | { ok: false; error: string };

function summarise(method: SaturatedMethod, o: SaturatedSourceOutput): RunSummary {
  return {
    method,
    methodId: o.methodId,
    seasonal: o.schedule.kind === 'seasonal',
    initialMass: o.initialMass,
    depletionTime: o.depletionTime,
    levels: o.levels,
    regions: o.regions,
    rates: o.rates,
    ...(o.gamma !== undefined ? { gamma: o.gamma } : {}),
    budget: o.budget,
    warnings: o.warnings,
  };
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Chart nodes shared by both methods: the monthly nodes of the engine series plus, for each
 * discontinuity (the legacy depletion time, seasonal switches), a node just before and at it so the
 * step is drawn as a step.
 */
function curves(outs: Partial<Record<SaturatedMethod, SaturatedSourceOutput>>): Curves {
  const first = outs.legacy ?? outs.modern!;
  const tEnd = first.series.times[first.series.times.length - 1]!;
  const times = new Set<number>(first.series.times);
  const edge = (t: number): void => {
    if (!(t > 0 && t < tEnd)) return;
    times.add(t * (1 - 1e-9));
    times.add(t);
  };
  for (const o of Object.values(outs)) {
    edge(o.depletionTime);
    if (o.schedule.kind === 'seasonal') {
      let n = 0;
      for (const seg of o.schedule.segments(tEnd)) {
        if (++n > MAX_EXTRA_NODES) break;
        edge(seg.end);
      }
    }
  }
  const t = [...times].sort((a, b) => a - b);
  const out: Curves = { timesYr: t.map((s) => convert(s, 's', 'yr')), rate: {}, remaining: {} };
  for (const m of ['legacy', 'modern'] as const) {
    const o = outs[m];
    if (!o) continue;
    out.rate[m] = t.map((s) => o.schedule.rate(s) * DAY);
    out.remaining[m] = t.map((s) => o.schedule.remaining(s));
  }
  return out;
}

/**
 * Runs both methods on the same scenario so switching the displayed method never recomputes. The
 * legacy method has no source decay, so its run drops the rate; the modern run keeps it. A method
 * that rejects an input is reported in `unavailable`; the outcome is an error only when neither ran.
 */
export function compute(req: SaturatedComputeRequest): SaturatedOutcome {
  const input = req.scenario.input;
  const outs: Partial<Record<SaturatedMethod, SaturatedSourceOutput>> = {};
  const unavailable: SaturatedComputeResult['unavailable'] = {};
  const { sourceDecayRate: _d, ...legacyInput } = input;
  void _d;
  const attempts: [SaturatedMethod, () => SaturatedSourceOutput][] = [
    ['legacy', () => runTwoRegion(legacyInput)],
    ['modern', () => runExponential(input)],
  ];
  for (const [m, go] of attempts) {
    try {
      outs[m] = go();
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      unavailable[m] = message(e);
    }
  }
  if (!outs.legacy && !outs.modern) {
    return { ok: false, error: unavailable.modern ?? unavailable.legacy ?? 'Nothing computed.' };
  }
  const runs: SaturatedComputeResult['runs'] = {};
  const warnings: TaggedWarning[] = [];
  for (const m of ['legacy', 'modern'] as const) {
    const o = outs[m];
    if (!o) continue;
    runs[m] = summarise(m, o);
    for (const w of o.warnings) warnings.push({ ...w, method: m });
  }
  return { ok: true, result: { runs, unavailable, warnings, curves: curves(outs) } };
}

export type { RegionState };
