import {
  henryAtTemperature,
  jeEpaIndoor,
  jeLegacyIndoor,
  quasiSteadyTime,
  quasiSteadyWarnings,
  seriesEpc,
  vaporSeriesEpc,
  type EpaJeInput,
  type EpaJeResult,
  type EpcSeries,
  type EpcSpec,
  type LegacyJeInput,
  type LegacyJeResult,
  type Warning,
} from '@model-flow/engine';
import type { VaporOutcome } from './compute';
import type { Parsed, VaporForm } from './form';
import { runOutdoor, type OutdoorForm } from './outdoor';

/**
 * A source that changes with time, or holds one value, offered by another screen. All SI: seconds and
 * kg/m3 of the groundwater at the water table, or of the pore water of a soil source.
 */
export type SourceSeries =
  | { kind: 'groundwater' | 'poreWater'; label: string; series: EpcSeries }
  | { kind: 'poreWater'; label: string; constant: number };

export const INDOOR_ORIGIN = { legacy: 'vapor.je-1991', modern: 'vapor.je-epa' } as const;
export const OUTDOOR_ORIGIN = {
  legacy: 'outdoorAir.box',
  modern: 'outdoorAir.ssg-vf-1996',
} as const;

/** A long source series is thinned to this many times (ends kept); each time is one steady run. */
export const MAX_SERIES_TIMES = 120;

export type MethodKey = 'legacy' | 'modern';

export interface VaporEpcs {
  indoor: Partial<Record<MethodKey, EpcSpec>>;
  outdoor: Partial<Record<MethodKey, EpcSpec>>;
  /** Why a method has no result. */
  errors: Partial<Record<MethodKey | 'outdoor', string>>;
  warnings: Warning[];
}

