import {
  jeEpaIndoor,
  jeLegacyIndoor,
  type EpaJeInput,
  type LegacyJeInput,
  type Warning,
} from '@model-flow/engine';
import type { Parsed, VaporForm } from './form';
import { runOutdoor, type OutdoorForm } from './outdoor';
import {
  INDOOR_ORIGIN,
  OUTDOOR_ORIGIN,
  seriesSources,
  type MethodKey,
  type SourceSeries,
} from './series';

/**
 * The air-over-source coefficients of the vapor screen's indoor and outdoor air paths, offered to the
 * cleanup screen beside the air concentrations (wave K slice K1). Each is air concentration per unit
 * source in SI, with the medium the source is measured in: soil (kg/kg), groundwater, soil gas or soil
 * pore water (kg/m3). The cleanup screen divides its direct air level by it, which is exact only for a
 * path that is linear in the source; a path or mode that is not is carried as not quantified, with the
 * reason, and is never solved by a root find.
 */
export type VaporSourceKind = 'soil' | 'soilGas' | 'groundwater' | 'poreWater';

export type VaporCoefficient =
  | {
      quantified: true;
      /** The method id that produced the air concentration (for example vapor.je-1991). */
      methodId: string;
      /** Air concentration (kg/m3) per unit source (kg/kg for soil, kg/m3 otherwise). */
      value: number;
      source: VaporSourceKind;
      /**
       * Largest source in SI the coefficient holds for. A soil source gives no more vapor beyond the
       * residual-phase limit (source vapor fixed at its solubility value), so a level above it is not
       * reachable by the model; absent when the path has no such limit.
       */
      maxSource?: number;
    }
  | { quantified: false; methodId: string; reason: string };

