import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { integrate } from '../../numerics/quadrature.js';
import {
  unitGradientMoisture,
  type HydraulicModel,
  type UnitGradientMoisture,
} from './hydraulics.js';
import {
  equilibriumPoreWater,
  residualPhaseTest,
  type ResidualPhaseResult,
} from './partitioning.js';
import { millingtonQuirkDeff } from './diffusion.js';
import { sourceDepletionRate, sourceState, type SourceParams } from './source.js';
import {
  c13Concentration,
  c13DispersiveInflux,
  c13Evaluation,
  type C13Evaluation,
  type C13Params,
} from './kernel.js';
import { dispersivityRegressionWarning, vadsatDispersivity } from './dispersivity.js';
import { vadsatUncertainInputs } from './uncertain.js';

export * from './hydraulics.js';
export * from './partitioning.js';
export * from './diffusion.js';
export * from './source.js';
export * from './kernel.js';
export * from './dispersivity.js';
export * from './c14.js';
export * from './layered.js';
export * from './modern.js';
export * from './coupling.js';

const DAY = 86400;
const MONTH = (365.25 * DAY) / 12;

/** Hydraulic and sorption properties of one soil, SI (Ks in m/s, rhoB in kg/m^3). */
export interface VadsatSoil {
  thetaS: number;
  thetaR: number;
  /** van Genuchten n (> 1). */
  n: number;
  Ks: number;
  rhoB: number;
  /** Organic carbon fraction. */
  foc: number;
}

export interface VadsatLayer extends VadsatSoil {
  /** Thickness, m. */
  thickness: number;
}

export interface VadsatSource extends VadsatLayer {
  /** Plan length and width, m. */
  length: number;
  width: number;
  /** Chemical mass fraction in soil, kg/kg. */
  F: number;
  /** Optional TPH mass fraction (kg/kg) and TPH molar mass (kg/mol); give both or neither. */
  FT?: number;
  MT?: number;
  /** Optional first-order source decay rate, 1/s (default 0, RISC5 choice). */
  decayRate?: number;
}

export interface VadoseChemical {
  /** Molar mass, kg/mol. */
  M: number;
  /** Aqueous solubility, kg/m^3. */
  S: number;
  /** Dimensionless Henry's constant. */
  H: number;
  /** Organic carbon partition coefficient, m^3/kg. */
  Koc: number;
  /** Diffusion coefficients in air and water, m^2/s. */
  Da: number;
  Dw: number;
  /** First-order decay rate of the dissolved phase below the source, 1/s. */
  mu: number;
}

export interface VadsatInput {
  /** Infiltration (Darcy flux), m/s. */
  q: number;
  /** Clean soil above the top of the source, m, including any lens. */
  depthToSource: number;
  /** Clean soil above the source (outside the lens). */
  above: VadsatSoil;
  /** Optional lens inside the clean soil above the source. */
  lens?: VadsatLayer;
  source: VadsatSource;
  /** Soil between the base of the source and the water table; its thickness is L_u. */
  below: VadsatLayer;
  chemical: VadoseChemical;
  /** Moisture model (default 'brooksCorey1964', the legacy choice). */
  hydraulicModel?: HydraulicModel;
  /** User-entered longitudinal dispersivity, m; overrides the regression at every depth. */
  alphaL?: number;
  /** Depths below the base of the source for the profiles, m (default 21 points to L_u). */
  depths?: readonly number[];
  /** Profile times, s (default [duration]). */
  profileTimes?: readonly number[];
  /** End of the water-table and source series, s. */
  duration: number;
  /** Series step, s (default one month of a 365.25-day year). */
  seriesStep?: number;
}

export interface VadsatModel {
  /** Infiltration actually carried by the column, m/s (entered q, clamped to the smallest Ks). */
  q: number;
  clamped: boolean;
  moisture: {
    above?: UnitGradientMoisture;
    lens?: UnitGradientMoisture;
    source: UnitGradientMoisture;
    below: UnitGradientMoisture;
  };
  sourceSoil: { rhoB: number; kd: number; theta: number; thetaA: number };
  sourceThickness: number;
  /** Source plan area, m^2. */
  area: number;
  chemical: VadoseChemical;
  partition: ResidualPhaseResult;
  /** Overall effective vapour diffusion coefficient above the source, m^2/s (null when H = 0). */
  deff: number | null;
  /** Vapour diffusion path from the surface to the middle of the source, m. */
  diffusionPath: number;
  /** H Deff / Ld, m/s. */
  volatilizationVelocity: number;
  source: SourceParams & { gamma: number };
  /** Initial source mass over the whole plan area, kg. */
  initialSourceMass: number;
  retardation: number;
  lowFocRetardation: boolean;
  /** Distance from the base of the source to the water table, m. */
  waterTableDepth: number;
  waterTableDispersivity: number;
  /** Transport parameters at the water table (null when q = 0, so nothing leaches). */
  waterTable: C13Params | null;
  alphaL?: number;
}

