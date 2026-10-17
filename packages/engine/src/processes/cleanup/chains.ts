import type { Warning } from '../../registry/index.js';
import { maximizeWindows } from '../exposure/averaging.js';
import { checkReceptorCount, checkUniqueChemicals } from '../exposure/checks.js';
import { groundwaterBreakthrough, type EpcSpec } from '../exposure/epc.js';
import type { LegacyChemical } from '../exposure/legacy.js';
import type { ModernChemical } from '../exposure/modern.js';
import {
  runLegacyScenario,
  runModernScenario,
  type LegacyScenarioReceptor,
  type ModernScenarioReceptor,
  type ScenarioChemical,
} from '../exposure/scenario.js';
import { PATHWAYS, type EpcSeries, type PathwayId } from '../exposure/units.js';
import type { Point3 } from '../groundwater/common.js';
import { domenicoConcentration, type DomenicoInput } from '../groundwater/domenico.js';
import {
  at123dConcentration,
  massRateFromConcentration,
  type At123dAquifer,
  type BoxSource,
  type LoadingStep,
} from '../groundwater/kernel.js';
import type { ConcentrationStep } from '../groundwater/loading.js';
import {
  patchfConcentration,
  patchiConcentration,
  type VerticalBounds,
  type WexlerInput,
} from '../groundwater/wexler.js';
import {
  releaseToLoadingSteps,
  type SaturatedSourceInput,
  runExponential,
  runTwoRegion,
} from '../saturatedSource/index.js';
import {
  fluxToLoadingSteps,
  runLayered,
  runVadsat,
  toConcentrationSteps,
  type LayeredInput,
  type VadsatInput,
} from '../vadose/index.js';
import { YEAR_SECONDS } from '../saturatedSource/release.js';
import { NUMERICAL_TOLERANCE, solveSourceLevel, type SolveResult } from './solve.js';
import {
  checkAllocationTargets,
  resolveConcentrationTarget,
  resolveRiskTargets,
  type Allocation,
  type ConcentrationTargetSpec,
  type Mcl,
  type RiskTargets,
} from './targets.js';

/**
 * Modeled-pathway cleanup levels (`docs/methods/cleanup-levels.md`, "Modeled pathways"): a chain turns a
 * source concentration (kg/kg soil or kg/m^3 water, SI) into the well-screen exposure series through the
 * existing M1 to M3 methods and their coupling helpers, the receptor metric reduces that series, and
 * `solveSourceLevel` inverts it. Nothing here re-implements transport.
 */

// ---------------------------------------------------------------- transport to the well

/** What enters the aquifer: mass-rate steps (soil sources) or boundary-concentration steps (dissolved). */
export type WellLoad =
  | { kind: 'rates'; steps: readonly LoadingStep[] }
  | { kind: 'conc'; steps: readonly ConcentrationStep[] };

/**
 * The M1 method that carries the load to the well screen. `darcyFlux` and `crossSection` are the source
 * basis that converts between a boundary concentration and a mass rate (`massRateFromConcentration`).
 */
export type Transport =
  | {
      kind: 'at123d';
      aquifer: At123dAquifer;
      source: BoxSource;
      darcyFlux: number;
      crossSection: number;
      points: readonly Point3[];
    }
  | {
      kind: 'wexler';
      params: WexlerInput;
      /** Vertical boundaries of PATCHI (no-flux water table or finite thickness); none gives the whole space. */
      bounds?: VerticalBounds | undefined;
      /** Both give PATCHF; neither gives PATCHI. */
      width?: number;
      thickness?: number;
      darcyFlux: number;
      crossSection: number;
      points: readonly Point3[];
    }
  | {
      kind: 'domenico';
      params: DomenicoInput;
      darcyFlux: number;
      crossSection: number;
      points: readonly Point3[];
    };

