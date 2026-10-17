import type { Warning } from '../../registry/index.js';
import { YEAR_SECONDS } from '../saturatedSource/release.js';
import { soilSaturationConcentration } from '../saturatedSource/partitioning.js';
import { finite, fraction, nonNeg, pos } from './checks.js';

/**
 * Soil-to-groundwater leaching level of the EPA Soil Screening Guidance (1996 Technical Background
 * Document, 1996 User's Guide, 2002 Supplemental Guidance). SI inside: kg, m, s; concentrations in
 * kg/m^3 (water) and kg/kg (soil); Kd in m^3/kg.
 */

/** Generic dilution attenuation factors: the guidance default for sources up to 0.5 acre, and none. */
export const GENERIC_DAF = { halfAcre: 20, none: 1 } as const;

/** Infiltration (m/s) and exposure duration (s) of the guidance's mass-limit equation. */
export const SSG_MASS_LIMIT_INFILTRATION = 0.18 / YEAR_SECONDS;
export const SSG_MASS_LIMIT_DURATION = 70 * YEAR_SECONDS;

export interface SsgSoil {
  /** Dry bulk density, kg/m^3. */
  rhoB: number;
  /** Particle density, kg/m^3 (default 2650). */
  rhoS?: number;
  /** Organic carbon fraction (default 0.002). */
  foc?: number;
  /** Water-filled porosity (default 0.3). */
  theta?: number;
  /** Air-filled porosity; default n - theta. Zero when soil gas is lost during sampling. */
  thetaA?: number;
}

export interface ResolvedSsgSoil {
  rhoB: number;
  rhoS: number;
  foc: number;
  theta: number;
  thetaA: number;
  /** Total porosity, 1 - rho_b / rho_s. */
  porosity: number;
}

export function resolveSsgSoil(s: SsgSoil): ResolvedSsgSoil {
  const rhoB = s.rhoB;
  const rhoS = s.rhoS ?? 2650;
  const foc = s.foc ?? 0.002;
  const theta = s.theta ?? 0.3;
  pos('soil.rhoB', rhoB);
  pos('soil.rhoS', rhoS);
  if (!(rhoB < rhoS)) throw new RangeError(`rhoB must be below rhoS, got ${rhoB} and ${rhoS}`);
  fraction('soil.foc', foc);
  fraction('soil.theta', theta);
  const porosity = 1 - rhoB / rhoS;
  fraction('porosity', porosity);
  if (theta > porosity) {
    throw new RangeError(`theta (${theta}) must not exceed the porosity (${porosity})`);
  }
  const thetaA = s.thetaA ?? porosity - theta;
  fraction('soil.thetaA', thetaA);
  return { rhoB, rhoS, foc, theta, thetaA, porosity };
}

export interface PartitionInput {
  soil: SsgSoil;
  /** Soil-water partition coefficient, m^3/kg (metals, PFAS); otherwise koc x foc. */
  kd?: number;
  /** Organic carbon partition coefficient, m^3/kg. */
  koc?: number;
  /** Dimensionless Henry's constant; undefined or null means assumed zero. */
  H?: number | null;
}

function kdOf(p: { kd?: number; koc?: number }, foc: number): number {
  if (p.kd !== undefined) {
    nonNeg('kd', p.kd);
    return p.kd;
  }
  if (p.koc === undefined) throw new RangeError('give kd or koc');
  nonNeg('koc', p.koc);
  return p.koc * foc;
}

/**
 * Partition factor P = Kd + (theta_w + theta_a H') / rho_b, m^3/kg: the soil concentration (kg/kg)
 * per unit leachate concentration (kg/m^3). Inverse of the equilibrium partitioning of M2 and M3.
 */
export function partitionFactor(p: PartitionInput): number {
  const s = resolveSsgSoil(p.soil);
  const H = p.H ?? 0;
  nonNeg('H', H);
  return kdOf(p, s.foc) + (s.theta + s.thetaA * H) / s.rhoB;
}

/** Soil concentration (kg/kg) in equilibrium with leachate concentration cw (kg/m^3). */
export function partitionLevel(cw: number, factor: number): number {
  pos('cw', cw);
  pos('partition factor', factor);
  return cw * factor;
}

export interface DafInput {
  /** Aquifer hydraulic conductivity, m/s. */
  K: number;
  /** Hydraulic gradient, m/m. */
  i: number;
  /** Infiltration, m/s. */
  I: number;
  /** Source length parallel to flow, m. */
  L: number;
  /** Aquifer thickness, m (the mixing depth cap). */
  da: number;
}

export interface Daf {
  daf: number;
  /** Mixing-zone depth used, m (after the cap). */
  mixingDepth: number;
  /** Mixing-zone depth before the cap, m. */
  uncappedDepth: number;
  capped: boolean;
}

function checkDaf(p: DafInput): void {
  pos('aquifer.K', p.K);
  pos('aquifer.i', p.i);
  pos('I', p.I);
  pos('L', p.L);
  pos('da', p.da);
}

/** Mixing-zone depth d = sqrt(0.0112 L^2) + da (1 - exp(-L I / (K i da))), capped at da. */
export function mixingDepth(p: DafInput): { depth: number; uncapped: number; capped: boolean } {
  checkDaf(p);
  const uncapped =
    Math.sqrt(0.0112 * p.L * p.L) + p.da * (1 - Math.exp(-(p.L * p.I) / (p.K * p.i * p.da)));
  const capped = uncapped > p.da;
  return { depth: capped ? p.da : uncapped, uncapped, capped };
}