export interface VadsatOutput {
  /** How the water-table solution was evaluated. */
  evaluation: C13Evaluation;
  q: number;
  clamped: boolean;
  moisture: VadsatModel['moisture'];
  partition: ResidualPhaseResult;
  gamma: number;
  diffusionPath: number;
  deff: number | null;
  volatilizationVelocity: number;
  /** Share of the source loss that leaches (the rest volatilizes or decays). */
  leachedShare: number;
  retardation: number;
  waterTableDispersivity: number;
  profiles: {
    times: number[];
    depths: number[];
    /** Dispersivity used at each depth, m (0 at the inlet). */
    dispersivity: number[];
    evaluation: C13Evaluation[];
    /** concentrations[time][depth], kg/m^3. */
    concentrations: number[][];
  };
  series: {
    times: number[];
    /** Concentration at the water table, kg/m^3. */
    waterTable: number[];
    /** Advective flux q C at the water table, kg/m^2/s. */
    flux: number[];
    /** Flux times source area, kg/s. */
    massRate: number[];
    sourcePoreWater: number[];
    /** Cumulative masses over the whole source area, kg. */
    sourceMass: number[];
    leached: number[];
    volatilized: number[];
    sourceDecayed: number[];
    delivered: number[];
  };
  budget: {
    time: number;
    initialSourceMass: number;
    sourceMass: number;
    leached: number;
    volatilized: number;
    sourceDecayed: number;
    /** Leached mass plus the dispersive influx admitted by the first-type inlet, kg. */
    columnInflux: number;
    /** columnInflux / leached at the end of the run. */
    inletExcessRatio: number;
    /**
     * The same ratio over the whole release (t to infinity), closed form; the
     * `vadose.inlet-mass-excess` warning tests this value.
     */
    lifetimeInletExcessRatio: number;
    /** Dissolved plus sorbed mass between the source and the water table, kg. */
    inProfile: number;
    deliveredToWaterTable: number;
    /**
     * Column influx minus profile storage minus advective delivery, kg: decay in transit plus the
     * dispersive flux across the water table that the advective-only delivery leaves out.
     */
    inTransitLoss: number;
  };
  warnings: Warning[];
}

/** Warning thresholds (screening choices; see docs/methods/vadose-leaching.md). */
export const TPH_CONSTANT_THRESHOLD = 0.1;
export const INLET_EXCESS_THRESHOLD = 1.05;
export const LOW_FOC_THRESHOLD = 0.001;

function finite(name: string, x: number): void {
  if (!Number.isFinite(x)) throw new RangeError(`${name} must be finite, got ${x}`);
}
function nonNeg(name: string, x: number): void {
  finite(name, x);
  if (x < 0) throw new RangeError(`${name} must not be negative, got ${x}`);
}
function pos(name: string, x: number): void {
  finite(name, x);
  if (!(x > 0)) throw new RangeError(`${name} must be positive, got ${x}`);
}

function checkSoil(name: string, s: VadsatSoil): void {
  finite(`${name}.thetaS`, s.thetaS);
  if (!(s.thetaS > 0 && s.thetaS <= 1)) throw new RangeError(`${name}.thetaS must be in (0, 1]`);
  finite(`${name}.thetaR`, s.thetaR);
  if (!(s.thetaR >= 0 && s.thetaR < s.thetaS)) {
    throw new RangeError(`${name}.thetaR must be in [0, thetaS)`);
  }
  finite(`${name}.n`, s.n);
  if (!(s.n > 1)) throw new RangeError(`${name}.n must exceed 1`);
  pos(`${name}.Ks`, s.Ks);
  pos(`${name}.rhoB`, s.rhoB);
  nonNeg(`${name}.foc`, s.foc);
}