export function wellConcentrations(t: Transport, load: WellLoad, time: number): number[] {
  if (t.kind === 'at123d') {
    const rates =
      load.kind === 'rates'
        ? load.steps
        : load.steps.map((s) => ({
            start: s.start,
            end: s.end,
            rate: massRateFromConcentration(s.concentration, t.darcyFlux, t.crossSection),
          }));
    return t.points.map((p) =>
      at123dConcentration({ aquifer: t.aquifer, source: t.source, loading: rates, time }, p),
    );
  }
  const conc =
    load.kind === 'conc'
      ? load.steps
      : toConcentrationSteps(load.steps, t.darcyFlux, t.crossSection);
  if (t.kind === 'wexler') {
    return t.points.map((p) =>
      t.width !== undefined && t.thickness !== undefined
        ? patchfConcentration(t.params, p, time, { width: t.width, thickness: t.thickness }, conc)
            .value
        : patchiConcentration(t.params, p, time, conc, t.bounds),
    );
  }
  return t.points.map((p) => domenicoConcentration(t.params, p, time, conc));
}

// ---------------------------------------------------------------- chains

export interface Chain {
  id: string;
  /** The medium of the source concentration C. */
  medium: 'soil' | 'groundwater';
  /** The well-screen concentration series (kg/m^3) for the source concentration C. */
  epc(c: number): EpcSpec;
  /** Search ceiling: 1 kg/kg for soil (pure substance), the solubility for a dissolved source. */
  cap?: number | undefined;
  /** Starting concentration when none was entered: 1 mg/kg or 1 mg/L, SI. */
  reference: number;
  /** True after a run that used the layered finite-volume solver. */
  numerical: boolean;
}

const MG_PER_KG = 1e-6;
const MG_PER_L = 1e-3;
const MONTH = YEAR_SECONDS / 12;

interface ChainBase {
  id?: string;
  /** Sample times of the breakthrough series at the well, s, strictly increasing. */
  times: readonly number[];
  transport: Transport;
  cap?: number;
  reference?: number;
}

function build(
  base: ChainBase,
  id: string,
  medium: Chain['medium'],
  load: (c: number) => { load: WellLoad; numerical?: boolean },
): Chain {
  const chain: Chain = {
    id: base.id ?? id,
    medium,
    cap: base.cap ?? (medium === 'soil' ? 1 : undefined),
    reference: base.reference ?? (medium === 'soil' ? MG_PER_KG : MG_PER_L),
    numerical: false,
    epc(c) {
      const l = load(c);
      if (l.numerical === true) chain.numerical = true;
      return groundwaterBreakthrough(
        (t) => ({ concentrations: wellConcentrations(base.transport, l.load, t) }),
        base.times,
        base.id ?? id,
      );
    },
  };
  return chain;
}

/** A dissolved groundwater source held at c0 (or a stepped schedule of multiples of it) to the well. */
export function dissolvedChain(
  spec: ChainBase & { schedule?: readonly { start: number; end: number; factor: number }[] },
): Chain {
  const sched = spec.schedule ?? [{ start: 0, end: Infinity, factor: 1 }];
  return build(spec, 'cleanup.dissolved', 'groundwater', (c) => ({
    load: {
      kind: 'conc',
      steps: sched.map((s) => ({ start: s.start, end: s.end, concentration: c * s.factor })),
    },
  }));
}

interface SoilChainSpec<I> extends ChainBase {
  /** The method input for the soil concentration F (kg/kg); TPH scaling is the caller's (`tphSource`). */
  makeInput: (f: number) => I;
  /** Loading step length, s (default one month). */
  stepLength?: number;
}

/** VADSAT (legacy) source and column, then the well. */
export function vadsatChain(spec: SoilChainSpec<VadsatInput>): Chain {
  return build(spec, 'cleanup.vadsat', 'soil', (f) => {
    const input = spec.makeInput(f);
    const out = runVadsat(input);
    const area = input.source.length * input.source.width;
    const tEnd = out.series.times[out.series.times.length - 1]!;
    return {
      load: {
        kind: 'rates',
        steps: fluxToLoadingSteps(out, area, tEnd, spec.stepLength ?? MONTH),
      },
    };
  });
}

/** The modern layered column (analytic for one layer, finite volume otherwise), then the well. */
export function layeredChain(spec: SoilChainSpec<LayeredInput>): Chain {
  return build(spec, 'cleanup.layered', 'soil', (f) => {
    const input = spec.makeInput(f);
    const out = runLayered(input);
    const area = input.source.length * input.source.width;
    const tEnd = out.series.times[out.series.times.length - 1]!;
    return {
      load: {
        kind: 'rates',
        steps: fluxToLoadingSteps(out, area, tEnd, spec.stepLength ?? MONTH),
      },
      numerical: out.evaluation === 'finite-volume',
    };
  });
}

