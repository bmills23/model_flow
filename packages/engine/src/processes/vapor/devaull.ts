import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { brent } from '../../numerics/roots.js';
import { layerDeff, type ProfilePoint, type SoilLayer, type VaporChemical } from './legacyJe.js';
import { sourceVapor, type SourceVaporInput } from './source.js';
import { checkNonNeg, checkPos } from './units.js';
import { devaullUncertainInputs } from './uncertain.js';

/**
 * Indoor vapor intrusion with oxygen-limited aerobic biodegradation (DeVaull 2007, in the form its
 * author documents in the BioVapor manual, Appendix B). One homogeneous soil column of thickness L_T
 * between the source and the base of the foundation is split into a deeper anaerobic layer L_b (no
 * degradation) and a shallower aerobic layer L_a in which the chemical degrades at a first-order
 * water-phase rate, so the loss per soil volume is kappa C_v with kappa = k_w theta_w / H. SI throughout;
 * fluxes are positive upward and per unit foundation area.
 */

/** Baseline soil respiration, kg O2 per kg organic carbon per second (1.69 mg O2 per g organic carbon per day). */
export const DEVAULL_BASELINE_RESPIRATION = 1.69e-3 / 86400;

/** Zero-order baseline respiration per soil volume, kg O2 / (m^3 s): default rate x f_oc x bulk density. */
export function baselineRespirationRate(p: {
  foc: number;
  bulkDensity: number;
  rate?: number;
}): number {
  checkNonNeg('foc', p.foc);
  checkPos('bulkDensity', p.bulkDensity);
  return (p.rate ?? DEVAULL_BASELINE_RESPIRATION) * p.foc * p.bulkDensity;
}

/** Mass transfer coefficient of a cracked slab by diffusion, h = D_crack eta / L_crack, m/s. */
export function crackTransferCoefficient(p: {
  crackFraction: number;
  thickness: number;
  Dcrack: number;
}): number {
  checkPos('crackFraction', p.crackFraction);
  checkPos('thickness', p.thickness);
  checkPos('Dcrack', p.Dcrack);
  return (p.Dcrack * p.crackFraction) / p.thickness;
}

export interface DevaullFoundation {
  /** Mass transfer coefficient across the foundation, m/s (Infinity for a dirt floor). */
  h: number;
  /** Soil gas flow into the building per unit foundation area (Q_soil / A_B), m/s; default 0. */
  soilGasVelocity?: number;
}

export interface DevaullBuilding {
  /** Enclosed space mixing height, m. */
  mixingHeight: number;
  /** Air exchange rate, 1/s. */
  airExchangeRate: number;
}

interface OxygenCommon {
  /** Oxygen diffusion coefficient in air and in water, m^2/s, and dimensionless Henry's constant. */
  Da: number;
  Dw: number;
  H: number;
  /** Oxygen concentration in the soil gas at the base of the foundation, kg/m^3. */
  atmosphericConcentration: number;
  /** Mass of oxygen consumed per mass of hydrocarbon degraded. */
  massRatio: number;
  /** Zero-order baseline respiration in the aerobic layer, kg O2 / (m^3 s) (default 0). */
  respiration?: number;
  /**
   * Total hydrocarbon vapor concentration at the source, kg/m^3: every oxygen-consuming hydrocarbon.
   * When omitted the chemical of concern alone sets the demand and a warning is issued.
   */
  totalHydrocarbonVapor?: number;
}

export type DevaullOxygen =
  /** Option 1: the aerobic depth is entered, m. */
  | { mode: 'entered'; aerobicDepth: number }
  /** Option 2: chemical and oxygen meet at a reaction front (explicit depth). */
  | ({ mode: 'fastReaction' } & OxygenCommon)
  /** Option 3: finite rates; the depth at which the oxygen supply just meets the demand. */
  | ({ mode: 'coupled' } & OxygenCommon);

export interface DevaullInput {
  chemical: VaporChemical;
  /** The column between the source and the base of the foundation (thickness = L_T). */
  layer: SoilLayer;
  /** Water-phase first-order rate k_w, 1/s. Omitted means no class rate: non-degrading, warned. */
  degradationRate?: number;
  foundation: DevaullFoundation;
  building: DevaullBuilding;
  source: SourceVaporInput;
  oxygen: DevaullOxygen;
}