function checkInput(i: VadsatInput): void {
  nonNeg('q', i.q);
  nonNeg('depthToSource', i.depthToSource);
  checkSoil('above', i.above);
  checkSoil('source', i.source);
  checkSoil('below', i.below);
  pos('source.thickness', i.source.thickness);
  pos('source.length', i.source.length);
  pos('source.width', i.source.width);
  pos('below.thickness (distance to the water table)', i.below.thickness);
  if (i.lens) {
    checkSoil('lens', i.lens);
    pos('lens.thickness', i.lens.thickness);
    if (i.lens.thickness > i.depthToSource) {
      throw new RangeError('the lens must not be thicker than the clean soil above the source');
    }
  }
  nonNeg('source.F', i.source.F);
  if (i.source.FT !== undefined || i.source.MT !== undefined) {
    if (i.source.FT === undefined || i.source.MT === undefined) {
      throw new RangeError('give both the TPH mass fraction and the TPH molar mass, or neither');
    }
    pos('source.FT', i.source.FT);
    pos('source.MT', i.source.MT);
    if (i.source.F > i.source.FT) throw new RangeError('F must not exceed the TPH mass fraction');
  }
  if (i.source.decayRate !== undefined) nonNeg('source.decayRate', i.source.decayRate);
  const c = i.chemical;
  pos('chemical.M', c.M);
  pos('chemical.S', c.S);
  nonNeg('chemical.H', c.H);
  nonNeg('chemical.Koc', c.Koc);
  nonNeg('chemical.Da', c.Da);
  nonNeg('chemical.Dw', c.Dw);
  nonNeg('chemical.mu', c.mu);
  if (i.alphaL !== undefined) pos('alphaL', i.alphaL);
  nonNeg('duration', i.duration);
  if (i.seriesStep !== undefined) pos('seriesStep', i.seriesStep);
  for (const t of i.profileTimes ?? []) nonNeg('profile time', t);
  for (const x of i.depths ?? []) nonNeg('profile depth', x);
}

/** H times the Millington-Quirk Deff of one layer, m^2/s (finite also when H = 0). */
function hDeff(m: UnitGradientMoisture, thetaS: number, c: VadoseChemical): number {
  if (c.H > 0) {
    return c.H * millingtonQuirkDeff({ thetaS, theta: m.theta }, { Da: c.Da, Dw: c.Dw, H: c.H });
  }
  return (c.Dw * Math.pow(m.theta, 10 / 3)) / (thetaS * thetaS);
}

