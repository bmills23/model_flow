import type { EpcSpec } from '../exposure/index.js';
import {
  checkMixingFraction,
  checkNonNegative,
  checkPositive,
  checkTimes,
  type SurfaceWaterWarning,
} from './checks.js';
import { surfaceWaterEpc } from './coupling.js';
import {
  bankPlaneDischarge,
  type BankPlane,
  type PlaneConcentration,
  type PlaneQuadratureOptions,
} from './discharge.js';
import { plugFlowDownstream } from './downstream.js';
import { darcyDischarge, legacyBoxSeries, riverVolume } from './legacy.js';
import {
  modernSediment,
  modernWarnings,
  type ModernSedimentInput,
  type PoreWaterSource,
} from './modern.js';
import { domenicoReachLength } from './reach.js';
import { sedimentConcentration } from './sediment.js';
import { transientBox } from './transient.js';

/**
 * End-to-end surface water runs for the two registered methods (`surfaceWater.well-mixed`,
 * `surfaceWater.mass-discharge`): groundwater at the bank in, surface water, sediment, an optional river
 * receptor and the swimming EPCs out. SI units throughout (see `units.ts` for the boundary conversions).
 */

export type WaterBody =
  { type: 'river'; crossSection: number; reachLength?: number } | { type: 'lake'; volume: number };

export const ORIGIN_LEGACY = 'surfaceWater.well-mixed';
export const ORIGIN_MODERN = 'surfaceWater.mass-discharge';

/** Share of the full-depth discharge below which the plume is said to pass beneath the water body. */
const UNDERFLOW_LIMIT = 0.95;
/** Factor by which K_b i_b may differ from the M1 Darcy flux before the mismatch is warned. */
const FLUX_MISMATCH_FACTOR = 2;

export interface SedimentSeriesResult {
  quantified: boolean;
  /** Kd used, m^3/kg. */
  kd?: number;
  /** C_sed at each time, kg/kg dry weight; absent when not quantified (never zero). */
  concentrations?: number[];
  /** C_sed / f_oc at each time, kg/kg organic carbon, when Kd came from a Koc. */
  organicCarbonNormalized?: number[];
  /** The pore water that was used (the modern method; the legacy method always uses the centreline). */
  poreWater: PoreWaterSource;
  warnings: SurfaceWaterWarning[];
}

function dedupe(ws: readonly SurfaceWaterWarning[]): SurfaceWaterWarning[] {
  const seen = new Map<string, SurfaceWaterWarning>();
  for (const w of ws) seen.set(`${w.code}|${w.message}`, w);
  return [...seen.values()];
}

function checkBodyShape(body: WaterBody): void {
  if (body.type === 'river') checkPositive('river cross-section', body.crossSection);
  else if (body.type === 'lake') checkPositive('lake volume', body.volume);
  else throw new RangeError('the water body must be a river or a lake');
}

function sedimentFromPoreWater(
  poreWater: readonly number[],
  source: PoreWaterSource,
  s: { fractionOrganicCarbon: number; koc?: number; kd?: number },
): SedimentSeriesResult {
  const rows = poreWater.map((c) =>
    sedimentConcentration({
      poreWaterConcentration: c,
      fractionOrganicCarbon: s.fractionOrganicCarbon,
      ...(s.koc !== undefined ? { koc: s.koc } : {}),
      ...(s.kd !== undefined ? { kd: s.kd } : {}),
    }),
  );
  const first = rows[0];
  if (first === undefined || !first.quantified) {
    return { quantified: false, poreWater: source, warnings: dedupe(first?.warnings ?? []) };
  }
  return {
    quantified: true,
    ...(first.kd !== undefined ? { kd: first.kd } : {}),
    concentrations: rows.map((r) => r.concentration as number),
    ...(first.organicCarbonNormalized !== undefined
      ? { organicCarbonNormalized: rows.map((r) => r.organicCarbonNormalized as number) }
      : {}),
    poreWater: source,
    warnings: [],
  };
}

/* ------------------------------- legacy ------------------------------- */

export type ReachSpec =
  | { kind: 'entered'; length: number }
  /** The 5 percent steady Domenico width; x_s from the downgradient source face (RISC5's own dispersivities unless given). */
  | { kind: 'domenico'; sourceWidth: number; distance: number; transverseDispersivity?: number };

export type DischargeSpec =
  | { kind: 'flow'; flow: number }
  | { kind: 'darcy'; bedConductivity: number; thickness: number; gradient: number };