export interface DevaullResult {
  /** Indoor air concentration, kg/m^3. */
  concentration: number;
  /** Indoor concentration per unit source vapor concentration. */
  coefficient: number;
  sourceVapor: number;
  /** Aerobic and anaerobic layer thickness, m. */
  aerobicDepth: number;
  anaerobicDepth: number;
  aerobicFraction: number;
  /** a = L_a / L_R, the aerobic layer thickness over the reaction length. */
  a: number;
  /** Vapor concentration at the top of the anaerobic layer and at the base of the foundation, kg/m^3. */
  Ca: number;
  Cb: number;
  /** Flux into the aerobic layer, out of the soil column, kg/(m^2 s). */
  fluxBottomAerobic: number;
  fluxTop: number;
  /** Chemical degraded in the aerobic layer per unit area, kg/(m^2 s). */
  degradationRate: number;
  /** Effective conductance at the top of the column (foundation plus indoor air), m/s. */
  topConductance: number;
  /** Effective diffusion coefficient of the column, m^2/s. */
  Deff: number;
  /** Oxygen detail for options 2 and 3. */
  oxygen?: {
    mode: 'fastReaction' | 'coupled';
    Deff: number;
    demandVapor: number;
    wholly?: 'aerobic' | 'anaerobic';
  };
  profile: ProfilePoint[];
  warnings: Warning[];
}

/** Conductance at the top of the column: foundation then well-mixed indoor air, m/s. */
function topConductance(f: DevaullFoundation, q: number): number {
  const v = f.soilGasVelocity ?? 0;
  checkNonNeg('soilGasVelocity', v);
  if (f.h === Infinity) return q;
  checkPos('foundation h', f.h);
  const xi = v / f.h;
  // Fup = p1 Cb - p2 Cin with p1 = h xi / (1 - e^-xi), p2 = p1 e^-xi (advection and diffusion in the crack)
  const p1 = xi === 0 ? f.h : (f.h * xi) / -Math.expm1(-xi);
  const p2 = p1 * Math.exp(-xi);
  return p1 / (1 + p2 / q);
}

interface ColumnSolution {
  a: number;
  /** Ca / Cs and Cb / Cs. */
  ca: number;
  cb: number;
  /** tanh(a / 2). */
  tanhHalf: number;
  k: number;
}

/**
 * Closed form for the anaerobic layer under the aerobic layer under a conductance G at the top, written
 * with exponentials scaled by e^-a so that it neither overflows nor divides by zero:
 *   Cb/Cs = e^-a / Dn,  Ca/Cs = [ch + sc La G / D] / Dn,
 *   Dn = ch (1 + G Lb / D) + sc La (G / D + kappa Lb / D),
 * with ch = e^-a cosh a and sc = e^-a sinh(a) / a. Lb = 0 and La = 0 are handled without special cases.
 */
function solveColumn(La: number, Lb: number, D: number, kappa: number, G: number): ColumnSolution {
  const k = Math.sqrt(kappa / D);
  const a = k * La;
  const E = Math.exp(-2 * a);
  const em = Math.exp(-a);
  const ch = (1 + E) / 2;
  const sc = a < 1e-4 ? em * (1 + (a * a) / 6) : -Math.expm1(-2 * a) / (2 * a);
  const Dn = ch * (1 + (G * Lb) / D) + (sc * La * (G + kappa * Lb)) / D;
  return {
    a,
    ca: (ch + (sc * La * G) / D) / Dn,
    cb: em / Dn,
    tanhHalf: -Math.expm1(-a) / (1 + em),
    k,
  };
}

const PROFILE_POINTS_AEROBIC = 20;

