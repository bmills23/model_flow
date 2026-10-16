import { massRateFromConcentration } from '../groundwater/kernel.js';
import type { RegionConcentrations } from './partitioning.js';
import type { WaterLevels } from './geometry.js';
import { finite, nonNeg, pos } from './checks.js';

/** One year in seconds (365.25 days), the period of the seasonal water-table schedule. */
export const YEAR_SECONDS = 365.25 * 86400;

export type FluctuationSchedule = 'annual-mean' | 'seasonal';

export interface LevelRates {
  /** Region 1 (infiltration) and region 2 (groundwater) release rates, kg/s. */
  q1: number;
  q2: number;
}

export interface RegionRates {
  low: LevelRates;
  high: LevelRates;
  /** Time-weighted annual mean of the total rate, kg/s. */
  mean: number;
}

export interface RegionRateInput {
  levels: WaterLevels;
  regions: RegionConcentrations;
  length: number;
  width: number;
  fractionHigh: number;
  /** Darcy flux of the aquifer U = K i, m/s. */
  darcyFlux: number;
}

/**
 * Release rate of each region at low and high water: Q1 = q A C1 where an unsaturated part exists,
 * Q2 = U W h C2 (the M1 mass-rate-from-concentration product).
 */
export function regionRates(p: RegionRateInput): RegionRates {
  pos('length', p.length);
  pos('width', p.width);
  nonNeg('darcyFlux', p.darcyFlux);
  finite('fractionHigh', p.fractionHigh);
  if (p.fractionHigh < 0 || p.fractionHigh > 1) {
    throw new RangeError(`fractionHigh must be in [0, 1], got ${p.fractionHigh}`);
  }
  const { unsaturated, saturated, infiltration } = p.regions;
  const at = (h: number, unsat: number): LevelRates => ({
    q1:
      unsaturated !== null && unsat > 0
        ? massRateFromConcentration(unsaturated.c, infiltration, p.length * p.width)
        : 0,
    q2:
      saturated !== null && h > 0
        ? massRateFromConcentration(saturated.c, p.darcyFlux, p.width * h)
        : 0,
  });
  const low = at(p.levels.hLo, p.levels.unsatLo);
  const high = at(p.levels.hHi, p.levels.unsatHi);
  const mean = (1 - p.fractionHigh) * (low.q1 + low.q2) + p.fractionHigh * (high.q1 + high.q2);
  return { low, high, mean };
}

/** A part of the repeating cycle: duration (s), release rate at that water level (kg/s). */
interface Part {
  level: 'high' | 'low' | 'mean';
  len: number;
  q: number;
  /** Modern only: first-order constant q / M0 + lambda_s, 1/s. */
  k: number;
}

export interface ScheduleSegment {
  start: number;
  end: number;
  level: 'high' | 'low' | 'mean';
  /** Initial release rate at this water level, kg/s (the modern rate scales with the mass left). */
  rate: number;
}

export interface ReleaseSchedule {
  /** 0: constant rate until exhausted (legacy); 1: rate proportional to the mass left (modern). */
  exponent: 0 | 1;
  kind: FluctuationSchedule;
  initialMass: number;
  /** Time-weighted annual mean release rate at the full mass, kg/s. */
  meanRate: number;
  /** Optional first-order source decay (modern), 1/s. */
  sourceDecayRate: number;
  /** Time the legacy source is exhausted, s (Infinity when nothing is released or for the modern one). */
  depletionTime: number;
  /** Cumulative mass delivered to the aquifer by t, kg. */
  delivered(t: number): number;
  /** Cumulative mass lost to source decay by t, kg (0 unless the modern method has decay). */
  decayed(t: number): number;
  /** Mass left in the source at t, kg. */
  remaining(t: number): number;
  /** Instantaneous release rate at t, kg/s. */
  rate(t: number): number;
  /** C / C0 = (m / M0)^exponent: the Falta et al. source-strength ratio. */
  concentrationRatio(t: number): number;
  /** Natural constant-rate segments up to min(tEnd, depletion time), generated lazily. */
  segments(tEnd: number): Generator<ScheduleSegment>;
}

export interface ScheduleInput {
  exponent: 0 | 1;
  kind: FluctuationSchedule;
  initialMass: number;
  low: LevelRates;
  high: LevelRates;
  fractionHigh: number;
  sourceDecayRate?: number;
}

function w(k: number, tau: number): number {
  // (1 - exp(-k tau)) / k without cancellation; tau when k = 0
  return k === 0 ? tau : -Math.expm1(-k * tau) / k;
}

function checkT(t: number): void {
  if (!Number.isFinite(t) || t < 0) throw new RangeError(`t must be finite and >= 0, got ${t}`);
}