export interface VaporCoefficients {
  indoor?: VaporCoefficient;
  outdoor?: VaporCoefficient;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const hasResidual = (w: readonly Warning[]): boolean =>
  w.some((x) => x.code === 'vapor.residual-phase');

/** One probe: the air concentration the path gives for a source, with what limits the source. */
interface Probe {
  air: number;
  sourceVapor: number;
  residual: boolean;
}

/** Relative tolerance of the doubling check that guards the linear assumption. */
const LINEAR_TOL = 1e-9;

/**
 * The coefficient from a probe function: the air at a probe source over that source, checked linear by
 * halving the source (the air must halve). Null when the check fails.
 */
function slope(run: (s: number) => Probe, s: number): { value: number; probe: Probe } | null {
  const a = run(s);
  const b = run(s / 2);
  if (!Number.isFinite(a.air) || !Number.isFinite(b.air)) return null;
  if (Math.abs(a.air - 2 * b.air) > LINEAR_TOL * Math.max(Math.abs(a.air), 1e-300)) return null;
  return { value: a.air / s, probe: a };
}

interface IndoorRuns {
  methodId: string;
  /** Air for a groundwater or pore water source of `c` kg/m3, or a soil gas source of `c` kg/m3. */
  run: (src: 'groundwater' | 'poreWater' | 'soilGas' | 'soil', s: number) => Probe;
  /** Henry constant and solubility behind the residual-phase limit of a soil source. */
  vaporCap: (probe: Probe) => number | null;
}

function legacyRuns(form: VaporForm, parsed: Extract<Parsed, { ok: true }>): IndoorRuns {
  const toProbe = (input: LegacyJeInput): Probe => {
    const r = jeLegacyIndoor(input);
    return { air: r.concentration, sourceVapor: r.sourceVapor, residual: hasResidual(r.warnings) };
  };
  return {
    methodId: INDOOR_ORIGIN.legacy,
    run: (kind, s) => {
      const base = parsed.legacy.source;
      if (kind === 'soil') {
        if (base.kind !== 'soil') throw new RangeError('the entered source is not soil');
        return toProbe({ ...parsed.legacy, source: { ...base, F: s } });
      }
      if (kind === 'soilGas')
        return toProbe({ ...parsed.legacy, source: { kind: 'soilGas', csg: s } });
      return toProbe({
        ...parsed.legacy,
        source: seriesSources(form, parsed, kind, s).legacy,
      });
    },
    vaporCap: () => {
      const b = parsed.legacy.source;
      return b.kind === 'soil' ? b.H * b.S : null;
    },
  };
}

function modernRuns(form: VaporForm, parsed: Extract<Parsed, { ok: true }>): IndoorRuns {
  let hPrime = NaN;
  const toProbe = (input: EpaJeInput): Probe => {
    const r = jeEpaIndoor(input);
    hPrime = r.Hprime;
    return { air: r.concentration, sourceVapor: r.sourceVapor, residual: hasResidual(r.warnings) };
  };
  return {
    methodId: INDOOR_ORIGIN.modern,
    run: (kind, s) => {
      if (kind === 'soil') return toProbe({ ...parsed.modern, source: { kind: 'soil', F: s } });
      if (kind === 'soilGas') {
        return toProbe({ ...parsed.modern, source: { kind: 'soilGas', csg: s } });
      }
      return toProbe({ ...parsed.modern, source: seriesSources(form, parsed, kind, s).modern });
    },
    vaporCap: () => {
      const S = parsed.modern.chemical.S;
      return S !== undefined && Number.isFinite(hPrime) ? hPrime * S : null;
    },
  };
}

/** Largest soil source that stays below the residual-phase limit; the probe is kept below it. */
function soilIndoor(runs: IndoorRuns): VaporCoefficient {
  let f = 1e-3; // 1000 mg/kg, halved by tens until no separate phase is present
  for (let i = 0; i < 14; i++, f /= 10) {
    let s: ReturnType<typeof slope>;
    try {
      const first = runs.run('soil', f);
      if (first.residual) continue;
      s = slope((x) => runs.run('soil', x), f);
    } catch (e) {
      return { quantified: false, methodId: runs.methodId, reason: message(e) };
    }
    if (s === null) break;
    const cap = runs.vaporCap(s.probe);
    const k = s.probe.sourceVapor / f;
    const maxSource = cap !== null && k > 0 ? cap / k : undefined;
    return {
      quantified: true,
      methodId: runs.methodId,
      value: s.value,
      source: 'soil',
      ...(maxSource !== undefined ? { maxSource } : {}),
    };
  }
  return {
    quantified: false,
    methodId: runs.methodId,
    reason:
      'the soil source is not linear in the soil concentration (a separate phase limits the vapor at every level tried)',
  };
}

function indoorCoefficient(
  form: VaporForm,
  parsed: Extract<Parsed, { ok: true }>,
  src: SourceSeries | null,
  method: MethodKey,
): VaporCoefficient {
  const runs = method === 'legacy' ? legacyRuns(form, parsed) : modernRuns(form, parsed);
  const kind: VaporSourceKind = src ? src.kind : form.source;
  if (kind === 'soil') {
    if (form.tphOn) {
      return {
        quantified: false,
        methodId: runs.methodId,
        reason:
          'a soil source with a TPH mixture sets the mole fraction from the source, so the vapor is not proportional to the soil concentration',
      };
    }
    return soilIndoor(runs);
  }
  try {
    const s = slope((x) => runs.run(kind, x), 1);
    if (s === null) {
      return {
        quantified: false,
        methodId: runs.methodId,
        reason:
          'the air concentration is not proportional to the source (the doubling check failed)',
      };
    }
    return { quantified: true, methodId: runs.methodId, value: s.value, source: kind };
  } catch (e) {
    return { quantified: false, methodId: runs.methodId, reason: message(e) };
  }
}

function outdoorCoefficient(
  form: VaporForm,
  parsed: Extract<Parsed, { ok: true }>,
  src: SourceSeries | null,
  outdoorForm: OutdoorForm,
  method: MethodKey,
  indoor: VaporCoefficient,
): VaporCoefficient {
  const methodId = OUTDOOR_ORIGIN[method];
  if (method === 'modern') {
    // F / VF: the volatilization factor takes no concentration, so it is linear in the soil source in
    // the infinite-source and the mass-limit branch alike.
    if (src !== null) {
      return {
        quantified: false,
        methodId,
        reason:
          'the Soil Screening Guidance factor applies to a soil concentration, and a source series is not one',
      };
    }
    try {
      const od = runOutdoor(
        form,
        parsed,
        { legacy: { ok: false, error: '' }, modern: { ok: false, error: '' } },
        outdoorForm,
      ).modern;
      if (!od.ok) return { quantified: false, methodId, reason: od.error };
      return { quantified: true, methodId, value: 1 / od.vf, source: 'soil' };
    } catch (e) {
      return { quantified: false, methodId, reason: message(e) };
    }
  }
  // Legacy: the box over the steady diffusion flux of the legacy source vapor, linear in it, so the
  // outdoor coefficient is the indoor one scaled by outdoor air over indoor air at one probe.
  if (!indoor.quantified) {
    return {
      quantified: false,
      methodId,
      reason: `the legacy source vapor is not quantified: ${indoor.reason}`,
    };
  }
  try {
    const kind = indoor.source;
    const probeSource = kind === 'soil' ? Math.min(1e-3, (indoor.maxSource ?? 1e-3) / 2) : 1;
    const air = (s: number): number => {
      const probe = jeLegacyIndoor(
        kind === 'soil'
          ? {
              ...parsed.legacy,
              source: { ...(parsed.legacy.source as { kind: 'soil' }), F: s } as never,
            }
          : kind === 'soilGas'
            ? { ...parsed.legacy, source: { kind: 'soilGas', csg: s } }
            : { ...parsed.legacy, source: seriesSources(form, parsed, kind, s).legacy },
      );
      const r = runOutdoor(
        form,
        parsed,
        { legacy: { ok: true, result: probe }, modern: { ok: false, error: '' } },
        outdoorForm,
      ).legacy;
      if (!r.ok) throw new RangeError(r.error);
      return r.concentration;
    };
    const a = air(probeSource);
    const b = air(probeSource / 2);
    if (Math.abs(a - 2 * b) > LINEAR_TOL * Math.max(Math.abs(a), 1e-300)) {
      return {
        quantified: false,
        methodId,
        reason:
          'the box concentration is not proportional to the source (the doubling check failed)',
      };
    }
    return {
      quantified: true,
      methodId,
      value: a / probeSource,
      source: kind,
      ...(indoor.maxSource !== undefined ? { maxSource: indoor.maxSource } : {}),
    };
  } catch (e) {
    return { quantified: false, methodId, reason: message(e) };
  }
}

/**
 * The indoor and outdoor air-over-source coefficients of the vapor method shown, for the source the run
 * used (`src`, a series or constant offered by another screen, or null for the screen's own entered
 * source). A coefficient is air at a reference source over that source, so a source that changes with
 * time gives the same number as the constant source: the steady method is applied at every time
 * (linear and time invariant), and the ratio is the same at each.
 */
export function vaporCoefficients(
  form: VaporForm,
  parsed: Extract<Parsed, { ok: true }>,
  src: SourceSeries | null,
  outdoorForm: OutdoorForm,
  method: MethodKey,
): VaporCoefficients {
  const indoor = indoorCoefficient(form, parsed, src, method);
  // The box rides on the legacy source vapor; the SSG factor does not need the indoor run.
  const legacyIndoor =
    method === 'legacy' ? indoor : indoorCoefficient(form, parsed, src, 'legacy');
  const outdoor = outdoorCoefficient(form, parsed, src, outdoorForm, method, legacyIndoor);
  return { indoor, outdoor };
}