/** Dilution attenuation factor DAF = 1 + K i d / (I L), with the capped mixing depth. */
export function dilutionAttenuationFactor(p: DafInput): Daf {
  const m = mixingDepth(p);
  return {
    daf: 1 + (p.K * p.i * m.depth) / (p.I * p.L),
    mixingDepth: m.depth,
    uncappedDepth: m.uncapped,
    capped: m.capped,
  };
}

export interface MassLimitInput {
  /** Leachate concentration, kg/m^3. */
  cw: number;
  /** Source depth, m. */
  depth: number;
  rhoB: number;
  /** Infiltration, m/s (default 0.18 m/yr). */
  infiltration?: number;
  /** Exposure duration, s (default 70 yr). */
  duration?: number;
}

/** Mass-limit soil concentration F = Cw I ED / (rho_b d_s), kg/kg. */
export function massLimitLevel(p: MassLimitInput): number {
  pos('cw', p.cw);
  pos('source depth', p.depth);
  pos('rhoB', p.rhoB);
  const I = p.infiltration ?? SSG_MASS_LIMIT_INFILTRATION;
  const ED = p.duration ?? SSG_MASS_LIMIT_DURATION;
  pos('infiltration', I);
  pos('duration', ED);
  return (p.cw * I * ED) / (p.rhoB * p.depth);
}

export interface SsgLeachingInput extends PartitionInput {
  /** 'organic' warns on a blank H'; 'inorganic' takes it as zero silently. */
  kind: 'organic' | 'inorganic';
  /** Target groundwater concentration (MCL, user value or tap water level), kg/m^3. */
  target: number;
  /** A generic DAF (1 or 20, or any value >= 1), or the site-specific equations. */
  daf: number | { site: DafInput };
  /** Source depth for the mass-limit level; omitted means the level is not computed. */
  sourceDepth?: number;
  infiltration?: number;
  duration?: number;
  /** Aqueous solubility, kg/m^3, for the Csat and solubility checks. */
  solubility?: number;
}

export interface SsgLeachingResult {
  cw: number;
  daf: number;
  mixingDepth?: number;
  partitionFactor: number;
  partitionLevel: number;
  massLimitLevel?: number;
  /** Reported level, kg/kg: the higher of the partition and mass-limit levels. */
  level: number;
  governs: 'partition' | 'mass-limit';
  csat?: number;
  warnings: Warning[];
}

export function ssgLeachingLevel(input: SsgLeachingInput): SsgLeachingResult {
  const warnings: Warning[] = [];
  const soil = resolveSsgSoil(input.soil);
  pos('target', input.target);
  let daf: number;
  let depth: number | undefined;
  if (typeof input.daf === 'number') {
    finite('daf', input.daf);
    if (input.daf < 1) throw new RangeError(`DAF must be at least 1, got ${input.daf}`);
    daf = input.daf;
  } else {
    const d = dilutionAttenuationFactor(input.daf.site);
    daf = d.daf;
    depth = d.mixingDepth;
    if (d.capped) {
      warnings.push({
        code: 'cleanup.mixing-depth-capped',
        message: `mixing-zone depth ${d.uncappedDepth} m exceeds the aquifer thickness; set to ${d.mixingDepth} m`,
      });
    }
  }
  if (input.kind === 'organic' && (input.H === undefined || input.H === null)) {
    warnings.push({
      code: 'cleanup.henry-assumed-zero',
      message: "Henry's constant is blank for an organic chemical; taken as zero",
    });
  }
  const cw = input.target * daf;
  const factor = partitionFactor(input);
  const pl = partitionLevel(cw, factor);
  let level = pl;
  let governs: 'partition' | 'mass-limit' = 'partition';
  let ml: number | undefined;
  if (input.sourceDepth !== undefined) {
    ml = massLimitLevel({
      cw,
      depth: input.sourceDepth,
      rhoB: soil.rhoB,
      ...(input.infiltration !== undefined ? { infiltration: input.infiltration } : {}),
      ...(input.duration !== undefined ? { duration: input.duration } : {}),
    });
    if (ml > pl) {
      level = ml;
      governs = 'mass-limit';
      warnings.push({
        code: 'cleanup.mass-limit-governs',
        message: `mass-limit level ${ml} kg/kg exceeds the partition level ${pl} kg/kg and is used`,
      });
    }
  }
  let csat: number | undefined;
  if (input.solubility !== undefined) {
    pos('solubility', input.solubility);
    csat = soilSaturationConcentration({
      S: input.solubility,
      x: 1,
      rhoB: soil.rhoB,
      kd: kdOf(input, soil.foc),
      theta: soil.theta,
      thetaA: soil.thetaA,
      H: input.H ?? 0,
    });
    if (level > csat) {
      warnings.push({
        code: 'cleanup.csat-exceeded',
        message: `level ${level} kg/kg exceeds the soil saturation limit ${csat} kg/kg; NAPL may be present`,
      });
    }
    if (cw > input.solubility) {
      warnings.push({
        code: 'cleanup.leachate-above-solubility',
        message: `leachate concentration ${cw} kg/m^3 exceeds the solubility ${input.solubility} kg/m^3`,
      });
    }
  }
  return {
    cw,
    daf,
    ...(depth !== undefined ? { mixingDepth: depth } : {}),
    partitionFactor: factor,
    partitionLevel: pl,
    ...(ml !== undefined ? { massLimitLevel: ml } : {}),
    level,
    governs,
    ...(csat !== undefined ? { csat } : {}),
    warnings,
  };
}
