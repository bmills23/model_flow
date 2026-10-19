import { DAY_S } from './units.js';

/**
 * Homegrown produce ingestion (the `produce` pathway of M4), SI throughout. For each produce class k
 * (above-ground exposed, above-ground protected, root) the dose rate per unit soil concentration is
 *
 *   sum_k  Bp_k (1 - L_k) IR_k FH_k  [/ BW when IR_k is a rate, not a rate per kg body weight]
 *
 * where Bp_k is the fresh-weight plant factor (kg produce per kg soil, per unit soil concentration,
 * from the plant uptake engines), L_k the preparation loss fraction, IR_k the fresh-weight intake
 * rate and FH_k the fraction of that intake that is homegrown. The contact term is linear in the soil
 * concentration, so the M4 doses and the M5 closed-form inversion treat it as any other soil pathway.
 */
export const PRODUCE_CLASSES = ['abovegroundExposed', 'abovegroundProtected', 'root'] as const;
export type ProduceClass = (typeof PRODUCE_CLASSES)[number];

/** Intake of one produce class. Exactly one of `intakeRate` and `intakeRatePerBw` is given. */
export interface ProduceIntake {
  /** Fresh-weight intake rate, kg/s (daily rate averaged over the day). */
  intakeRate?: number;
  /** Fresh-weight intake rate per kg body weight, kg/(kg s). */
  intakeRatePerBw?: number;
  /** Preparation loss fraction in [0, 1); defaults to 0 (no loss). */
  lossFraction?: number;
  /** Fraction of the intake that is homegrown, [0, 1]. No default. */
  fractionHomegrown: number;
}

export type ProduceIntakes = Partial<Record<ProduceClass, ProduceIntake>>;

/** Fresh-weight plant factors, kg produce per kg soil per unit soil concentration (kg/kg per kg/kg). */
export type ProduceFactors = Partial<Record<ProduceClass, number>>;

/** Boundary form of one class: g/(kg d) or kg/d, loss and homegrown fractions. */
export interface ProduceIntakeBoundary {
  gPerKgDay?: number;
  kgPerDay?: number;
  lossFraction?: number;
  fractionHomegrown: number;
}
export type ProduceBoundary = Partial<Record<ProduceClass, ProduceIntakeBoundary>>;

/** Boundary to SI with range checks (RangeError on nonsense, never a silent fix). */
export function produceFromBoundary(label: string, b: ProduceBoundary): ProduceIntakes {
  const out: ProduceIntakes = {};
  for (const k of PRODUCE_CLASSES) {
    const v = b[k];
    if (v === undefined) continue;
    const tag = `${label}produce.${k}`;
    if ((v.gPerKgDay === undefined) === (v.kgPerDay === undefined)) {
      throw new RangeError(`${tag}: give exactly one of gPerKgDay and kgPerDay`);
    }
    const rate = v.gPerKgDay ?? v.kgPerDay!;
    if (!Number.isFinite(rate) || rate < 0) {
      throw new RangeError(`${tag}: the intake must be finite and not negative`);
    }
    const loss = v.lossFraction ?? 0;
    if (!Number.isFinite(loss) || loss < 0 || loss >= 1) {
      throw new RangeError(`${tag}: lossFraction must be in [0, 1)`);
    }
    if (
      !Number.isFinite(v.fractionHomegrown) ||
      v.fractionHomegrown < 0 ||
      v.fractionHomegrown > 1
    ) {
      throw new RangeError(`${tag}: fractionHomegrown must be in [0, 1]`);
    }
    out[k] = {
      ...(v.gPerKgDay !== undefined
        ? { intakeRatePerBw: (v.gPerKgDay * 1e-3) / DAY_S }
        : { intakeRate: v.kgPerDay! / DAY_S }),
      lossFraction: loss,
      fractionHomegrown: v.fractionHomegrown,
    };
  }
  return out;
}

export function validateProduceFactors(f: ProduceFactors | undefined): void {
  if (f === undefined) return;
  for (const k of PRODUCE_CLASSES) {
    const v = f[k];
    if (v !== undefined && !(Number.isFinite(v) && v >= 0)) {
      throw new RangeError(`produceFactors.${k} must be finite and not negative`);
    }
  }
}

export interface ProduceContact {
  /** Dose rate per unit soil concentration, kg/(kg s) per kg/kg; null with the names of what is missing. */
  perEpc: number | null;
  missing: string[];
}

/**
 * Contact term of the produce pathway. A class with a positive intake needs its plant factor; with no
 * intake given at all the pathway needs `produce`. Missing items are named, the result is never zero.
 */
export function produceContact(
  bw: number,
  intakes: ProduceIntakes | undefined,
  factors: ProduceFactors | undefined,
): ProduceContact {
  const used = PRODUCE_CLASSES.filter((k) => intakes?.[k] !== undefined);
  if (used.length === 0) return { perEpc: null, missing: ['produce'] };
  const missing: string[] = [];
  let sum = 0;
  for (const k of used) {
    const i = intakes![k]!;
    const perBw = i.intakeRatePerBw ?? (i.intakeRate ?? 0) / bw;
    const w = perBw * (1 - (i.lossFraction ?? 0)) * i.fractionHomegrown;
    if (w === 0) continue;
    const f = factors?.[k];
    if (f === undefined) {
      missing.push(`produceFactors.${k}`);
      continue;
    }
    sum += f * w;
  }
  return missing.length > 0 ? { perEpc: null, missing } : { perEpc: sum, missing };
}

/** True for the missing-item names that belong to the chemical rather than the receptor. */
export const isProduceChemicalGap = (name: string): boolean => name.startsWith('produceFactors.');