/** The saturated two-region (legacy) or exponential (modern) source, then the well. */
export function saturatedChain(
  spec: SoilChainSpec<SaturatedSourceInput> & { method: 'two-region' | 'exponential' },
): Chain {
  return build(spec, `cleanup.saturated-${spec.method}`, 'soil', (f) => {
    const input = spec.makeInput(f);
    const out = spec.method === 'two-region' ? runTwoRegion(input) : runExponential(input);
    return {
      load: {
        kind: 'rates',
        steps: releaseToLoadingSteps(out, input.tEnd, spec.stepLength ?? MONTH),
      },
    };
  });
}

// ---------------------------------------------------------------- TPH

export interface TphSource {
  mode: 'kept' | 'held';
  /** The entered chemical and TPH mass fractions, kg/kg. */
  F0: number;
  FT0: number;
  /** The chemical and TPH fractions for the soil concentration F. */
  at(f: number): { F: number; FT: number };
  /** Upper search bound for F. */
  cap: number;
}

/**
 * TPH of a soil source along the search. `kept` (RISC5, default ruling 7): the chemical keeps its entered
 * mole fraction, so TPH scales with it. `held`: TPH stays at the entered value and the mole fraction
 * grows with F (F cannot exceed FT, nor the F at which the mole fraction reaches 1, which is the search cap).
 */
export function tphSource(
  F0: number,
  FT0: number,
  mode: 'kept' | 'held' = 'kept',
  molar?: { M: number; MT: number },
): TphSource {
  if (!(F0 > 0 && FT0 > 0)) throw new RangeError('the chemical and TPH fractions must be positive');
  if (F0 > FT0) throw new RangeError('the chemical fraction cannot exceed the TPH fraction');
  return {
    mode,
    F0,
    FT0,
    at: (f) => ({ F: f, FT: mode === 'kept' ? (FT0 * f) / F0 : FT0 }),
    // held: the mole fraction F M_T / (FT M) cannot exceed 1, which bounds F when the molar masses are known
    cap:
      mode === 'kept'
        ? 1
        : Math.min(1, FT0, molar === undefined ? Infinity : (FT0 * molar.M) / molar.MT),
  };
}

// ---------------------------------------------------------------- metrics

/** Total cancer risk and headline hazard index of one or two receptors for given chemical EPCs. */
export type RiskEvaluator<C> = (chemicals: ScenarioChemical<C>[]) => { cancer: number; hi: number };

function pick(
  summary: {
    receptors: { cancerRisk: number; hi: number }[];
    additiveCancerRisk: number | null;
  },
  additive: boolean,
): { cancer: number; hi: number } {
  const cancer =
    additive && summary.additiveCancerRisk !== null
      ? summary.additiveCancerRisk
      : Math.max(...summary.receptors.map((r) => r.cancerRisk));
  return { cancer, hi: Math.max(...summary.receptors.map((r) => r.hi)) };
}

/** With two receptors the metric is the larger risk (lower level, default ruling 9), never summed HQs. */
export function legacyEvaluator(
  receptors: readonly Omit<LegacyScenarioReceptor, 'chemicals'>[],
  additive = false,
): RiskEvaluator<LegacyChemical> {
  checkReceptorCount(receptors.length, additive);
  return (chemicals) => {
    const r = runLegacyScenario({
      receptors: receptors.map((x) => ({ ...x, chemicals })),
      additive,
    });
    return pick(r.summary, additive);
  };
}

export function modernEvaluator(
  receptors: readonly Omit<ModernScenarioReceptor, 'chemicals'>[],
  additive = false,
): RiskEvaluator<ModernChemical> {
  checkReceptorCount(receptors.length, additive);
  return (chemicals) => {
    const r = runModernScenario({
      receptors: receptors.map((x) => ({ ...x, chemicals })),
      additive,
    });
    return pick(r.summary, additive);
  };
}

/**
 * The receptor metric for a concentration target at the well: the largest moving average of the
 * well-screen concentration over `window` seconds (default 0, the peak; default ruling 8).
 */