/** Derived, serialisable state of a legacy run: moisture, partitioning, source and transport. */
export function prepareVadsat(input: VadsatInput): VadsatModel {
  checkInput(input);
  const model = input.hydraulicModel ?? 'brooksCorey1964';
  const c = input.chemical;
  const lensH = input.lens?.thickness ?? 0;
  const soilH = input.depthToSource - lensH;

  // RISC5 choice: infiltration above Ks runs off. Under unit gradient every layer carries the
  // same flux, so the column carries at most the smallest Ks of the layers present.
  const present: VadsatSoil[] = [input.source, input.below];
  if (soilH > 0) present.push(input.above);
  if (input.lens) present.push(input.lens);
  const minKs = Math.min(...present.map((s) => s.Ks));
  const q = Math.min(input.q, minKs);
  const clamped = input.q > minKs;
  const moist = (s: VadsatSoil) => unitGradientMoisture(s, q, model);
  const moisture: VadsatModel['moisture'] = {
    source: moist(input.source),
    below: moist(input.below),
  };
  if (soilH > 0) moisture.above = moist(input.above);
  if (input.lens) moisture.lens = moist(input.lens);

  // Vapour path: Ld to the middle of the source, Deff over the clean soil above (RISC5 choice).
  const diffusionPath = input.depthToSource + input.source.thickness / 2;
  const segments: { h: number; hd: number }[] = [];
  if (moisture.above) {
    segments.push({ h: soilH, hd: hDeff(moisture.above, input.above.thetaS, c) });
  }
  if (moisture.lens && input.lens) {
    segments.push({ h: lensH, hd: hDeff(moisture.lens, input.lens.thetaS, c) });
  }
  if (segments.length === 0) {
    // source at the surface: no clean soil, so the source soil's own coefficient is used
    segments.push({ h: 1, hd: hDeff(moisture.source, input.source.thetaS, c) });
  }
  const hSum = segments.reduce((a, s) => a + s.h, 0);
  const hDeffSeries = segments.some((s) => s.hd === 0)
    ? 0
    : hSum / segments.reduce((a, s) => a + s.h / s.hd, 0);
  const volatilizationVelocity = hDeffSeries / diffusionPath;

  // Partitioning in the source and the residual-phase test
  const src = input.source;
  const kd = c.Koc * src.foc;
  const theta = moisture.source.theta;
  const thetaA = src.thetaS - theta;
  const ceq = equilibriumPoreWater({ F: src.F, rhoB: src.rhoB, kd, theta, thetaA, H: c.H });
  const partition = residualPhaseTest({
    F: src.F,
    M: c.M,
    S: c.S,
    ceq,
    ...(src.FT !== undefined && src.MT !== undefined ? { FT: src.FT, MT: src.MT } : {}),
  });
  const m0 = src.rhoB * src.thickness * src.F;
  const sp: SourceParams = {
    cs0: partition.cs0,
    m0,
    q,
    volatilization: volatilizationVelocity,
    sourceDecay: src.decayRate ?? 0,
  };
  const gamma = sourceDepletionRate(sp);
  const area = src.length * src.width;

  // Transport below the source
  const below = input.below;
  const lowFocRetardation = below.foc < LOW_FOC_THRESHOLD;
  const thetaBelow = moisture.below.theta;
  const retardation = lowFocRetardation ? 1 : 1 + (below.rhoB * c.Koc * below.foc) / thetaBelow;
  const waterTableDepth = below.thickness;
  const waterTableDispersivity = input.alphaL ?? vadsatDispersivity(waterTableDepth);
  const waterTable: C13Params | null =
    q > 0
      ? {
          v: moisture.below.v,
          D: waterTableDispersivity * moisture.below.v,
          R: retardation,
          mu: c.mu,
          gamma,
          c0: partition.cs0,
        }
      : null;

  return {
    q,
    clamped,
    moisture,
    sourceSoil: { rhoB: src.rhoB, kd, theta, thetaA },
    sourceThickness: src.thickness,
    area,
    chemical: c,
    partition,
    deff: c.H > 0 ? hDeffSeries / c.H : null,
    diffusionPath,
    volatilizationVelocity,
    source: { ...sp, gamma },
    initialSourceMass: m0 * area,
    retardation,
    lowFocRetardation,
    waterTableDepth,
    waterTableDispersivity,
    waterTable,
    ...(input.alphaL !== undefined ? { alphaL: input.alphaL } : {}),
  };
}

/** Transport parameters for an observation depth x (m): alpha_L evaluated at x (RISC5 choice). */
export function vadsatDepthParams(model: VadsatModel, x: number): C13Params | null {
  if (!model.waterTable || x === 0) return null;
  const alpha = model.alphaL ?? vadsatDispersivity(x);
  return { ...model.waterTable, D: alpha * model.waterTable.v };
}

/** Concentration (kg/m^3) at depth x (m) below the source base and time t (s). */
export function vadsatConcentration(model: VadsatModel, x: number, t: number): number {
  if (x === 0) return sourceState(model.source, t).cs;
  const p = vadsatDepthParams(model, x);
  return p ? c13Concentration(p, x, t) : 0;
}

/** Advective mass flux per unit area at the water table, kg/m^2/s (RISC5 choice: q C only). */
export function vadsatWaterTableFlux(model: VadsatModel, t: number): number {
  if (!model.waterTable) return 0;
  return model.q * c13Concentration(model.waterTable, model.waterTableDepth, t);
}

function seriesTimes(duration: number, step: number): number[] {
  const times = [0];
  for (let k = 1; ; k++) {
    const t = k * step;
    if (t >= duration * (1 - 1e-12)) break;
    times.push(t);
  }
  if (duration > 0) times.push(duration);
  return times;
}

