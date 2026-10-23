import {
  devaullRun,
  jeEpaIndoor,
  jeLegacyIndoor,
  type DevaullInput,
  type EpaJeInput,
  type LegacyJeInput,
  type Warning,
} from '@model-flow/engine';
import type { Parsed, VaporForm } from './form';
import {
  encodeSi,
  type SiJson,
  type SourceTemplate,
  type VaporForward,
  type VaporSolveSpec,
  type VaporSourceKind,
} from './forward';
import { columnToGrade, parseBox, runOutdoor, type OutdoorForm } from './outdoor';
import {
  INDOOR_ORIGIN,
  OUTDOOR_ORIGIN,
  seriesSources,
  type MethodKey,
  type OutdoorKey,
  type SourceSeries,
} from './series';
import { OXYGEN_MODES } from './oxygenLimited';

/**
 * The air-over-source coefficients of the vapor screen's indoor and outdoor air paths, offered to the
 * cleanup screen beside the air concentrations (wave K slice K1). Each is air concentration per unit
 * source in SI, with the medium the source is measured in: soil (kg/kg), groundwater, soil gas or soil
 * pore water (kg/m3). The cleanup screen divides its direct air level by it, which is exact only for a
 * path that is linear in the source. A path or mode that is not is carried as not quantified, with the
 * reason, and with the state of its forward model (`solve`, see `forward.ts`) so the cleanup screen
 * solves the level with the engine's root find instead (wave V slice V2a). A linear soil coefficient
 * carries the same state for the one level it cannot divide, a source past the residual-phase limit.
 */
export type { VaporSourceKind };

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
      /** The forward model, to confirm that a level past `maxSource` is not reached (optional). */
      solve?: VaporSolveSpec;
    }
  | {
      quantified: false;
      methodId: string;
      reason: string;
      /** True when the path is not proportional to the source (as against a missing input). */
      nonlinear?: true;
      /** The forward model of a nonlinear path, to solve the level with; absent if it could not be built. */
      solve?: VaporSolveSpec;
    };

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
  /** The forward model as JSON-safe state, with the source left out. */
  forward: VaporForward;
  /** How one source number becomes the engine's source for this kind of source. */
  template: (kind: VaporSourceKind) => SourceTemplate;
  /** Dimensionless Henry constant of the soil gas, behind the saturation limit of a soil gas source. */
  henry: () => number;
}

const RESIDUAL_LABEL = 'residual-phase limit';

function withoutSource(input: object): { [key: string]: SiJson } {
  const copy: Record<string, unknown> = { ...input };
  delete copy.source;
  return encodeSi(copy) as { [key: string]: SiJson };
}

interface AnySource {
  kind: string;
  csg?: number;
  cgw?: number;
}

/**
 * The template of the engine source for a kind of source: the soil source as entered (F is replaced),
 * a soil gas source, or the source a groundwater or pore water concentration of 1 builds.
 */
function templateOf(
  kind: VaporSourceKind,
  soilBase: AnySource,
  series: () => AnySource,
): SourceTemplate {
  if (kind === 'soil') {
    if (soilBase.kind !== 'soil') throw new RangeError('the entered source is not soil');
    return { template: encodeSi(soilBase) as { [key: string]: SiJson }, key: 'F', scale: 1 };
  }
  if (kind === 'soilGas') {
    return { template: { kind: 'soilGas', csg: 0 }, key: 'csg', scale: 1 };
  }
  const at1 = series();
  const template = encodeSi(at1) as { [key: string]: SiJson };
  if (at1.kind === 'soilGas' && at1.csg !== undefined) {
    return { template, key: 'csg', scale: at1.csg };
  }
  if (at1.kind === 'groundwater' && at1.cgw !== undefined) {
    return { template, key: 'cgw', scale: at1.cgw };
  }
  throw new RangeError('the pore water source is not a gas or water');
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
    forward: { kind: 'legacy', input: withoutSource(parsed.legacy) },
    template: (kind) =>
      templateOf(
        kind,
        parsed.legacy.source,
        () => seriesSources(form, parsed, kind as 'groundwater' | 'poreWater', 1).legacy,
      ),
    henry: () => parsed.legacy.chemical.H,
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
    forward: { kind: 'modern', input: withoutSource(parsed.modern) },
    template: (kind) =>
      templateOf(
        kind,
        parsed.modern.source,
        () => seriesSources(form, parsed, kind as 'groundwater' | 'poreWater', 1).modern,
      ),
    henry: () => jeEpaIndoor({ ...parsed.modern, source: { kind: 'soilGas', csg: 1 } }).Hprime,
  };
}

/** The oxygen option's name as the screen shows it, lower case. */
function oxygenOptionName(parsed: Extract<Parsed, { ok: true }>): string {
  const mode = parsed.devaull?.ok ? parsed.devaull.input.oxygen.mode : 'entered';
  return (OXYGEN_MODES.find((m) => m.value === mode)?.label ?? mode).toLowerCase();
}

