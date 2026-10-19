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
import type { C13Params } from './kernel.js';
import { c14Concentration, c14Evaluation, c14TotalFlux, type C14Evaluation } from './c14.js';
import { solveLayeredColumn, type FvResult } from './layered.js';
import { vadsatDispersivity } from './dispersivity.js';
import { layeredUncertainInputs } from './uncertain.js';
import type { VadoseChemical, VadsatLayer, VadsatSource } from './index.js';

const DAY = 86400;
const MONTH = (365.25 * DAY) / 12;

/** Thresholds shared with the legacy method (screening choices; see the methods note). */
const TPH_CONSTANT_THRESHOLD = 0.1;
/** Finite-volume budget closure worse than this (relative) is reported. */
export const MASS_BALANCE_THRESHOLD = 1e-9;

export interface LayeredNumerics {
  /** Use the finite-volume solver even for one homogeneous layer below the source. */
  forceFiniteVolume?: boolean;
  /** Largest cell Peclet number (default 2). */
  maxPeclet?: number;
  /** Smallest number of cells per layer (default 20). */
  minCellsPerLayer?: number;
  /** Time-step acceptance: relative change of the water-table flux on halving (default 1e-4). */
  timeStepTolerance?: number;
  /** Largest number of time-step halvings (default 12). */
  maxRefinements?: number;
  /** Fixed time step, s (skips the refinement loop). */
  fixedTimeStep?: number;
  /** Grid acceptance: relative change on halving every cell (default 1e-3; 0 keeps the start grid). */
  gridTolerance?: number;
  /** Largest number of grid halvings (default 6). */
  maxGridRefinements?: number;
}

export interface LayeredInput {
  /** Infiltration (Darcy flux), m/s; must stay below the smallest Ks in the profile. */
  q: number;
  /** Clean layers above the source, from the ground surface down (may be empty). */
  above: readonly VadsatLayer[];
  source: VadsatSource;
  /** Layers from the base of the source down to the water table (at least one). */
  below: readonly VadsatLayer[];
  chemical: VadoseChemical;
  /** Moisture model (default 'vanGenuchten1980', the model the entered n belongs to). */
  hydraulicModel?: HydraulicModel;
  /** Longitudinal dispersivity, m (default: the legacy regression at the water-table depth). */
  alphaL?: number;
  /** Depths below the base of the source for the profiles, m (default 21 points to L_u). */
  depths?: readonly number[];
  /** Profile times, s (default [duration]). */
  profileTimes?: readonly number[];
  /** End of the water-table and source series, s. */
  duration: number;
  /** Series step, s (default one month of a 365.25-day year). */
  seriesStep?: number;
  numerics?: LayeredNumerics;
}

export interface LayeredTransportLayer {
  thickness: number;
  theta: number;
  /** Seepage velocity q / theta, m/s. */
  v: number;
  R: number;
  /** alpha_L v plus pore-water diffusion Dw theta^(7/3) / thetaS^2, m^2/s. */
  D: number;
}

export interface LayeredModel {
  q: number;
  hydraulicModel: HydraulicModel;
  moisture: {
    above: UnitGradientMoisture[];
    source: UnitGradientMoisture;
    below: UnitGradientMoisture[];
  };
  partition: ResidualPhaseResult;
  /** Overall vapour coefficient over the path (null when H = 0), m^2/s. */
  deff: number | null;
  /** Surface to the middle of the source, m. */
  diffusionPath: number;
  /** H Deff / Ld, m/s. */
  volatilizationVelocity: number;
  source: SourceParams & { gamma: number };
  area: number;
  initialSourceMass: number;
  chemical: VadoseChemical;
  dispersivity: number;
  waterTableDepth: number;
  below: LayeredTransportLayer[];
  evaluation: 'analytic-c14' | 'finite-volume';
}

export interface LayeredOutput {
  evaluation: 'analytic-c14' | 'finite-volume';
  /** How C14 was evaluated (analytic path only). */
  c14Evaluation?: C14Evaluation;
  q: number;
  moisture: LayeredModel['moisture'];
  partition: ResidualPhaseResult;
  gamma: number;
  diffusionPath: number;
  deff: number | null;
  volatilizationVelocity: number;
  leachedShare: number;
  dispersivity: number;
  layers: LayeredTransportLayer[];
  profiles: {
    times: number[];
    depths: number[];
    /** concentrations[time][depth], kg/m^3 (resident pore-water concentration). */
    concentrations: number[][];
  };
  series: {
    times: number[];
    /** Pore-water concentration at the water table, kg/m^3. */
    waterTable: number[];
    /** Total flux across the water table, kg/m^2/s. */
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
    /** Dissolved plus sorbed mass between the source and the water table, kg. */
    inProfile: number;
    /** Decayed between the source and the water table, kg. */
    decayedInTransit: number;
    deliveredToWaterTable: number;
    /**
     * Finite-volume budget closure, relative (null on the analytic path, where the in-transit
     * decay is the balance remainder).
     */
    closureError: number | null;
  };
  numerics?: {
    cells: number;
    cellSize: number[];
    gridRefinements: number;
    /** Last grid-halving change, relative to the peak. */
    gridChange: number;
    timeStep: number;
    refinements: number;
    /** Last time-step-halving change, relative to the peak. */
    stepChange: number;
    /** Both the time step and the grid met their tolerances. */
    converged: boolean;
  };
  warnings: Warning[];
}

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