export function wellConcentrationMetric(series: EpcSeries, window = 0): number {
  if (!(window >= 0 && Number.isFinite(window))) {
    throw new RangeError('the averaging window must be finite and not negative');
  }
  if (window === 0) return Math.max(0, ...series.values);
  return maximizeWindows([{ series, windows: [{ offset: 0, length: window, weight: 1 }] }]).value;
}

// ---------------------------------------------------------------- the solver driver

export interface TphReport {
  mode: 'kept' | 'held';
  F0: number;
  FT0: number;
}

export interface ChainChemical<C> {
  id: string;
  chemical: C;
  chain: Chain;
  /** Entered source concentration, SI; the ratios drive the cumulative allocation. */
  entered?: number;
  /** Add the receptor's direct soil pathways at the same F (default for a soil chain). */
  linkedSoil?: boolean;
  /** Replaces the risk targets by a well concentration (individual allocation only). */
  concentrationTarget?: ConcentrationTargetSpec;
  mcl?: Mcl;
  /** For the implied TPH report of a kept-mole-fraction source. */
  tph?: TphReport;
  /** Soil saturation limit, kg/kg, for the soil level warning. */
  csat?: number;
}

export interface ModeledInput<C> {
  evaluate: RiskEvaluator<C>;
  /** The pathways the receptors have on (the union over receptors). */
  pathways: readonly PathwayId[];
  chemicals: readonly ChainChemical<C>[];
  targets?: RiskTargets;
  allocation?: Allocation;
  /** Averaging time of a concentration target, s (default 0, the peak). */
  averagingWindow?: number;
  secantParity?: boolean;
  maxIter?: number;
}

export type ModeledEndpoint = 'cancer' | 'noncancer' | 'concentration';

export interface ModeledLevel {
  chemical: string;
  /** The cleanup level, SI; null when the target is not reachable or nothing is quantified. */
  level: number | null;
  limiting: ModeledEndpoint | null;
  cancerLevel: number | null;
  noncancerLevel: number | null;
  /** Implied TPH, kg/kg, for a kept-mole-fraction source. */
  impliedTph: number | null;
  solves: Partial<Record<ModeledEndpoint, SolveResult>>;
}

export interface ModeledResult {
  allocation: Allocation;
  levels: ModeledLevel[];
  /** Cumulative only. */
  scale: number | null;
  scaleLimiting: 'cancer' | 'noncancer' | null;
  warnings: Warning[];
}

function epcMap<C>(
  c: ChainChemical<C>,
  pathways: readonly PathwayId[],
  conc: number,
  spec?: EpcSpec,
): Partial<Record<PathwayId, EpcSpec>> {
  const linked = c.linkedSoil ?? c.chain.medium === 'soil';
  const series = spec ?? c.chain.epc(conc);
  const out: Partial<Record<PathwayId, EpcSpec>> = {};
  for (const p of pathways) {
    const medium = PATHWAYS[p].medium;
    if (medium === 'groundwater') out[p] = series;
    else if (medium === 'soil' && linked) {
      out[p] = { kind: 'constant', value: conc, origin: 'cleanup' };
    }
  }
  return out;
}

/**
 * The receptor metrics at one source concentration for chemical `index`, through the same chain and
 * evaluator the solver inverts: total cancer risk, headline hazard index and, for a chain that gives a
 * well series, the averaged peak concentration (`averagingWindow`). The screen draws its metric curve
 * with this so the curve and the solution cannot disagree.
 */
export function evaluateModeled<C>(
  input: ModeledInput<C>,
  index: number,
  conc: number,
): { cancer: number; hi: number; peak: number | null } {
  const c = input.chemicals[index];
  if (c === undefined) throw new RangeError(`no chemical at index ${index}`);
  const spec = c.chain.epc(conc);
  const r = input.evaluate([
    { id: c.id, chemical: c.chemical, epcs: epcMap(c, input.pathways, conc, spec) },
  ]);
  const peak =
    spec.kind === 'series' ? wellConcentrationMetric(spec.series, input.averagingWindow) : null;
  return { cancer: r.cancer, hi: r.hi, peak };
}

const memoized = <T>(f: (c: number) => T): ((c: number) => T) => {
  const cache = new Map<number, T>();
  return (c) => {
    let v = cache.get(c);
    if (v === undefined) {
      v = f(c);
      cache.set(c, v);
    }
    return v;
  };
};

