import { produceFromBoundary, type ProduceBoundary, type ProduceIntakes } from './produce.js';
import {
  DAYS_PER_YEAR,
  LIFETIME_YEARS,
  PATHWAY_IDS,
  cm2ToM2,
  daysPerYearToFraction,
  hoursPerDayToFraction,
  hoursToSeconds,
  lPerDayToM3PerS,
  lPerHourToM3PerS,
  mgPerCm2ToKgPerM2,
  mgPerDayToKgPerS,
  yearsToSeconds,
  type PathwayId,
} from './units.js';

/**
 * Life stages and receptors of the modern method (`exposure.rags-e-f-2014`). A receptor is a list of
 * life stages with their own exposure factors; for a mutagen the stages are the ADAF age segments of
 * `epa2005adaf` (10 before the second birthday, 3 from 2 to before 16, 1 after).
 */

/** Age-dependent adjustment factors by segment: 0-2, 2-6, 6-16, 16-26 yr. */
export const ADAF_SEGMENTS = [10, 3, 3, 1] as const;

/** One life stage, SI. Factors a pathway does not use may be absent. */
export interface LifeStage {
  id: string;
  /**
   * Noncancer group: stages of one group share exposure factors, and each group has its own hazard
   * quotient. Hazard quotients of different groups are never added.
   */
  group: string;
  /** Body weight, kg. */
  bw: number;
  /** Duration of the stage, s. */
  ed: number;
  /** Age-dependent adjustment factor for a mutagen (1 otherwise). */
  adaf: number;
  /** Exposure frequency, fraction of the 365-day year. */
  ef: number;
  /** Per-pathway frequency (swimming, bathing). */
  efByPathway?: Partial<Record<PathwayId, number>>;
  /** Per-pathway exposure time of the air pathways, fraction of the day. */
  etByPathway?: Partial<Record<PathwayId, number>>;
  /** Soil ingestion rate, kg/s (daily rate averaged over the day). */
  soilIngestionRate?: number;
  /** Skin area exposed to soil, m^2. */
  soilSkinArea?: number;
  /** Soil-to-skin adherence, kg/m^2 per event. */
  soilAdherence?: number;
  /** Soil dermal events per day; defaults to 1. */
  soilEventsPerDay?: number;
  /** Drinking-water ingestion rate, m^3/s (daily rate averaged over the day). */
  waterIngestionRate?: number;
  /** Skin area exposed while bathing, m^2. */
  waterSkinArea?: number;
  /** Bathing event time, s. */
  bathingEventTime?: number;
  /** Bathing events per day; defaults to 1. */
  bathingEventsPerDay?: number;
  /** Surface-water ingestion rate while in the water, m^3/s. */
  swimIngestionRate?: number;
  /** Skin area exposed to surface water, m^2. */
  swimSkinArea?: number;
  /** Swimming event time, s. */
  swimEventTime?: number;
  /** Swimming events per day; defaults to 1. */
  swimEventsPerDay?: number;
  /** Homegrown produce intake per class (the `produce` pathway). */
  produce?: ProduceIntakes;
}

export interface ModernReceptor {
  label: string;
  /** Lifetime for cancer averaging, s. */
  lifetime: number;
  /** Stages for a chemical that is not a mutagen; their groups define the hazard quotients. */
  stages: LifeStage[];
  /** Stages for a mutagen (ADAF segments); the non-mutagen stages are used when absent. */
  mutagenStages?: LifeStage[];
  /**
   * Bathing event time of the cancer dermal-water dose, s: one time-weighted value for all stages, as the
   * RSL tables use. When absent, the ED-weighted mean of the stages' own times is used.
   */
  cancerBathingEventTime?: number;
}