/**
 * The forward runs of the oxygen-limited method, or why it has no coefficient. Its aerobic depth is
 * entered, or set from the oxygen demand: when the demand is the total hydrocarbon vapor entered it
 * does not move with the source and the air is proportional to it; when the demand is taken from the
 * source vapor itself the depth moves with the source and the air is not, so `nonlinear` says so and
 * the level is solved (slice V2a).
 */
function devaullRuns(
  form: VaporForm,
  parsed: Extract<Parsed, { ok: true }>,
): { runs: IndoorRuns; nonlinear?: string } | Extract<VaporCoefficient, { quantified: false }> {
  const methodId = INDOOR_ORIGIN.devaull;
  const d = parsed.devaull;
  if (!d) return { quantified: false, methodId, reason: 'the oxygen-limited method was not run' };
  if (!d.ok) {
    return {
      quantified: false,
      methodId,
      reason: `the oxygen-limited method did not run: ${d.errors.join('; ')}`,
    };
  }
  const input = d.input;
  const ox = input.oxygen;
  const nonlinear =
    ox.mode !== 'entered' && ox.totalHydrocarbonVapor === undefined
      ? `the ${oxygenOptionName(parsed)} oxygen option takes the oxygen demand from the source vapor, so the aerobic depth changes with the source and the air is not proportional to it (a fixed total hydrocarbon vapor concentration would hold the demand)`
      : undefined;
  const runs: IndoorRuns = {
    methodId,
    run: (kind, s) => {
      let source: DevaullInput['source'];
      if (kind === 'soil') {
        if (input.source.kind !== 'soil') throw new RangeError('the entered source is not soil');
        source = { ...input.source, F: s };
      } else if (kind === 'soilGas') {
        source = { kind: 'soilGas', csg: s };
      } else {
        source = seriesSources(form, parsed, kind, s).legacy;
      }
      const r = devaullRun({ ...input, source });
      return {
        air: r.concentration,
        sourceVapor: r.sourceVapor,
        residual: hasResidual(r.warnings),
      };
    },
    vaporCap: () => (input.source.kind === 'soil' ? input.source.H * input.source.S : null),
    forward: { kind: 'devaull', input: withoutSource(input) },
    template: (kind) =>
      templateOf(
        kind,
        input.source,
        () => seriesSources(form, parsed, kind as 'groundwater' | 'poreWater', 1).legacy,
      ),
    henry: () => parsed.legacy.chemical.H,
  };
  return { runs, ...(nonlinear ? { nonlinear } : {}) };
}

/** A search limit: the largest source the forward model is run to, with what limits it. */
interface Limit {
  value: number;
  label: string;
}

/**
 * The smallest soil source (kg/kg) at which a separate phase shows, found by bracketing by decades and
 * bisecting the logarithm; the vapor stops rising there. Undefined when none shows below a mass
 * fraction of 1.
 */