function oxygenDepth(
  ox: Extract<DevaullOxygen, { mode: 'fastReaction' | 'coupled' }>,
  p: {
    LT: number;
    D: number;
    kappa: number;
    G: number;
    demandVapor: number;
    layer: SoilLayer;
  },
): { La: number; DO: number; wholly?: 'aerobic' | 'anaerobic' } {
  checkPos('oxygen Da', ox.Da);
  checkNonNeg('oxygen Dw', ox.Dw);
  checkPos('oxygen H', ox.H);
  checkNonNeg('atmospheric oxygen', ox.atmosphericConcentration);
  checkPos('oxygen massRatio', ox.massRatio);
  const R = ox.respiration ?? 0;
  checkNonNeg('respiration', R);
  const DO = layerDeff(p.layer, { Da: ox.Da, Dw: ox.Dw, H: ox.H });
  const Oa = ox.atmosphericConcentration;
  const Y = ox.massRatio;
  const LT = p.LT;
  if (Oa === 0) return { La: 0, DO, wholly: 'anaerobic' };

  if (ox.mode === 'fastReaction') {
    // Oxygen from the foundation base diffuses to the front at La, with a zero-order sink R in the
    // aerobic layer: flux at the front D_O Oa / La - R La / 2. Hydrocarbon from the source reaches the
    // front with flux D C / (LT - La). Equal fluxes (scaled by Y) fix La; with R = 0 this is the
    // quadratic La / LT = D_O Oa / (D_O Oa + Y D C), with R > 0 a cubic with one root in [0, Lmax].
    const Lmax = R > 0 ? Math.min(LT, Math.sqrt((2 * DO * Oa) / R)) : LT;
    const f = (La: number): number =>
      (DO * Oa - (R * La * La) / 2) * (LT - La) - Y * p.D * p.demandVapor * La;
    const fMax = f(Lmax);
    if (fMax >= 0) return { La: Lmax, DO, ...(Lmax === LT ? { wholly: 'aerobic' as const } : {}) };
    return { La: brent(f, 0, Lmax, { tol: 1e-14 * LT }).root, DO };
  }

  // Coupled: oxygen obeys D_O O'' = R + Y kappa C(s) in the aerobic layer (s the depth below the
  // foundation) with O(0) = Oa; at the aerobic base La the oxygen is used up and nothing below consumes
  // it, so O(La) = 0 and O'(La) = 0. Integrating twice gives D_O Oa = int_0^La s (R + Y kappa C) ds:
  // the supply meets the first moment of the demand, R La^2 / 2 plus Y kappa times the first moment of
  // the hydrocarbon profile. A point sink at the front gives option 2 exactly.
  const g = (La: number): number => {
    const s = solveColumn(La, LT - La, p.D, p.kappa, p.G);
    const moment = p.D * aerobicMoment(s) * p.demandVapor;
    return DO * Oa - (R * La * La) / 2 - Y * moment;
  };
  if (g(LT) >= 0) return { La: LT, DO, wholly: 'aerobic' };
  return { La: brent(g, 0, LT, { tol: 1e-14 * LT }).root, DO };
}

/**
 * kappa int_0^La s C(s) ds / (D Cs), the first moment (depth below the foundation) of the degradation
 * in the aerobic layer for the hyperbolic profile C(s) = [Cb sinh(k (La - s)) + Ca sinh(k s)] / sinh a:
 * ca (a coth a - 1) + cb (1 - a / sinh a), written with e^-2a so that large a neither overflows nor
 * cancels, and with the series for small a (both brackets are a^2 / 3 and a^2 / 6 to leading order).
 */
function aerobicMoment(s: ColumnSolution): number {
  const a = s.a;
  if (a < 1e-3) {
    const a2 = a * a;
    return s.ca * (a2 / 3 - (a2 * a2) / 45) + s.cb * (a2 / 6 - (7 * a2 * a2) / 360);
  }
  const E = Math.exp(-2 * a);
  const oneMinusE = -Math.expm1(-2 * a);
  const cothTerm = (a * (1 + E)) / oneMinusE - 1;
  const cschTerm = 1 - (2 * a * Math.exp(-a)) / oneMinusE;
  return s.ca * cothTerm + s.cb * cschTerm;
}