/** What the legacy run knows about the M1 run it is linked to; every field is optional. */
export interface LegacyLink {
  /** The M1 source release rate at each sample time, kg/s (for the loading-exceeds-source check). */
  sourceReleaseRates?: readonly number[];
  /** The M1 Darcy flux n v, m/s (for the flux-mismatch check against K_b i_b). */
  darcyFlux?: number;
  /** Share of the full-depth discharge above the discharge thickness, from the caller's M1 plane check. */
  plumeDepthFraction?: number;
  /** The M1 Domenico validity warnings for the reach geometry, attached when the reach is from Domenico. */
  domenicoWarnings?: readonly SurfaceWaterWarning[];
}

export interface LegacySurfaceWaterInput {
  body: WaterBody;
  /** Upstream flow Q_u, m^3/s. */
  upstreamFlow: number;
  /** Upstream background C_u, kg/m^3. */
  background: number;
  /** Mixing fraction f in (0, 1]. */
  mixingFraction: number;
  /** First-order decay k, 1/s. */
  decay: number;
  /** Reach length source; absent uses `body.reachLength` (a river) and is not needed for a lake with a flow. */
  reach?: ReachSpec;
  discharge: DischargeSpec;
  /** Sample times, s, strictly increasing. */
  times: readonly number[];
  /** Groundwater concentration at the bank (centreline, screen-averaged) at each time, kg/m^3. */
  groundwaterConcentrations: readonly number[];
  sediment?: { fractionOrganicCarbon: number; koc?: number; kd?: number };
  /** Solubility, kg/m^3, for the warning only. */
  solubility?: number;
  link?: LegacyLink;
}

export interface LegacySurfaceWaterResult {
  times: number[];
  groundwaterConcentrations: number[];
  /** C_sw at each time, kg/m^3. */
  surfaceWater: number[];
  peakSurfaceWater: number;
  groundwaterFlow: number;
  reachLength?: number;
  sediment: SedimentSeriesResult;
  /** The surface water series as the swimming EPC, origin `surfaceWater.well-mixed`. */
  epc: EpcSpec;
  warnings: SurfaceWaterWarning[];
}

function legacyReach(i: LegacySurfaceWaterInput): number | undefined {
  if (i.reach?.kind === 'entered') {
    checkPositive('reach length', i.reach.length);
    return i.reach.length;
  }
  if (i.reach?.kind === 'domenico') {
    return domenicoReachLength({
      sourceWidth: i.reach.sourceWidth,
      distance: i.reach.distance,
      ...(i.reach.transverseDispersivity !== undefined
        ? { transverseDispersivity: i.reach.transverseDispersivity }
        : {}),
    });
  }
  if (i.body.type === 'river' && i.body.reachLength !== undefined) {
    checkPositive('reach length', i.body.reachLength);
    return i.body.reachLength;
  }
  return undefined;
}

export function runLegacySurfaceWater(i: LegacySurfaceWaterInput): LegacySurfaceWaterResult {
  checkBodyShape(i.body);
  checkTimes(i.times);
  if (i.groundwaterConcentrations.length !== i.times.length) {
    throw new RangeError('one groundwater concentration per time is required');
  }
  checkMixingFraction(i.mixingFraction);
  const reachLength = legacyReach(i);
  const warnings: SurfaceWaterWarning[] = [];

  let groundwaterFlow: number;
  if (i.discharge.kind === 'flow') {
    checkNonNegative('groundwater flow', i.discharge.flow);
    groundwaterFlow = i.discharge.flow;
  } else {
    if (reachLength === undefined) throw new RangeError('a Darcy discharge needs a reach length');
    groundwaterFlow = darcyDischarge({ ...i.discharge, reachLength });
  }
  let bodyVolume: number;
  if (i.body.type === 'river') {
    if (reachLength === undefined) throw new RangeError('a river needs a reach length');
    bodyVolume = riverVolume(i.body.crossSection, reachLength);
  } else {
    bodyVolume = i.body.volume;
  }

  const box = legacyBoxSeries({
    upstreamFlow: i.upstreamFlow,
    background: i.background,
    mixingFraction: i.mixingFraction,
    groundwaterFlow,
    decay: i.decay,
    bodyVolume,
    ...(i.solubility !== undefined ? { solubility: i.solubility } : {}),
    times: i.times,
    groundwaterConcentrations: i.groundwaterConcentrations,
  });
  warnings.push(...box.warnings);

  if (i.reach?.kind === 'domenico') {
    warnings.push({
      code: 'surfaceWater.domenico-reach',
      message: 'the reach length came from the steady Domenico width (5 percent of the centreline)',
    });
    warnings.push(...(i.link?.domenicoWarnings ?? []));
  }
  const link = i.link;
  if (link?.sourceReleaseRates !== undefined) {
    if (link.sourceReleaseRates.length !== i.times.length) {
      throw new RangeError('one source release rate per time is required');
    }
    const exceeds = i.groundwaterConcentrations.some(
      (c, k) => groundwaterFlow * c > (link.sourceReleaseRates as readonly number[])[k]!,
    );
    if (exceeds) {
      warnings.push({
        code: 'surfaceWater.loading-exceeds-source',
        message:
          'the loading exceeds the groundwater source release rate (the centreline-step width overstates the mass discharged)',
      });
    }
  }
  if (link?.darcyFlux !== undefined && i.discharge.kind === 'darcy') {
    checkPositive('M1 Darcy flux', link.darcyFlux);
    const bed = i.discharge.bedConductivity * i.discharge.gradient;
    const ratio = bed / link.darcyFlux;
    if (ratio > FLUX_MISMATCH_FACTOR || ratio < 1 / FLUX_MISMATCH_FACTOR) {
      warnings.push({
        code: 'surfaceWater.discharge-flux-mismatch',
        message: 'K_b i_b differs from the M1 Darcy flux by more than a factor of 2',
      });
    }
  }
  if (link?.plumeDepthFraction !== undefined && link.plumeDepthFraction < UNDERFLOW_LIMIT) {
    warnings.push({
      code: 'surfaceWater.plume-underflow',
      message: `only ${(100 * link.plumeDepthFraction).toFixed(1)} percent of the full-depth discharge lies above the discharge thickness (the plume passes beneath the water body)`,
    });
  }

  let sediment: SedimentSeriesResult = { quantified: false, poreWater: 'centreline', warnings: [] };
  if (i.sediment !== undefined) {
    sediment = sedimentFromPoreWater(i.groundwaterConcentrations, 'centreline', i.sediment);
    warnings.push(...sediment.warnings);
  }
  const surfaceWater = box.concentrations;
  return {
    times: [...i.times],
    groundwaterConcentrations: [...i.groundwaterConcentrations],
    surfaceWater,
    peakSurfaceWater: Math.max(...surfaceWater),
    groundwaterFlow,
    ...(reachLength !== undefined ? { reachLength } : {}),
    sediment,
    epc: surfaceWaterEpc(i.times, surfaceWater, ORIGIN_LEGACY),
    warnings: dedupe(warnings),
  };
}