/** Source-concentration cleanup levels through the modeled chains. */
export function solveModeled<C>(input: ModeledInput<C>): ModeledResult {
  const allocation = input.allocation ?? 'individual';
  const { chemicals } = input;
  checkUniqueChemicals(
    'chemicals',
    chemicals.map((c) => c.id),
  );
  checkAllocationTargets(
    allocation,
    chemicals.filter((c) => c.concentrationTarget !== undefined).map((c) => c.id),
  );
  const resolved = resolveRiskTargets(input.targets);
  const warnings: Warning[] = [...resolved.warnings];
  const { risk: tr, hq: thq } = resolved;
  const solveOpts = { secantParity: input.secantParity, maxIter: input.maxIter };

  const alone = (c: ChainChemical<C>) =>
    memoized((conc: number) =>
      input.evaluate([{ id: c.id, chemical: c.chemical, epcs: epcMap(c, input.pathways, conc) }]),
    );

  /** Solves one endpoint and routes its warnings; unreachable endpoints are judged by the caller. */
  const endpointSolve = (
    metric: (c: number) => number,
    target: number,
    reference: number,
    cap: number | undefined,
    chains: readonly Chain[],
  ): SolveResult => {
    const r = solveSourceLevel({ metric, target, reference, cap, ...solveOpts });
    // a chain flags itself numerical during the runs; acceptance is then re-judged at 1e-3
    if (chains.some((ch) => ch.numerical) && r.reachable) {
      r.warnings = r.warnings.filter((w) => w.code !== 'cleanup.round-trip-tolerance');
      r.warnings.push({
        code: 'cleanup.numerical-chain',
        message:
          'the chain contains the layered finite-volume solver; the level meets the target to 1e-3',
      });
      if (Math.abs(r.residual) > NUMERICAL_TOLERANCE) {
        r.warnings.push({
          code: 'cleanup.round-trip-tolerance',
          message: `the level misses the target: relative residual ${Math.abs(r.residual)} against the acceptance ${NUMERICAL_TOLERANCE}`,
        });
      }
    }
    return r;
  };

  const judge = (
    id: string,
    solves: Partial<Record<ModeledEndpoint, SolveResult>>,
    reachableAny: boolean,
  ): void => {
    for (const s of Object.values(solves)) {
      for (const w of s.warnings) {
        if (w.code === 'cleanup.target-not-reachable') continue;
        warnings.push({ ...w, message: `${id}: ${w.message}` });
      }
    }
    if (reachableAny) return;
    const all = Object.values(solves);
    if (all.every((s) => s.maxMetric === 0)) {
      warnings.push({
        code: 'cleanup.not-quantified',
        message: `${id}: no toxicity value or no transport to the receptor; no risk-based level`,
      });
    } else {
      const s = all.find((x) => x.maxMetric > 0) ?? all[0]!;
      warnings.push({
        code: 'cleanup.target-not-reachable',
        message: `${id}: the metric is at most ${s.maxMetric} within the search range, below the target; no cleanup level below the cap`,
      });
    }
  };

  if (allocation === 'cumulative') {
    for (const c of chemicals) {
      if (!(c.entered !== undefined && c.entered > 0 && Number.isFinite(c.entered))) {
        throw new RangeError(
          `cumulative allocation needs a positive entered concentration for ${c.id}`,
        );
      }
    }
    const evalAll = memoized((s: number) =>
      input.evaluate(
        chemicals.map((c) => ({
          id: c.id,
          chemical: c.chemical,
          epcs: epcMap(c, input.pathways, c.entered! * s),
        })),
      ),
    );
    const caps = chemicals.flatMap((c) =>
      c.chain.cap === undefined ? [] : [c.chain.cap / c.entered!],
    );
    const cap = caps.length === 0 ? undefined : Math.min(...caps);
    const chains = chemicals.map((c) => c.chain);
    const sc = endpointSolve((s) => evalAll(s).cancer, tr, 1, cap, chains);
    const snc = endpointSolve((s) => evalAll(s).hi, thq, 1, cap, chains);
    const solves = { cancer: sc, noncancer: snc };
    const options = (
      [
        ['cancer', sc],
        ['noncancer', snc],
      ] as const
    ).filter(([, r]) => r.reachable);
    const best = options.reduce<(typeof options)[number] | null>(
      (m, o) => (m === null || o[1].level! < m[1].level! ? o : m),
      null,
    );
    judge('cumulative scale', solves, best !== null);
    warnings.push({
      code: 'cleanup.hi-unsegregated',
      message:
        'cumulative allocation sums hazard quotients over all target organs (no organ segregation)',
    });
    const scale = best === null ? null : best[1].level!;
    return {
      allocation,
      scale,
      scaleLimiting: best === null ? null : best[0],
      warnings,
      levels: chemicals.map((c) => ({
        chemical: c.id,
        level: scale === null ? null : scale * c.entered!,
        limiting: best === null ? null : best[0],
        cancerLevel: sc.level === null ? null : sc.level * c.entered!,
        noncancerLevel: snc.level === null ? null : snc.level * c.entered!,
        impliedTph: null,
        solves,
      })),
    };
  }

  let trE = tr;
  let thqE = thq;
  const evals = chemicals.map(alone);
  if (allocation === 'equal') {
    const nC = chemicals.filter(
      (c, i) => evals[i]!(c.entered ?? c.chain.reference).cancer > 0,
    ).length;
    const nNc = chemicals.filter((c, i) => evals[i]!(c.entered ?? c.chain.reference).hi > 0).length;
    trE = nC > 0 ? tr / nC : tr;
    thqE = nNc > 0 ? thq / nNc : thq;
    warnings.push({
      code: 'cleanup.hi-unsegregated',
      message:
        'equal allocation divides the hazard quotient over all chemicals (no organ segregation)',
    });
  }

  const levels: ModeledLevel[] = chemicals.map((c, i) => {
    const ev = evals[i]!;
    const reference = c.entered ?? c.chain.reference;
    const solves: Partial<Record<ModeledEndpoint, SolveResult>> = {};
    let level: number | null = null;
    let limiting: ModeledEndpoint | null = null;
    let cancerLevel: number | null = null;
    let noncancerLevel: number | null = null;

    let concentrationDone = false;
    if (c.concentrationTarget !== undefined) {
      const t = resolveConcentrationTarget(c.id, c.concentrationTarget, c.mcl);
      warnings.push(...t.warnings);
      if (t.value !== null) {
        const metric = memoized((conc: number) => {
          const spec = c.chain.epc(conc);
          if (spec.kind !== 'series')
            throw new Error('a concentration target needs a series chain');
          return wellConcentrationMetric(spec.series, input.averagingWindow);
        });
        const s = endpointSolve(metric, t.value, reference, c.chain.cap, [c.chain]);
        solves.concentration = s;
        level = s.level;
        limiting = s.reachable ? 'concentration' : null;
        concentrationDone = true;
      }
    }
    if (!concentrationDone) {
      const sc = endpointSolve((x) => ev(x).cancer, trE, reference, c.chain.cap, [c.chain]);
      const snc = endpointSolve((x) => ev(x).hi, thqE, reference, c.chain.cap, [c.chain]);
      solves.cancer = sc;
      solves.noncancer = snc;
      cancerLevel = sc.level;
      noncancerLevel = snc.level;
      if (sc.level !== null && (snc.level === null || sc.level <= snc.level)) {
        level = sc.level;
        limiting = 'cancer';
      } else if (snc.level !== null) {
        level = snc.level;
        limiting = 'noncancer';
      }
    }
    judge(c.id, solves, level !== null);

    if (level !== null && c.chain.medium === 'soil' && c.csat !== undefined && level > c.csat) {
      warnings.push({
        code: 'cleanup.csat-exceeded',
        message: `${c.id}: the soil level exceeds the soil saturation concentration; free product may be present`,
      });
    }
    let impliedTph: number | null = null;
    if (level !== null && c.tph !== undefined && c.tph.mode === 'kept') {
      impliedTph = (c.tph.FT0 * level) / c.tph.F0;
      warnings.push({
        code: 'cleanup.implied-tph',
        message: `${c.id}: the level implies a TPH fraction of ${impliedTph} kg/kg at the entered mole fraction`,
      });
    }
    return { chemical: c.id, level, limiting, cancerLevel, noncancerLevel, impliedTph, solves };
  });

  return { allocation, levels, scale: null, scaleLimiting: null, warnings };
}