export function devaullRun(input: DevaullInput): DevaullResult {
  const chem = input.chemical;
  const warnings: Warning[] = [];
  const src = sourceVapor(input.source);
  warnings.push(...src.warnings);
  const cvs = src.cvs;
  checkPos('mixingHeight', input.building.mixingHeight);
  checkPos('airExchangeRate', input.building.airExchangeRate);
  const q = input.building.mixingHeight * input.building.airExchangeRate;
  const LT = input.layer.thickness;
  const D = layerDeff(input.layer, chem);
  checkPos('Deff', D);
  checkPos('H', chem.H);

  let kw = input.degradationRate;
  if (kw === undefined) {
    kw = 0;
    warnings.push({
      code: 'vapor.no-degradation-rate',
      message:
        'no first-order degradation rate class is available for this chemical, so it is treated as non-degrading (no biodegradation credit)',
    });
  }
  checkNonNeg('degradation rate', kw);
  const kappa = (kw * input.layer.moisture) / chem.H;
  const G = topConductance(input.foundation, q);

  const ox = input.oxygen;
  let La: number;
  let oxygenDetail: DevaullResult['oxygen'];
  if (ox.mode === 'entered') {
    La = ox.aerobicDepth;
    if (!Number.isFinite(La) || La < 0 || La > LT) {
      throw new RangeError(`aerobic depth must be in [0, ${LT}] m, got ${La}`);
    }
  } else {
    let demandVapor = ox.totalHydrocarbonVapor;
    if (demandVapor === undefined) {
      demandVapor = cvs;
      warnings.push({
        code: 'vapor.oxygen-demand-incomplete',
        message:
          'no total hydrocarbon vapor concentration was given, so the oxygen demand counts only the chemical of concern and the aerobic zone is overestimated',
      });
    }
    checkNonNeg('totalHydrocarbonVapor', demandVapor);
    const r = oxygenDepth(ox, { LT, D, kappa, G, demandVapor, layer: input.layer });
    La = r.La;
    oxygenDetail = {
      mode: ox.mode,
      Deff: r.DO,
      demandVapor,
      ...(r.wholly ? { wholly: r.wholly } : {}),
    };
  }
  const Lb = LT - La;
  const sol = solveColumn(La, Lb, D, kappa, G);
  const Cs = cvs;
  const Ca = sol.ca * Cs;
  const Cb = sol.cb * Cs;
  const fluxTop = G * Cb;
  const degradation = D * sol.k * (Ca + Cb) * sol.tanhHalf;
  const fluxBottomAerobic = fluxTop + degradation;

  const profile: ProfilePoint[] = [{ height: 0, concentration: Cs }];
  if (La > 0) {
    if (Lb > 0) profile.push({ height: Lb, concentration: Ca });
    for (let i = 1; i <= PROFILE_POINTS_AEROBIC; i++) {
      const f = i / PROFILE_POINTS_AEROBIC;
      let c: number;
      if (sol.a < 1e-4) {
        c = Ca + (Cb - Ca) * f;
      } else {
        const em = Math.exp(-sol.a);
        const sa = Math.exp(-sol.a * f) * (1 - Math.exp(-2 * sol.a * (1 - f)));
        const sb = Math.exp(-sol.a * (1 - f)) * (1 - Math.exp(-2 * sol.a * f));
        c = (Ca * sa + Cb * sb) / (1 - em * em);
      }
      profile.push({ height: Lb + f * La, concentration: c });
    }
  } else {
    profile.push({ height: LT, concentration: Cb });
  }

  const coefficient = (G / q) * sol.cb;
  return {
    concentration: coefficient * Cs,
    coefficient,
    sourceVapor: Cs,
    aerobicDepth: La,
    anaerobicDepth: Lb,
    aerobicFraction: La / LT,
    a: sol.a,
    Ca,
    Cb,
    fluxBottomAerobic,
    fluxTop,
    degradationRate: degradation,
    topConductance: G,
    Deff: D,
    ...(oxygenDetail ? { oxygen: oxygenDetail } : {}),
    profile,
    warnings,
  };
}

export const vaporDevaull2007: MethodDescriptor<DevaullInput, DevaullResult> = {
  id: 'vapor.devaull-2007',
  process: 'vapor',
  kind: 'modern',
  name: 'Oxygen-limited biodegradation vapor intrusion (DeVaull)',
  summary:
    'One soil column between the source and the foundation split into an anaerobic layer and an aerobic layer where the chemical degrades at a first-order rate, solved in closed form (overflow-safe hyperbolic profile) and coupled to a foundation mass transfer coefficient and the indoor air. The aerobic depth is entered, set by a fast-reaction oxygen balance, or found from the coupled oxygen supply and demand.',
  citations: ['devaull2007', 'api2012biovapor', 'johnsonettinger1991', 'millingtonquirk1961'],
  assumptions: [
    'Steady, one-dimensional transport through one homogeneous layer; infinite source under the whole footprint.',
    'Degradation acts on the dissolved concentration of the aerobic layer only; the anaerobic layer does not degrade.',
    'Oxygen enters by diffusion from a fixed concentration at the base of the foundation; baseline respiration is zero-order.',
    'The total hydrocarbon that sets the oxygen demand moves with the diffusivity and degrades at the rate of the chemical of concern.',
    'With the aerobic depth zero the result equals the Johnson and Ettinger model with the same foundation term.',
  ],
  validate: (input) => devaullRun(input).warnings,
  uncertainInputs: devaullUncertainInputs(),
  run: devaullRun,
};