function checkLayer(name: string, s: VadsatLayer): void {
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
  pos(`${name}.thickness`, s.thickness);
}

function checkInput(i: LayeredInput): void {
  nonNeg('q', i.q);
  i.above.forEach((l, k) => checkLayer(`above[${k}]`, l));
  checkLayer('source', i.source);
  if (i.below.length === 0) throw new RangeError('at least one layer is needed below the source');
  i.below.forEach((l, k) => checkLayer(`below[${k}]`, l));
  pos('source.length', i.source.length);
  pos('source.width', i.source.width);
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
  const Lu = i.below.reduce((a, l) => a + l.thickness, 0);
  for (const x of i.depths ?? []) {
    nonNeg('profile depth', x);
    if (x > Lu * (1 + 1e-12)) throw new RangeError(`profile depth ${x} is below the water table`);
  }
  // Unit gradient: every layer carries q, so q must stay below every Ks (no clamp here).
  const all = [...i.above, i.source, ...i.below];
  const minKs = Math.min(...all.map((l) => l.Ks));
  if (i.q >= minKs) {
    throw new RangeError(
      `infiltration ${i.q} m/s is at or above the smallest saturated conductivity in the profile (${minKs} m/s); the unit-gradient assumption does not hold`,
    );
  }
}

/** H times the Millington-Quirk Deff of one layer, m^2/s (finite also when H = 0). */
function hDeff(m: UnitGradientMoisture, thetaS: number, c: VadoseChemical): number {
  if (c.H > 0) {
    return c.H * millingtonQuirkDeff({ thetaS, theta: m.theta }, { Da: c.Da, Dw: c.Dw, H: c.H });
  }
  return (c.Dw * Math.pow(m.theta, 10 / 3)) / (thetaS * thetaS);
}