function residualLimit(runs: IndoorRuns): number | undefined {
  let lo = 0;
  let hi = 1e-12;
  let found = false;
  for (let i = 0; i < 13; i++, hi *= 10) {
    if (runs.run('soil', hi).residual) {
      found = true;
      break;
    }
    lo = hi;
  }
  if (!found) return undefined;
  if (lo === 0) lo = hi / 10;
  for (let i = 0; i < 60 && hi / lo > 1 + 1e-12; i++) {
    const mid = Math.sqrt(lo * hi);
    if (runs.run('soil', mid).residual) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * The ceiling of a solve for a kind of source: the solubility for a dissolved source, the vapor in
 * equilibrium with the solubility (the Henry constant times it) for soil gas, the residual-phase limit
 * for soil, or, with a TPH mixture, the source at which the chemical is the whole mixture (mole
 * fraction 1; a larger one the engine refuses).
 */
function searchLimit(
  kind: VaporSourceKind,
  runs: IndoorRuns,
  parsed: Extract<Parsed, { ok: true }>,
  form: VaporForm,
): Limit | undefined {
  const S = parsed.modern.chemical.S;
  if (kind === 'groundwater' || kind === 'poreWater') {
    return S !== undefined && S > 0 ? { value: S, label: 'solubility' } : undefined;
  }
  if (kind === 'soilGas') {
    const H = runs.henry();
    return S !== undefined && S > 0 && H > 0 && Number.isFinite(H)
      ? { value: H * S, label: 'saturated vapor (the Henry constant times the solubility)' }
      : undefined;
  }
  if (form.tphOn) {
    const b = parsed.legacy.source;
    if (b.kind !== 'soil' || b.FT === undefined || b.MT === undefined) return undefined;
    return {
      value: Math.min(b.FT, (b.FT * b.M) / b.MT),
      label: 'pure-substance limit (the chemical would be the whole TPH mixture)',
    };
  }
  const f = residualLimit(runs);
  return f === undefined ? undefined : { value: f, label: RESIDUAL_LABEL };
}

/** The state a solve needs for a path, or undefined when it cannot be built. */
function solveSpec(
  runs: IndoorRuns,
  kind: VaporSourceKind,
  limit: () => Limit | undefined,
): VaporSolveSpec | undefined {
  try {
    const cap = limit();
    return {
      sourceKind: kind,
      forward: runs.forward,
      source: runs.template(kind),
      ...(cap ? { cap } : {}),
    };
  } catch {
    return undefined;
  }
}

/** Largest soil source that stays below the residual-phase limit; the probe is kept below it. */
function soilIndoor(
  runs: IndoorRuns,
  spec: (cap?: Limit) => VaporSolveSpec | undefined,
  nonlinear: (reason: string) => VaporCoefficient,
): VaporCoefficient {
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
    const solve =
      maxSource !== undefined ? spec({ value: maxSource, label: RESIDUAL_LABEL }) : undefined;
    return {
      quantified: true,
      methodId: runs.methodId,
      value: s.value,
      source: 'soil',
      ...(maxSource !== undefined ? { maxSource } : {}),
      ...(solve ? { solve } : {}),
    };
  }
  return nonlinear(
    'the soil source is not linear in the soil concentration (a separate phase limits the vapor at every level tried)',
  );
}

function indoorCoefficient(
  form: VaporForm,
  parsed: Extract<Parsed, { ok: true }>,
  src: SourceSeries | null,
  method: MethodKey,
): VaporCoefficient {
  let runs: IndoorRuns;
  let demandReason: string | undefined;
  if (method === 'devaull') {
    const d = devaullRuns(form, parsed);
    if ('quantified' in d) return d;
    runs = d.runs;
    demandReason = d.nonlinear;
  } else {
    runs = method === 'legacy' ? legacyRuns(form, parsed) : modernRuns(form, parsed);
  }
  const kind: VaporSourceKind = src ? src.kind : form.source;
  const spec = (cap?: Limit): VaporSolveSpec | undefined =>
    solveSpec(runs, kind, () => cap ?? searchLimit(kind, runs, parsed, form));
  /** Not proportional to the source: the reason, and the forward model to solve it with. */
  const nonlinear = (reason: string): VaporCoefficient => {
    const solve = spec();
    return {
      quantified: false,
      methodId: runs.methodId,
      reason,
      nonlinear: true,
      ...(solve ? { solve } : {}),
    };
  };
  if (demandReason !== undefined) return nonlinear(demandReason);
  if (kind === 'soil') {
    if (form.tphOn) {
      return nonlinear(
        'a soil source with a TPH mixture sets the mole fraction from the source, so the vapor is not taken as proportional to the soil concentration',
      );
    }
    return soilIndoor(runs, spec, nonlinear);
  }
  try {
    const s = slope((x) => runs.run(kind, x), 1);
    if (s === null) {
      return nonlinear(
        method === 'devaull'
          ? `the air concentration is not proportional to the source for the ${oxygenOptionName(parsed)} oxygen option (the doubling check failed)`
          : 'the air concentration is not proportional to the source (the doubling check failed)',
      );
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
  method: OutdoorKey,
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
  const kindOfSource: VaporSourceKind = indoor.quantified
    ? indoor.source
    : src
      ? src.kind
      : form.source;
  /** The box over the legacy source vapor as a forward model, with the ceiling of the search. */
  const boxSpec = (cap?: Limit): VaporSolveSpec | undefined => {
    try {
      const b = parseBox(outdoorForm);
      if (!b.ok) return undefined;
      const lruns = legacyRuns(form, parsed);
      const limit = cap ?? searchLimit(kindOfSource, lruns, parsed, form);
      return {
        sourceKind: kindOfSource,
        forward: {
          kind: 'box',
          column: encodeSi(columnToGrade(parsed)),
          chemical: encodeSi(parsed.legacy.chemical),
          box: b.box,
        },
        source: lruns.template(kindOfSource),
        ...(limit ? { cap: limit } : {}),
      };
    } catch {
      return undefined;
    }
  };
  if (!indoor.quantified) {
    const solve = indoor.solve !== undefined ? boxSpec(indoor.solve.cap) : undefined;
    return {
      quantified: false,
      methodId,
      reason: `the legacy source vapor is not quantified: ${indoor.reason}`,
      ...(indoor.nonlinear ? { nonlinear: true as const } : {}),
      ...(solve ? { solve } : {}),
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
      const solve = boxSpec();
      return {
        quantified: false,
        methodId,
        reason:
          'the box concentration is not proportional to the source (the doubling check failed)',
        nonlinear: true,
        ...(solve ? { solve } : {}),
      };
    }
    const solve =
      indoor.maxSource !== undefined
        ? boxSpec({ value: indoor.maxSource, label: RESIDUAL_LABEL })
        : undefined;
    return {
      quantified: true,
      methodId,
      value: a / probeSource,
      source: kind,
      ...(indoor.maxSource !== undefined ? { maxSource: indoor.maxSource } : {}),
      ...(solve ? { solve } : {}),
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
  // The oxygen-limited method is an indoor method: it has no outdoor air path.
  if (method === 'devaull') return { indoor };
  // The box rides on the legacy source vapor; the SSG factor does not need the indoor run.
  const legacyIndoor =
    method === 'legacy' ? indoor : indoorCoefficient(form, parsed, src, 'legacy');
  const outdoor = outdoorCoefficient(form, parsed, src, outdoorForm, method, legacyIndoor);
  return { indoor, outdoor };
}