function thin(times: readonly number[], values: readonly number[]): EpcSeries {
  if (times.length <= MAX_SERIES_TIMES) return { times: [...times], values: [...values] };
  const idx = new Set<number>();
  for (let k = 0; k < MAX_SERIES_TIMES; k++) {
    idx.add(Math.round((k * (times.length - 1)) / (MAX_SERIES_TIMES - 1)));
  }
  const keep = [...idx].sort((a, b) => a - b);
  return { times: keep.map((i) => times[i]!), values: keep.map((i) => values[i]!) };
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The legacy and modern engine sources for a groundwater or pore water concentration `c` (kg/m3). A
 * groundwater source is the groundwater at the water table; a pore water source gives the soil gas H times
 * its concentration, and the modern method diffuses with H' at the soil temperature so it sources with the
 * same H'.
 */
export function seriesSources(
  form: VaporForm,
  parsed: Extract<Parsed, { ok: true }>,
  kind: 'groundwater' | 'poreWater',
  c: number,
): { legacy: LegacyJeInput['source']; modern: EpaJeInput['source'] } {
  const H = Number(form.H);
  const S = Number(form.S) * 1e-3;
  if (kind === 'groundwater') {
    return {
      legacy: { kind: 'groundwater', cgw: c, H, S },
      modern: { kind: 'groundwater', cgw: c },
    };
  }
  const chem = parsed.modern.chemical;
  const Hm = chem.thermo
    ? henryAtTemperature({
        HR: chem.henryAtm,
        dHvb: chem.thermo.dHvb,
        TB: chem.thermo.TB,
        TC: chem.thermo.TC,
        TS: parsed.modern.temperature,
      }).Hprime
    : H;
  return {
    legacy: { kind: 'soilGas', csg: H * c },
    modern: { kind: 'soilGas', csg: Hm * c },
  };
}

/**
 * The indoor and outdoor air a source that changes with time gives, as exposure point concentrations:
 * a steady vapor method applied at each time (DEFAULT ruling 7), tagged with the method id as origin.
 * A groundwater series is the groundwater source; a pore water source gives the soil gas H times its
 * concentration. A single value gives constant EPCs.
 */
export function vaporEpcs(
  form: VaporForm,
  parsed: Extract<Parsed, { ok: true }>,
  src: SourceSeries,
  outdoorForm: OutdoorForm,
): VaporEpcs {
  const isSeries = 'series' in src;
  const series: EpcSeries = isSeries
    ? thin(src.series.times, src.series.values)
    : { times: [0], values: [src.constant] };
  const times = series.times;

  const sources = (c: number) => seriesSources(form, parsed, src.kind, c);

  const out: VaporEpcs = { indoor: {}, outdoor: {}, errors: {}, warnings: [] };
  const legacyRuns = new Map<number, LegacyJeResult>();
  const modernRuns = new Map<number, EpaJeResult>();
  try {
    times.forEach((t, i) => {
      legacyRuns.set(
        t,
        jeLegacyIndoor({ ...parsed.legacy, source: sources(series.values[i]!).legacy }),
      );
    });
  } catch (e) {
    legacyRuns.clear();
    out.errors.legacy = message(e);
  }
  try {
    times.forEach((t, i) => {
      modernRuns.set(
        t,
        jeEpaIndoor({ ...parsed.modern, source: sources(series.values[i]!).modern }),
      );
    });
  } catch (e) {
    modernRuns.clear();
    out.errors.modern = message(e);
  }

  const indoorSpec = (runs: Map<number, { concentration: number }>, origin: string): EpcSpec =>
    isSeries
      ? vaporSeriesEpc((t) => runs.get(t)!, times, origin)
      : { kind: 'constant', value: Math.max(0, runs.get(times[0]!)!.concentration), origin };
  if (legacyRuns.size > 0) out.indoor.legacy = indoorSpec(legacyRuns, INDOOR_ORIGIN.legacy);
  if (modernRuns.size > 0) out.indoor.modern = indoorSpec(modernRuns, INDOOR_ORIGIN.modern);

  // Outdoor box over the legacy source vapor at each time.
  if (legacyRuns.size > 0) {
    const values: number[] = [];
    for (const t of times) {
      const failed = { ok: false as const, error: '' };
      const r = runOutdoor(
        form,
        parsed,
        { legacy: { ok: true, result: legacyRuns.get(t)! }, modern: failed },
        outdoorForm,
      );
      if (!r.legacy.ok) {
        out.errors.outdoor = r.legacy.error;
        values.length = 0;
        break;
      }
      values.push(Math.max(0, r.legacy.concentration));
    }
    if (values.length === times.length) {
      out.outdoor.legacy = isSeries
        ? seriesEpc({ times, values }, OUTDOOR_ORIGIN.legacy)
        : { kind: 'constant', value: values[0]!, origin: OUTDOOR_ORIGIN.legacy };
    }
  }

  // The steady application is questioned when the source changes within the establishment time.
  if (isSeries) {
    const runs = legacyRuns.size > 0 ? legacyRuns : modernRuns;
    const first = runs.get(times[0]!);
    if (first && first.DT > 0 && first.LT > 0) {
      const vapor: EpcSeries = { times, values: times.map((t) => runs.get(t)!.sourceVapor) };
      // D_E = D_T / R_g (gas-referenced); the legacy engine carries no sorption data, so it borrows the
      // modern run's capacity and uses 1 (gas capacity alone, the shortest time) when that run failed.
      const rg = modernRuns.get(times[0]!)?.capacityRg ?? 1;
      out.warnings.push(...quasiSteadyWarnings(vapor, quasiSteadyTime(first.LT, first.DT / rg)));
    }
  }
  return out;
}

/** The result the page already holds, for one method, as constant EPCs. */
export function constantEpcs(
  form: VaporForm,
  parsed: Extract<Parsed, { ok: true }>,
  outcome: VaporOutcome,
  outdoorForm: OutdoorForm,
  method: MethodKey,
): Pick<VaporEpcs, 'indoor' | 'outdoor'> {
  const indoor: VaporEpcs['indoor'] = {};
  const outdoor: VaporEpcs['outdoor'] = {};
  const o = outcome[method];
  if (o.ok) {
    indoor[method] = {
      kind: 'constant',
      value: Math.max(0, o.result.concentration),
      origin: INDOOR_ORIGIN[method],
    };
  }
  const od = runOutdoor(form, parsed, outcome, outdoorForm)[method];
  if (od.ok) {
    outdoor[method] = {
      kind: 'constant',
      value: Math.max(0, od.concentration),
      origin: OUTDOOR_ORIGIN[method],
    };
  }
  return { indoor, outdoor };
}