/** Derived, serialisable state of a modern run. */
export function prepareLayered(input: LayeredInput): LayeredModel {
  checkInput(input);
  const hydraulicModel = input.hydraulicModel ?? 'vanGenuchten1980';
  const c = input.chemical;
  const q = input.q;
  const moist = (s: VadsatLayer) => unitGradientMoisture(s, q, hydraulicModel);
  const moisture: LayeredModel['moisture'] = {
    above: input.above.map(moist),
    source: moist(input.source),
    below: input.below.map(moist),
  };

  // Vapour: series resistance over the clean layers and the upper half of the source, path to
  // the middle of the source, so path and coefficient describe the same column.
  const src = input.source;
  const segments = input.above.map((l, k) => ({
    h: l.thickness,
    hd: hDeff(moisture.above[k]!, l.thetaS, c),
  }));
  segments.push({ h: src.thickness / 2, hd: hDeff(moisture.source, src.thetaS, c) });
  const diffusionPath = segments.reduce((a, s) => a + s.h, 0);
  const resistance = segments.some((s) => s.hd === 0)
    ? Infinity
    : segments.reduce((a, s) => a + s.h / s.hd, 0);
  const volatilizationVelocity = 1 / resistance;
  const hDeffSeries = diffusionPath / resistance;

  // Source partitioning, as in the legacy method
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

  // Transport layers below the source: one dispersivity per run
  const waterTableDepth = input.below.reduce((a, l) => a + l.thickness, 0);
  const dispersivity = input.alphaL ?? vadsatDispersivity(waterTableDepth);
  const below = input.below.map((l, k): LayeredTransportLayer => {
    const th = moisture.below[k]!.theta;
    const v = q > 0 ? q / th : 0;
    const dw = (c.Dw * Math.pow(th, 7 / 3)) / (l.thetaS * l.thetaS);
    return {
      thickness: l.thickness,
      theta: th,
      v,
      R: th > 0 ? 1 + (l.rhoB * c.Koc * l.foc) / th : 1,
      D: dispersivity * v + dw,
    };
  });
  const evaluation =
    input.below.length === 1 && !input.numerics?.forceFiniteVolume
      ? 'analytic-c14'
      : 'finite-volume';

  return {
    q,
    hydraulicModel,
    moisture,
    partition,
    deff: c.H > 0 ? hDeffSeries / c.H : null,
    diffusionPath,
    volatilizationVelocity,
    source: { ...sp, gamma },
    area,
    initialSourceMass: m0 * area,
    chemical: c,
    dispersivity,
    waterTableDepth,
    below,
    evaluation,
  };
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

function preRunWarnings(model: LayeredModel): Warning[] {
  const w: Warning[] = [];
  const mgL = (kgm3: number) => (kgm3 * 1000).toPrecision(4);
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
  return w;
}

export function runLayered(input: LayeredInput): LayeredOutput {
  const model = prepareLayered(input);
  const duration = input.duration;
  const Lu = model.waterTableDepth;
  const depths = input.depths
    ? [...input.depths]
    : Array.from({ length: 21 }, (_, k) => (Lu * k) / 20);
  const profileTimes = input.profileTimes ? [...input.profileTimes] : [duration];
  const times = seriesTimes(duration, input.seriesStep ?? MONTH);
  const A = model.area;
  const q = model.q;
  const mu = model.chemical.mu;
  const warnings = preRunWarnings(model);

  // Source series (closed form)
  const st = times.map((t) => sourceState(model.source, t));
  const end = sourceState(model.source, duration);
  const leachedEnd = end.leached * A;

  let waterTable: number[];
  let flux: number[];
  let delivered: number[];
  let concentrations: number[][];
  let inProfile: number;
  let decayedInTransit: number;
  let closureError: number | null = null;
  let c14Eval: C14Evaluation | undefined;
  let numerics: LayeredOutput['numerics'];

  if (!(q > 0)) {
    // nothing leaches, so the column stays clean
    waterTable = times.map(() => 0);
    flux = times.map(() => 0);
    delivered = times.map(() => 0);
    concentrations = profileTimes.map(() => depths.map(() => 0));
    inProfile = 0;
    decayedInTransit = 0;
    if (model.evaluation === 'finite-volume') closureError = 0;
  } else if (model.evaluation === 'analytic-c14') {
    const l = model.below[0]!;
    const p: C13Params = {
      v: l.v,
      D: l.D,
      R: l.R,
      mu,
      gamma: model.source.gamma,
      c0: model.source.cs0,
    };
    c14Eval = c14Evaluation(p);
    waterTable = times.map((t) => c14Concentration(p, Lu, t));
    const J = (t: number) => c14TotalFlux(p, l.theta, Lu, t);
    flux = times.map(J);
    let cum = 0;
    delivered = times.map((t, k) => {
      if (k > 0) {
        const lo = times[k - 1]!;
        cum += integrate(J, lo, t, {
          relTol: 1e-11,
          absTol: 1e-14 * q * p.c0 * (t - lo),
        }).value;
      }
      return cum * A;
    });
    concentrations = profileTimes.map((t) => depths.map((x) => c14Concentration(p, x, t)));
    inProfile =
      duration > 0
        ? integrate((x) => c14Concentration(p, x, duration), 0, Lu, {
            relTol: 1e-11,
            absTol: 1e-14 * p.c0 * Lu,
          }).value *
          l.theta *
          l.R *
          A
        : 0;
    decayedInTransit = leachedEnd - inProfile - delivered[delivered.length - 1]!;
  } else {
    const fv: FvResult = solveLayeredColumn({
      q,
      mu,
      layers: model.below.map((l) => ({ thickness: l.thickness, theta: l.theta, R: l.R, D: l.D })),
      // exact integral of q C_s over [t0, t1]: q cs0 e^(-gamma t0) (1 - e^(-gamma dt)) / gamma
      inflow: (t0, t1) => {
        const g = model.source.gamma;
        const dt = t1 - t0;
        const window = g === 0 ? dt : -Math.expm1(-g * dt) / g;
        return q * model.source.cs0 * Math.exp(-g * t0) * window;
      },
      inletConcentration: (t) => model.source.cs0 * Math.exp(-model.source.gamma * t),
      times,
      depths,
      profileTimes,
      grid: {
        ...(input.numerics?.maxPeclet !== undefined ? { maxPeclet: input.numerics.maxPeclet } : {}),
        ...(input.numerics?.minCellsPerLayer !== undefined
          ? { minCellsPerLayer: input.numerics.minCellsPerLayer }
          : {}),
        ...(input.numerics?.gridTolerance !== undefined
          ? { tolerance: input.numerics.gridTolerance }
          : {}),
        ...(input.numerics?.maxGridRefinements !== undefined
          ? { maxRefinements: input.numerics.maxGridRefinements }
          : {}),
      },
      time: {
        ...(input.numerics?.timeStepTolerance !== undefined
          ? { tolerance: input.numerics.timeStepTolerance }
          : {}),
        ...(input.numerics?.maxRefinements !== undefined
          ? { maxRefinements: input.numerics.maxRefinements }
          : {}),
        ...(input.numerics?.fixedTimeStep !== undefined
          ? { fixedStep: input.numerics.fixedTimeStep }
          : {}),
      },
    });
    waterTable = fv.waterTableConcentration;
    flux = fv.waterTableFlux;
    delivered = fv.outflow.map((m) => m * A);
    concentrations = fv.profiles;
    inProfile = fv.stored[fv.stored.length - 1]! * A;
    decayedInTransit = fv.decayed[fv.decayed.length - 1]! * A;
    closureError = fv.closureError;
    numerics = {
      cells: fv.cells,
      cellSize: fv.dx,
      gridRefinements: fv.gridRefinements,
      gridChange: fv.gridChange,
      timeStep: fv.timeStep,
      refinements: fv.refinements,
      stepChange: fv.stepChange,
      converged: fv.converged && fv.gridConverged,
    };
    if (closureError > MASS_BALANCE_THRESHOLD) {
      warnings.push({
        code: 'vadose.mass-balance',
        message: `The finite-volume mass budget closes to ${closureError.toExponential(2)} relative, worse than ${MASS_BALANCE_THRESHOLD}.`,
      });
    }
    if (!fv.converged || !fv.gridConverged) {
      const what = !fv.converged
        ? `halving the time step still changed the results by ${(fv.stepChange * 100).toPrecision(2)} percent of their peak after ${fv.refinements} halvings`
        : `halving the cells still changed the results by ${(fv.gridChange * 100).toPrecision(2)} percent of their peak after ${fv.gridRefinements} halvings`;
      warnings.push({
        code: 'vadose.numerics-not-converged',
        message: `The finite-volume solution did not settle: ${what}.`,
      });
    }
  }

  const lossRate = q + model.volatilizationVelocity;
  return {
    evaluation: model.evaluation,
    ...(c14Eval ? { c14Evaluation: c14Eval } : {}),
    q,
    moisture: model.moisture,
    partition: model.partition,
    gamma: model.source.gamma,
    diffusionPath: model.diffusionPath,
    deff: model.deff,
    volatilizationVelocity: model.volatilizationVelocity,
    leachedShare: lossRate > 0 ? q / lossRate : 0,
    dispersivity: model.dispersivity,
    layers: model.below,
    profiles: { times: profileTimes, depths, concentrations },
    series: {
      times,
      waterTable,
      flux,
      massRate: flux.map((f) => f * A),
      sourcePoreWater: st.map((s) => s.cs),
      sourceMass: st.map((s) => s.mass * A),
      leached: st.map((s) => s.leached * A),
      volatilized: st.map((s) => s.volatilized * A),
      sourceDecayed: st.map((s) => s.decayed * A),
      delivered,
    },
    budget: {
      time: duration,
      initialSourceMass: model.initialSourceMass,
      sourceMass: end.mass * A,
      leached: leachedEnd,
      volatilized: end.volatilized * A,
      sourceDecayed: end.decayed * A,
      inProfile,
      decayedInTransit,
      deliveredToWaterTable: delivered[delivered.length - 1] ?? 0,
      closureError,
    },
    ...(numerics ? { numerics } : {}),
    warnings,
  };
}

export const vadoseLayered: MethodDescriptor<LayeredInput, LayeredOutput> = {
  id: 'vadose.layered',
  process: 'vadose',
  kind: 'modern',
  name: 'Layered unsaturated profile with a flux-type inlet',
  summary:
    'The depleting compartmental source of the legacy method over any number of layers above and below it, Mualem-van Genuchten moisture from the entered n, a vapour path that runs through the upper half of the source, and one-dimensional transport with a mass-consistent flux-type inlet: analytic (van Genuchten and Alves case C14) for one layer below the source, finite volumes for several.',
  citations: [
    'unlu1992',
    'vangenuchten1982',
    'vangenuchten1980',
    'mualem1976',
    'brookscorey1964',
    'lenhard1989',
    'millingtonquirk1961',
    'epa1996ssg',
    'gelhar1985',
  ],
  assumptions: [
    'Steady unit-gradient flow with uniform moisture in each layer; infiltration below every Ks in the profile.',
    'No NAPL migration; the vertical extent of the source is known and the soil below it starts clean.',
    'The source pore-water concentration is proportional to the mass left, so the source depletes exponentially; with a separate phase the TPH mass is held constant.',
    'Vapour diffusion from the middle of the source to the ground surface is pseudo-steady with zero concentration at the surface.',
    'Decay acts on the dissolved phase below the source only; vapour concentrations below the surface are not computed.',
    'Fixed water table; flux-type inlet equal to the leaching loss at the base of the source; the water-table flux is the total flux of a column that continues below the water table (semi-infinite convention).',
    'One longitudinal dispersivity per run, plus pore-water molecular diffusion.',
  ],
  validate: (input) => preRunWarnings(prepareLayered(input)),
  uncertainInputs: layeredUncertainInputs<LayeredInput>(),
  run: runLayered,
};