/* ------------------------------- modern ------------------------------- */

export type BankSource =
  | {
      kind: 'plane';
      /** M1 concentration on the bank plane (see `at123dBankPlane`). */
      concentration: PlaneConcentration;
      plane: BankPlane;
      times: readonly number[];
      quadrature?: PlaneQuadratureOptions;
    }
  | {
      kind: 'discharge';
      times: readonly number[];
      /** Mass discharge W at each time, kg/s. */
      discharge: readonly number[];
      /** Groundwater flow through the plane, m^3/s. */
      groundwaterFlow: number;
    };

export interface ModernSurfaceWaterInput {
  body: WaterBody;
  upstreamFlow: number;
  background: number;
  mixingFraction: number;
  decay: number;
  bank: BankSource;
  /** Centreline (screen-averaged) groundwater concentration at each time, kg/m^3, for the `centreline` pore water. */
  centrelineConcentrations?: readonly number[];
  /** Concentration at the first time; default the steady state of the first loading. */
  initialConcentration?: number;
  /** A river receptor this far below the downstream end of the reach, m. */
  downstream?: { distance: number };
  sediment?: Omit<
    ModernSedimentInput,
    'dischargeConcentration' | 'centrelineConcentration' | 'surfaceConcentration'
  >;
  solubility?: number;
}

export interface ModernSurfaceWaterResult {
  times: number[];
  /** Mass discharge W(t), kg/s. */
  discharge: number[];
  groundwaterFlow: number;
  /** W / Q_gw, kg/m^3. */
  fluxAveragedConcentration: number[];
  /** C_sw in the mixing zone at each time, kg/m^3. */
  surfaceWater: number[];
  peakSurfaceWater: number;
  /** Hydraulic residence time of the box, s. */
  residenceTime: number;
  /** River receptor concentration at each time, kg/m^3. */
  downstream?: number[];
  sediment: SedimentSeriesResult;
  epc: EpcSpec;
  downstreamEpc?: EpcSpec;
  warnings: SurfaceWaterWarning[];
}