/** Life stage in boundary units (RSL style). */
export interface LifeStageBoundary {
  id: string;
  group: string;
  bwKg: number;
  edYr: number;
  /** Defaults to 1. */
  adaf?: number;
  efDaysPerYr: number;
  efDaysPerYrByPathway?: Partial<Record<PathwayId, number>>;
  /** Per-pathway exposure time of the air pathways, h/d. */
  etHoursPerDay?: Partial<Record<PathwayId, number>>;
  soilIngestionMgPerDay?: number;
  soilSkinAreaCm2?: number;
  soilAdherenceMgPerCm2?: number;
  soilEventsPerDay?: number;
  waterIngestionLPerDay?: number;
  waterSkinAreaCm2?: number;
  bathingTimeHr?: number;
  bathingEventsPerDay?: number;
  /** Surface-water ingestion rate, L/h in the water. */
  swimIngestionLPerHour?: number;
  swimSkinAreaCm2?: number;
  swimTimeHr?: number;
  /** Homegrown produce intake per class, boundary units. */
  produce?: ProduceBoundary;
  swimEventsPerDay?: number;
}

export interface ModernReceptorBoundary {
  label: string;
  /** Lifetime for cancer averaging, yr; defaults to 70. */
  lifetimeYr?: number;
  stages: readonly LifeStageBoundary[];
  mutagenStages?: readonly LifeStageBoundary[];
  /** Time-weighted bathing event time for the cancer dermal-water dose, h/event (RSL: 0.6708 h). */
  cancerBathingTimeHr?: number;
}

function nonNegative(name: string, v: number | undefined): void {
  if (v === undefined) return;
  if (!Number.isFinite(v) || v < 0) throw new RangeError(`${name} must be finite and not negative`);
}

function bounded(
  name: string,
  v: number | undefined,
  max: number,
  scale: (x: number) => number,
): number | undefined {
  if (v === undefined) return undefined;
  nonNegative(name, v);
  if (v > max) throw new RangeError(`${name} must not exceed ${max}`);
  return scale(v);
}

function scaled(name: string, v: number | undefined, f: (x: number) => number): number | undefined {
  if (v === undefined) return undefined;
  nonNegative(name, v);
  return f(v);
}

/** Converts a boundary life stage to SI, checking the ranges. */
export function lifeStage(b: LifeStageBoundary): LifeStage {
  for (const [name, v] of [
    ['bwKg', b.bwKg],
    ['edYr', b.edYr],
    ['adaf', b.adaf ?? 1],
  ] as const) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new RangeError(`${b.id}: ${name} must be finite and positive`);
    }
  }
  const ef = bounded('efDaysPerYr', b.efDaysPerYr, DAYS_PER_YEAR, daysPerYearToFraction);
  if (ef === undefined) throw new RangeError(`${b.id}: efDaysPerYr is required`);

  const out: LifeStage = {
    id: b.id,
    group: b.group,
    bw: b.bwKg,
    ed: yearsToSeconds(b.edYr),
    adaf: b.adaf ?? 1,
    ef,
  };
  const efByPathway: Partial<Record<PathwayId, number>> = {};
  const etByPathway: Partial<Record<PathwayId, number>> = {};
  for (const id of PATHWAY_IDS) {
    const f = bounded(
      `${b.id}: efDaysPerYrByPathway.${id}`,
      b.efDaysPerYrByPathway?.[id],
      DAYS_PER_YEAR,
      daysPerYearToFraction,
    );
    if (f !== undefined) efByPathway[id] = f;
    const t = bounded(
      `${b.id}: etHoursPerDay.${id}`,
      b.etHoursPerDay?.[id],
      24,
      hoursPerDayToFraction,
    );
    if (t !== undefined) etByPathway[id] = t;
  }
  out.efByPathway = efByPathway;
  out.etByPathway = etByPathway;

  const set = <K extends keyof LifeStage>(k: K, v: LifeStage[K] | undefined): void => {
    if (v !== undefined) out[k] = v as LifeStage[K];
  };
  const tag = (n: string): string => `${b.id}: ${n}`;
  set(
    'soilIngestionRate',
    scaled(tag('soilIngestionMgPerDay'), b.soilIngestionMgPerDay, mgPerDayToKgPerS),
  );
  set('soilSkinArea', scaled(tag('soilSkinAreaCm2'), b.soilSkinAreaCm2, cm2ToM2));
  set(
    'soilAdherence',
    scaled(tag('soilAdherenceMgPerCm2'), b.soilAdherenceMgPerCm2, mgPerCm2ToKgPerM2),
  );
  set(
    'soilEventsPerDay',
    scaled(tag('soilEventsPerDay'), b.soilEventsPerDay, (x) => x),
  );
  set(
    'waterIngestionRate',
    scaled(tag('waterIngestionLPerDay'), b.waterIngestionLPerDay, lPerDayToM3PerS),
  );
  set('waterSkinArea', scaled(tag('waterSkinAreaCm2'), b.waterSkinAreaCm2, cm2ToM2));
  set('bathingEventTime', scaled(tag('bathingTimeHr'), b.bathingTimeHr, hoursToSeconds));
  set(
    'bathingEventsPerDay',
    scaled(tag('bathingEventsPerDay'), b.bathingEventsPerDay, (x) => x),
  );
  set(
    'swimIngestionRate',
    scaled(tag('swimIngestionLPerHour'), b.swimIngestionLPerHour, lPerHourToM3PerS),
  );
  set('swimSkinArea', scaled(tag('swimSkinAreaCm2'), b.swimSkinAreaCm2, cm2ToM2));
  set('swimEventTime', scaled(tag('swimTimeHr'), b.swimTimeHr, hoursToSeconds));
  if (b.produce !== undefined) set('produce', produceFromBoundary(`${b.id}: `, b.produce));
  set(
    'swimEventsPerDay',
    scaled(tag('swimEventsPerDay'), b.swimEventsPerDay, (x) => x),
  );
  return out;
}