function warningsFor(model: VadsatModel): Warning[] {
  const inletExcessRatio = lifetimeInletExcess(model);
  const w: Warning[] = [];
  const mgL = (kgm3: number) => (kgm3 * 1000).toPrecision(4);
  if (model.clamped) {
    w.push({
      code: 'vadose.infiltration-clamped',
      message: `Infiltration exceeds the saturated conductivity of a layer; it was reduced to ${(model.q * DAY).toPrecision(4)} m/d and the excess treated as runoff (RISC5 choice).`,
    });
  }
  const p = model.partition;
  if (p.residual) {
    w.push({
      code: 'vadose.residual-phase',
      message: `A separate phase is present: x = ${p.x.toPrecision(4)}, x S = ${mgL(p.effS)} mg/L, C_eq = ${mgL(p.ceq)} mg/L. The source pore water is set to x S (Raoult's law).`,
    });
  }
  if (p.tphRatio > TPH_CONSTANT_THRESHOLD * (1 + 1e-9)) {
    w.push({
      code: 'vadose.tph-constant-approximation',
      message: `F / F_T = ${p.tphRatio.toPrecision(3)} exceeds ${TPH_CONSTANT_THRESHOLD}: holding the TPH mass constant understates the depletion rate by up to that fraction.`,
    });
  }
  if (model.lowFocRetardation) {
    w.push({
      code: 'vadose.low-foc-retardation-ignored',
      message: `The organic carbon fraction below the source is under ${LOW_FOC_THRESHOLD}; retardation is set to 1 (RISC5 choice).`,
    });
  }
  if (inletExcessRatio > INLET_EXCESS_THRESHOLD) {
    w.push({
      code: 'vadose.inlet-mass-excess',
      message: `The first-type inlet admits ${inletExcessRatio.toPrecision(4)} times the mass the source loses by leaching over the release (threshold ${INLET_EXCESS_THRESHOLD}): dispersion is strong relative to advection at this decay rate.`,
    });
  }
  if (model.alphaL === undefined) w.push(dispersivityRegressionWarning());
  return w;
}

/**
 * Ratio of the total column influx to the total leaching loss over the whole release. From the
 * Laplace transform of the inlet gradient at s = 0, int_0^inf dC/dx(0, t) dt =
 * (c0 / gamma)(v - sqrt(v^2 + 4 D mu)) / (2D), so the ratio is 1 + (sqrt(v^2 + 4 D mu) - v) / (2v),
 * independent of R and gamma. With mu = 0 the early dispersive influx is returned later and the
 * ratio is exactly 1. The finite-time ratio is not used for the warning because it grows without
 * bound as t approaches zero, so it would flag every short run.
 */
export function lifetimeInletExcess(model: VadsatModel): number {
  const p = model.waterTable;
  if (!p) return 1;
  return 1 + (Math.sqrt(p.v * p.v + 4 * p.D * p.mu) - p.v) / (2 * p.v);
}

/** Ratio of cumulative column influx to cumulative leaching loss at time t. */
function inletExcess(model: VadsatModel, t: number): { influx: number; ratio: number } {
  const leached = sourceState(model.source, t).leached * model.area;
  if (!model.waterTable || !(leached > 0) || !(t > 0)) return { influx: leached, ratio: 1 };
  const dispersive =
    c13DispersiveInflux(model.waterTable, model.moisture.below.theta, t) * model.area;
  const influx = leached + dispersive;
  return { influx, ratio: influx / leached };
}