/** Closed-form release schedule for both exponents and both fluctuation schedules. */
export function makeReleaseSchedule(p: ScheduleInput): ReleaseSchedule {
  nonNeg('initialMass', p.initialMass);
  const f = p.fractionHigh;
  const lam = p.sourceDecayRate ?? 0;
  nonNeg('sourceDecayRate', lam);
  const M0 = p.initialMass;
  const qLow = p.low.q1 + p.low.q2;
  const qHigh = p.high.q1 + p.high.q2;
  const qMean = (1 - f) * qLow + f * qHigh;
  const kOf = (q: number): number => (M0 > 0 ? q / M0 : 0) + lam;

  const cyclic = p.kind === 'seasonal';
  const period = cyclic ? YEAR_SECONDS : Infinity;
  const parts: Part[] = cyclic
    ? [
        { level: 'high' as const, len: f * YEAR_SECONDS, q: qHigh, k: kOf(qHigh) },
        { level: 'low' as const, len: (1 - f) * YEAR_SECONDS, q: qLow, k: kOf(qLow) },
      ].filter((x) => x.len > 0)
    : [{ level: 'mean' as const, len: Infinity, q: qMean, k: kOf(qMean) }];

  // ---- legacy (exponent 0) ----
  const cycleMass = cyclic ? parts.reduce((s, x) => s + x.q * x.len, 0) : Infinity;

  function legacyCumulative(t: number): number {
    const n = cyclic ? Math.floor(t / period) : 0;
    let rem = Math.max(0, t - (cyclic ? n * period : 0));
    let sum = cyclic ? n * cycleMass : 0;
    for (const x of parts) {
      const tau = Math.min(x.len, rem);
      sum += x.q * tau;
      rem -= tau;
      if (rem <= 0) break;
    }
    return sum;
  }

  function legacyDepletionTime(): number {
    if (!(M0 > 0)) return Infinity;
    if (!cyclic) return qMean > 0 ? M0 / qMean : Infinity;
    if (!(cycleMass > 0)) return Infinity;
    const n = Math.floor(M0 / cycleMass);
    let rem = Math.max(0, M0 - n * cycleMass);
    let t = n * period;
    for (const x of parts) {
      const m = x.q * x.len;
      if (x.q > 0 && rem <= m) return t + rem / x.q;
      rem -= m;
      t += x.len;
    }
    return t;
  }

  // ---- modern (exponent 1) ----
  /** Integrals of m/M0 over t, per part kind, and the mass fraction left. */
  function modernState(t: number): { jSum: number; delivered: number; phi: number } {
    let n = 0;
    let rem = t;
    if (cyclic) {
      n = Math.floor(t / period);
      rem = Math.max(0, t - n * period);
    }
    let delivered = 0;
    let jSum = 0;
    let phi = 1;
    if (n > 0) {
      const gamma = parts.reduce((s, x) => s + x.k * x.len, 0);
      const g = gamma === 0 ? n : Math.expm1(-gamma * n) / Math.expm1(-gamma);
      let pre = 0;
      for (const x of parts) {
        const a = Math.exp(-pre) * w(x.k, x.len);
        delivered += x.q * g * a;
        jSum += g * a;
        pre += x.k * x.len;
      }
      phi = Math.exp(-gamma * n);
    }
    for (const x of parts) {
      if (rem <= 0) break;
      const tau = Math.min(x.len, rem);
      const j = phi * w(x.k, tau);
      delivered += x.q * j;
      jSum += j;
      phi *= Math.exp(-x.k * tau);
      rem -= tau;
    }
    return { jSum, delivered, phi };
  }

  const depletionTime = p.exponent === 0 ? legacyDepletionTime() : Infinity;

  function partAt(t: number): Part {
    const within = cyclic ? t - Math.floor(t / period) * period : t;
    let acc = 0;
    for (const x of parts) {
      acc += x.len;
      if (within < acc) return x;
    }
    return parts[parts.length - 1]!;
  }

  const schedule: ReleaseSchedule = {
    exponent: p.exponent,
    kind: p.kind,
    initialMass: M0,
    meanRate: qMean,
    sourceDecayRate: lam,
    depletionTime,
    delivered(t) {
      checkT(t);
      if (M0 === 0) return 0;
      if (p.exponent === 0) return Math.min(M0, legacyCumulative(t));
      return modernState(t).delivered;
    },
    decayed(t) {
      checkT(t);
      if (p.exponent === 0 || lam === 0 || M0 === 0) return 0;
      return lam * M0 * modernState(t).jSum;
    },
    remaining(t) {
      checkT(t);
      if (M0 === 0) return 0;
      if (p.exponent === 0) return Math.max(0, M0 - Math.min(M0, legacyCumulative(t)));
      return M0 * modernState(t).phi;
    },
    rate(t) {
      checkT(t);
      if (M0 === 0) return 0;
      if (p.exponent === 0) return t < depletionTime ? partAt(t).q : 0;
      return partAt(t).q * modernState(t).phi;
    },
    concentrationRatio(t) {
      checkT(t);
      if (p.exponent === 0) return t < depletionTime ? 1 : 0;
      return M0 === 0 ? 0 : modernState(t).phi;
    },
    *segments(tEnd) {
      checkT(tEnd);
      const limit = p.exponent === 0 ? Math.min(tEnd, depletionTime) : tEnd;
      if (!(limit > 0)) return;
      if (!cyclic) {
        yield { start: 0, end: limit, level: 'mean', rate: qMean };
        return;
      }
      for (let y = 0; y * period < limit; y++) {
        const base = y * period;
        let offset = 0;
        for (let j = 0; j < parts.length; j++) {
          const x = parts[j]!;
          const start = j === 0 ? base : base + offset;
          offset += x.len;
          const natural = j === parts.length - 1 ? (y + 1) * period : base + offset;
          const end = Math.min(limit, natural);
          if (end > start) yield { start, end, level: x.level, rate: x.q };
          if (natural >= limit) return;
        }
      }
    },
  };
  return schedule;
}