export function runModernSurfaceWater(i: ModernSurfaceWaterInput): ModernSurfaceWaterResult {
  checkBodyShape(i.body);
  checkMixingFraction(i.mixingFraction);
  checkNonNegative('upstream flow', i.upstreamFlow);
  checkNonNegative('background concentration', i.background);
  checkNonNegative('decay rate', i.decay);
  const warnings: SurfaceWaterWarning[] = [];

  let times: number[];
  let discharge: number[];
  let groundwaterFlow: number;
  let fluxAveraged: number[];
  let planeReach: number | undefined;
  if (i.bank.kind === 'plane') {
    const r = bankPlaneDischarge(
      i.bank.concentration,
      i.bank.plane,
      i.bank.times,
      i.bank.quadrature,
    );
    times = r.times;
    discharge = r.discharge;
    groundwaterFlow = r.groundwaterFlow;
    fluxAveraged = r.fluxAveragedConcentration;
    planeReach = i.bank.plane.reachLength;
    warnings.push(...r.warnings);
  } else {
    checkTimes(i.bank.times);
    if (i.bank.discharge.length !== i.bank.times.length) {
      throw new RangeError('one discharge per time is required');
    }
    checkPositive('groundwater flow', i.bank.groundwaterFlow);
    for (const w of i.bank.discharge) checkNonNegative('mass discharge', w);
    times = [...i.bank.times];
    discharge = [...i.bank.discharge];
    groundwaterFlow = i.bank.groundwaterFlow;
    fluxAveraged = discharge.map((w) => w / groundwaterFlow);
  }
  if (
    i.centrelineConcentrations !== undefined &&
    i.centrelineConcentrations.length !== times.length
  ) {
    throw new RangeError('one centreline concentration per time is required');
  }

  let bodyVolume: number;
  let reachLength: number | undefined;
  if (i.body.type === 'river') {
    reachLength = i.body.reachLength ?? planeReach;
    if (reachLength === undefined) throw new RangeError('a river needs a reach length');
    bodyVolume = riverVolume(i.body.crossSection, reachLength);
  } else {
    if (i.downstream !== undefined) {
      throw new RangeError('a downstream river receptor needs a river, not a lake');
    }
    bodyVolume = i.body.volume;
  }

  const f = i.mixingFraction;
  const box = transientBox({
    mixFlow: f * i.upstreamFlow + groundwaterFlow,
    mixVolume: f * bodyVolume,
    decay: i.decay,
    backgroundLoading: f * i.upstreamFlow * i.background,
    times,
    loadings: discharge,
    ...(i.initialConcentration !== undefined
      ? { initialConcentration: i.initialConcentration }
      : {}),
  });
  const surfaceWater = box.concentrations;

  let downstream: number[] | undefined;
  if (i.downstream !== undefined && i.body.type === 'river') {
    downstream = plugFlowDownstream({
      boxConcentration: box.evaluate,
      times,
      upstreamFlow: i.upstreamFlow,
      background: i.background,
      mixingFraction: f,
      groundwaterFlow,
      crossSection: i.body.crossSection,
      decay: i.decay,
      distance: i.downstream.distance,
    }).concentrations;
  }

  let sediment: SedimentSeriesResult = { quantified: false, poreWater: 'discharge', warnings: [] };
  if (i.sediment !== undefined) {
    const s = i.sediment;
    const poreWater = s.poreWater ?? 'discharge';
    const rows = times.map((_, k) =>
      modernSediment({
        ...s,
        dischargeConcentration: fluxAveraged[k] as number,
        ...(i.centrelineConcentrations !== undefined
          ? { centrelineConcentration: i.centrelineConcentrations[k] as number }
          : {}),
        surfaceConcentration: surfaceWater[k] as number,
      }),
    );
    const first = rows[0];
    if (first === undefined || !first.quantified) {
      sediment = { quantified: false, poreWater, warnings: dedupe(first?.warnings ?? []) };
    } else {
      sediment = {
        quantified: true,
        ...(first.kd !== undefined ? { kd: first.kd } : {}),
        concentrations: rows.map((r) => r.concentration as number),
        ...(first.organicCarbonNormalized !== undefined
          ? { organicCarbonNormalized: rows.map((r) => r.organicCarbonNormalized as number) }
          : {}),
        poreWater,
        warnings: [],
      };
    }
    warnings.push(...sediment.warnings);
  }

  warnings.push(
    ...modernWarnings({
      groundwaterFlow,
      mixingFraction: f,
      upstreamFlow: i.upstreamFlow,
      peakGroundwaterConcentration: Math.max(...fluxAveraged),
      peakSurfaceConcentration: Math.max(...surfaceWater),
      ...(i.solubility !== undefined ? { solubility: i.solubility } : {}),
    }),
  );

  return {
    times,
    discharge,
    groundwaterFlow,
    fluxAveragedConcentration: fluxAveraged,
    surfaceWater,
    peakSurfaceWater: Math.max(...surfaceWater),
    residenceTime: box.residenceTime,
    ...(downstream !== undefined ? { downstream } : {}),
    sediment,
    epc: surfaceWaterEpc(times, surfaceWater, ORIGIN_MODERN),
    ...(downstream !== undefined
      ? { downstreamEpc: surfaceWaterEpc(times, downstream, ORIGIN_MODERN) }
      : {}),
    warnings: dedupe(warnings),
  };
}