export function runVadsat(input: VadsatInput): VadsatOutput {
  const model = prepareVadsat(input);
  const duration = input.duration;
  const depths = input.depths
    ? [...input.depths]
    : Array.from({ length: 21 }, (_, k) => (model.waterTableDepth * k) / 20);
  const profileTimes = input.profileTimes ? [...input.profileTimes] : [duration];

  // Profiles: one solution per depth, each with alpha_L at that depth
  const depthParams = depths.map((x) => vadsatDepthParams(model, x));
  const profiles: VadsatOutput['profiles'] = {
    times: profileTimes,
    depths,
    dispersivity: depths.map((x) => (x === 0 ? 0 : (model.alphaL ?? vadsatDispersivity(x)))),
    evaluation: depthParams.map((p) => (p ? c13Evaluation(p) : 'closed-form')),
    concentrations: profileTimes.map((t) =>
      depths.map((x, k) => {
        const p = depthParams[k];
        if (x === 0) return sourceState(model.source, t).cs;
        return p ? c13Concentration(p, x, t) : 0;
      }),
    ),
  };

  // Monthly series at the water table and of the source
  const times = seriesTimes(duration, input.seriesStep ?? MONTH);
  const A = model.area;
  const series: VadsatOutput['series'] = {
    times,
    waterTable: [],
    flux: [],
    massRate: [],
    sourcePoreWater: [],
    sourceMass: [],
    leached: [],
    volatilized: [],
    sourceDecayed: [],
    delivered: [],
  };
  let delivered = 0;
  const wt = model.waterTable;
  times.forEach((t, k) => {
    const c = wt ? c13Concentration(wt, model.waterTableDepth, t) : 0;
    const st = sourceState(model.source, t);
    if (k > 0 && wt) {
      const lo = times[k - 1]!;
      delivered +=
        integrate((s) => vadsatWaterTableFlux(model, s), lo, t, {
          relTol: 1e-11,
          absTol: 1e-14 * model.q * wt.c0 * (t - lo),
        }).value * A;
    }
    series.waterTable.push(c);
    series.flux.push(model.q * c);
    series.massRate.push(model.q * c * A);
    series.sourcePoreWater.push(st.cs);
    series.sourceMass.push(st.mass * A);
    series.leached.push(st.leached * A);
    series.volatilized.push(st.volatilized * A);
    series.sourceDecayed.push(st.decayed * A);
    series.delivered.push(delivered);
  });

  // Budget at the end of the run
  const end = sourceState(model.source, duration);
  const { influx, ratio } = inletExcess(model, duration);
  let inProfile = 0;
  if (wt && duration > 0) {
    const thetaR = model.moisture.below.theta * model.retardation;
    inProfile =
      integrate((x) => c13Concentration(wt, x, duration), 0, model.waterTableDepth, {
        relTol: 1e-11,
        absTol: 1e-14 * wt.c0 * model.waterTableDepth,
      }).value *
      thetaR *
      A;
  }
  const budget: VadsatOutput['budget'] = {
    time: duration,
    initialSourceMass: model.initialSourceMass,
    sourceMass: end.mass * A,
    leached: end.leached * A,
    volatilized: end.volatilized * A,
    sourceDecayed: end.decayed * A,
    columnInflux: influx,
    inletExcessRatio: ratio,
    lifetimeInletExcessRatio: lifetimeInletExcess(model),
    inProfile,
    deliveredToWaterTable: delivered,
    inTransitLoss: influx - inProfile - delivered,
  };

  const lossRate = model.q + model.volatilizationVelocity;
  return {
    evaluation: wt ? c13Evaluation(wt) : 'closed-form',
    q: model.q,
    clamped: model.clamped,
    moisture: model.moisture,
    partition: model.partition,
    gamma: model.source.gamma,
    diffusionPath: model.diffusionPath,
    deff: model.deff,
    volatilizationVelocity: model.volatilizationVelocity,
    leachedShare: lossRate > 0 ? model.q / lossRate : 0,
    retardation: model.retardation,
    waterTableDispersivity: model.waterTableDispersivity,
    profiles,
    series,
    budget,
    warnings: warningsFor(model),
  };
}

export const vadoseVadsat: MethodDescriptor<VadsatInput, VadsatOutput> = {
  id: 'vadose.vadsat',
  process: 'vadose',
  kind: 'legacy',
  name: 'VADSAT-type compartmental leaching model',
  summary:
    'A well-mixed source that depletes by leaching and vapour diffusion (Raoult law with a separate phase), unit-gradient moisture, and one-dimensional advection-dispersion with retardation and decay from the base of the source to the water table, solved analytically.',
  citations: [
    'unlu1992',
    'vangenuchten1982',
    'brookscorey1964',
    'lenhard1989',
    'vangenuchten1980',
    'mualem1976',
    'millingtonquirk1961',
    'epa1996ssg',
    'gelhar1985',
  ],
  assumptions: [
    'Steady unit-gradient flow with uniform moisture in each layer.',
    'No NAPL migration; the vertical extent of the source is known and the soil below it starts clean.',
    'The source pore-water concentration is proportional to the mass left, so the source depletes exponentially; with a separate phase the TPH mass is held constant.',
    'Vapour diffusion from the source is pseudo-steady with zero concentration at the ground surface.',
    'Decay acts on the dissolved phase below the source only; vapour concentrations below the surface are not computed.',
    'Fixed water table; first-type inlet at the base of the source and zero gradient at great depth.',
  ],
  risc5Choice:
    'RISC5 reduces infiltration above Ks to Ks, holds the TPH mass constant in the Raoult source, takes the vapour path to the middle of the source with Deff averaged over the clean soil above it, evaluates a two-branch dispersivity regression at each observation depth without molecular diffusion, sets retardation to 1 below foc 0.001, applies decay to the dissolved phase only, leaves source biodegradation off by default and reports only the advective flux q C at the water table.',
  validate: (input) => warningsFor(prepareVadsat(input)),
  uncertainInputs: vadsatUncertainInputs<VadsatInput>(),
  run: runVadsat,
};