/** Converts a boundary receptor to SI, checking that the stages fit within the lifetime. */
export function modernReceptorFromBoundary(b: ModernReceptorBoundary): ModernReceptor {
  const lifetimeYr = b.lifetimeYr ?? LIFETIME_YEARS;
  if (!Number.isFinite(lifetimeYr) || lifetimeYr <= 0) {
    throw new RangeError('lifetimeYr must be finite and positive');
  }
  if (b.stages.length === 0) throw new RangeError('a receptor needs at least one life stage');
  const stages = b.stages.map(lifeStage);
  const mutagenStages = b.mutagenStages?.map(lifeStage);
  if (mutagenStages !== undefined && mutagenStages.length === 0) {
    throw new RangeError('mutagenStages must not be empty when given');
  }
  for (const list of [stages, mutagenStages ?? []]) {
    const total = list.reduce((s, x) => s + x.ed, 0);
    if (total > yearsToSeconds(lifetimeYr) * (1 + 1e-12)) {
      throw new RangeError('the life stages together must not exceed the lifetime');
    }
  }
  const out: ModernReceptor = { label: b.label, lifetime: yearsToSeconds(lifetimeYr), stages };
  if (mutagenStages !== undefined) out.mutagenStages = mutagenStages;
  if (b.cancerBathingTimeHr !== undefined) {
    if (!Number.isFinite(b.cancerBathingTimeHr) || b.cancerBathingTimeHr < 0) {
      throw new RangeError('cancerBathingTimeHr must be finite and not negative');
    }
    out.cancerBathingEventTime = hoursToSeconds(b.cancerBathingTimeHr);
  }
  return out;
}

/**
 * The ED-weighted mean of the event times of the stages, s (0.6708 h for the resident's bathing time).
 * `time` picks the event time of a stage, the bathing time by default.
 */
export function timeWeightedBathingTime(
  stages: readonly LifeStage[],
  time: (s: LifeStage) => number | undefined = (s) => s.bathingEventTime,
): number | undefined {
  let num = 0;
  let den = 0;
  for (const s of stages) {
    const t = time(s);
    if (t === undefined) return undefined;
    num += s.ed * t;
    den += s.ed;
  }
  return den > 0 ? num / den : undefined;
}

/**
 * True when the receptor already covers both a child and an adult: its stages (or mutagen age
 * segments) fall into more than one noncancer group. A child alone split into two mutagen segments
 * (0-2, 2-6) is one group and is not age-segmented.
 */
export const isAgeSegmented = (r: ModernReceptor): boolean =>
  new Set([...r.stages, ...(r.mutagenStages ?? [])].map((s) => s.group)).size > 1;
