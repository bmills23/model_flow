import type { Warning } from '../../registry/index.js';
import {
  legacyPathway,
  type LegacyCell,
  type LegacyChemical,
  type LegacyEpc,
  type LegacyReceptor,
} from './legacy.js';
import { isProduceChemicalGap, produceFromBoundary, type ProduceBoundary } from './produce.js';
import {
  DAYS_PER_YEAR,
  LIFETIME_YEARS,
  PATHWAYS,
  PATHWAY_IDS,
  cm2ToM2,
  daysPerYearToFraction,
  hoursPerDayToFraction,
  lPerDayToM3PerS,
  m3PerHourToM3PerS,
  mgPerCm2ToKgPerM2,
  mgPerDayToKgPerS,
  mlPerHourToM3PerS,
  yearsToSeconds,
  type PathwayId,
} from './units.js';

/** Receptor exposure factors in RISC-style boundary units. */
export interface LegacyReceptorBoundary {
  bwKg: number;
  /** Lifetime for cancer averaging, yr; defaults to 70. */
  lifetimeYr?: number;
  edYr: number;
  /** Default exposure frequency, d/yr. */
  efDaysPerYr: number;
  /** Per-pathway frequency, d/yr, overriding the default (swimming, for example). */
  efDaysPerYrByPathway?: Partial<Record<PathwayId, number>>;
  /** Per-pathway exposure time, h/d. */
  etHoursPerDay?: Partial<Record<PathwayId, number>>;
  soilIngestionMgPerDay?: number;
  soilSkinAreaCm2?: number;
  soilAdherenceMgPerCm2?: number;
  waterIngestionLPerDay?: number;
  waterSkinAreaCm2?: number;
  /** Breathing rate while exposed, m^3/h. */
  inhalationM3PerHour?: number;
  swimIngestionMlPerHour?: number;
  swimSkinAreaCm2?: number;
  /** Homegrown produce intake per class, boundary units. */
  produce?: ProduceBoundary;
}

function finiteNonNegative(name: string, v: number | undefined): void {
  if (v === undefined) return;
  if (!Number.isFinite(v) || v < 0) throw new RangeError(`${name} must be finite and not negative`);
}

function fractionOf(
  name: string,
  v: number | undefined,
  max: number,
  scale: (x: number) => number,
) {
  if (v === undefined) return undefined;
  finiteNonNegative(name, v);
  if (v > max) throw new RangeError(`${name} must not exceed ${max}`);
  return scale(v);
}

/** Converts boundary units to the SI receptor of the legacy kernels, checking the ranges. */
export function legacyReceptor(b: LegacyReceptorBoundary): LegacyReceptor {
  const lifetimeYr = b.lifetimeYr ?? LIFETIME_YEARS;
  for (const [name, v] of [
    ['bwKg', b.bwKg],
    ['edYr', b.edYr],
    ['lifetimeYr', lifetimeYr],
  ] as const) {
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} must be finite and positive`);
  }
  if (b.edYr > lifetimeYr) throw new RangeError('edYr must not exceed lifetimeYr');
  const ef = fractionOf('efDaysPerYr', b.efDaysPerYr, DAYS_PER_YEAR, daysPerYearToFraction);
  if (ef === undefined) throw new RangeError('efDaysPerYr is required');

  const efByPathway: Partial<Record<PathwayId, number>> = {};
  const etByPathway: Partial<Record<PathwayId, number>> = {};
  for (const id of PATHWAY_IDS) {
    const f = fractionOf(
      `efDaysPerYrByPathway.${id}`,
      b.efDaysPerYrByPathway?.[id],
      DAYS_PER_YEAR,
      daysPerYearToFraction,
    );
    if (f !== undefined) efByPathway[id] = f;
    const t = fractionOf(`etHoursPerDay.${id}`, b.etHoursPerDay?.[id], 24, hoursPerDayToFraction);
    if (t !== undefined) etByPathway[id] = t;
  }

  const rate = (name: string, v: number | undefined, f: (x: number) => number) => {
    finiteNonNegative(name, v);
    return v === undefined ? undefined : f(v);
  };
  const out: LegacyReceptor = {
    bw: b.bwKg,
    ed: yearsToSeconds(b.edYr),
    lifetime: yearsToSeconds(lifetimeYr),
    ef,
    efByPathway,
    etByPathway,
  };
  const set = <K extends keyof LegacyReceptor>(k: K, v: LegacyReceptor[K]): void => {
    if (v !== undefined) out[k] = v;
  };
  set(
    'soilIngestionRate',
    rate('soilIngestionMgPerDay', b.soilIngestionMgPerDay, mgPerDayToKgPerS),
  );
  set('soilSkinArea', rate('soilSkinAreaCm2', b.soilSkinAreaCm2, cm2ToM2));
  set('soilAdherence', rate('soilAdherenceMgPerCm2', b.soilAdherenceMgPerCm2, mgPerCm2ToKgPerM2));
  set(
    'waterIngestionRate',
    rate('waterIngestionLPerDay', b.waterIngestionLPerDay, lPerDayToM3PerS),
  );
  set('waterSkinArea', rate('waterSkinAreaCm2', b.waterSkinAreaCm2, cm2ToM2));
  set('inhalationRate', rate('inhalationM3PerHour', b.inhalationM3PerHour, m3PerHourToM3PerS));
  set(
    'swimIngestionRate',
    rate('swimIngestionMlPerHour', b.swimIngestionMlPerHour, mlPerHourToM3PerS),
  );
  set('swimSkinArea', rate('swimSkinAreaCm2', b.swimSkinAreaCm2, cm2ToM2));
  if (b.produce !== undefined) out.produce = produceFromBoundary('', b.produce);
  return out;
}

export type LegacyPresetId = 'residentAdult' | 'residentAdultOnly' | 'residentChild' | 'worker';

/**
 * Legacy receptor presets from EPA's 1991 standard default exposure factors (`epa1991sdef`) and the
 * RAGS Part A chapter 6 exhibits (`rags1989`), not from RISC5's receptor database. Entries the sources
 * give as pathway-specific are absent and must be entered: bathing and swimming exposure time and
 * frequency, soil skin area and adherence, outdoor air time, and for the child the drinking-water and
 * inhalation rates. Provenance of each value is in `docs/methods/exposure-and-risk.md`.
 *
 * Skin areas for water are the exhibit 6-13 total-body 50th percentile for males (adult 1.94 m^2, age
 * class 3 to under 6 years 0.728 m^2); a female value is a user entry.
 */
export const LEGACY_PRESETS: Readonly<Record<LegacyPresetId, Readonly<LegacyReceptorBoundary>>> = {
  residentAdult: {
    bwKg: 70,
    efDaysPerYr: 350,
    edYr: 24,
    waterIngestionLPerDay: 2,
    soilIngestionMgPerDay: 100,
    inhalationM3PerHour: 20 / 24,
    etHoursPerDay: { indoorInhalation: 24 },
    waterSkinAreaCm2: 19400,
    swimIngestionMlPerHour: 50,
    swimSkinAreaCm2: 19400,
  },
  residentAdultOnly: {
    bwKg: 70,
    efDaysPerYr: 350,
    edYr: 30,
    waterIngestionLPerDay: 2,
    soilIngestionMgPerDay: 100,
    inhalationM3PerHour: 20 / 24,
    etHoursPerDay: { indoorInhalation: 24 },
    waterSkinAreaCm2: 19400,
    swimIngestionMlPerHour: 50,
    swimSkinAreaCm2: 19400,
  },
  residentChild: {
    bwKg: 15,
    efDaysPerYr: 350,
    edYr: 6,
    soilIngestionMgPerDay: 200,
    etHoursPerDay: { indoorInhalation: 24 },
    waterSkinAreaCm2: 7280,
    swimIngestionMlPerHour: 50,
    swimSkinAreaCm2: 7280,
  },
  worker: {
    bwKg: 70,
    efDaysPerYr: 250,
    edYr: 25,
    waterIngestionLPerDay: 1,
    soilIngestionMgPerDay: 50,
    // 20 m^3 breathed during an 8 h workday
    inhalationM3PerHour: 20 / 8,
    etHoursPerDay: { indoorInhalation: 8, outdoorInhalation: 8 },
  },
};

/** A pathway's EPC: a constant, or the two window averages the legacy method needs (SI). */
export type LegacyEpcInput = number | LegacyEpc;

export interface LegacyChemicalRun {
  id: string;
  chemical: LegacyChemical;
  /** EPC per pathway; a pathway absent here skips this chemical for that pathway. */
  epcs: Partial<Record<PathwayId, LegacyEpcInput>>;
}

export interface LegacyReceptorRun {
  label: string;
  receptor: LegacyReceptor;
  pathways: readonly PathwayId[];
  chemicals: readonly LegacyChemicalRun[];
  routeExtrapolation?: boolean;
}

export interface LegacyReceptorCell {
  chemical: string;
  pathway: PathwayId;
  cell: LegacyCell;
}

export interface LegacyTotals {
  /** Sum of the quantified cancer risks. */
  risk: number;
  /** Sum of the quantified hazard quotients (the hazard index). */
  hi: number;
}

export interface LegacyReceptorResult {
  label: string;
  cells: LegacyReceptorCell[];
  byPathway: Partial<Record<PathwayId, LegacyTotals>>;
  byChemical: Record<string, LegacyTotals>;
  totals: LegacyTotals;
  warnings: Warning[];
}

export interface LegacyRunResult {
  receptors: LegacyReceptorResult[];
  /** The additive option: A's and B's cancer risks summed. Null when the option is off. */
  additiveCancerRisk: number | null;
  warnings: Warning[];
}

const SOIL_CEILING = 1e-1; // 1e5 mg/kg, 10 percent of the soil by mass
const RISK_LINEAR_LIMIT = 0.01;

function asEpc(v: LegacyEpcInput): LegacyEpc {
  return typeof v === 'number' ? { cancer: v, noncancer: v } : v;
}

function checkEpc(label: string, e: LegacyEpc): void {
  for (const v of [e.cancer, e.noncancer]) {
    if (!Number.isFinite(v) || v < 0) {
      throw new RangeError(`${label}: concentrations must be finite and not negative`);
    }
  }
}

const sum = (a: LegacyTotals, risk: number | null, hq: number | null): void => {
  a.risk += risk ?? 0;
  a.hi += hq ?? 0;
};

/** Evaluates one receptor: every chemical by every pathway switched on, summed within the receptor. */
export function evaluateLegacyReceptor(run: LegacyReceptorRun): LegacyReceptorResult {
  const warnings: Warning[] = [];
  const cells: LegacyReceptorCell[] = [];
  const byPathway: Partial<Record<PathwayId, LegacyTotals>> = {};
  const byChemical: Record<string, LegacyTotals> = {};
  const totals: LegacyTotals = { risk: 0, hi: 0 };
  const seenSiteSpecific = new Set<string>();

  for (const pathway of run.pathways) {
    if (!run.chemicals.some((c) => c.epcs[pathway] !== undefined)) {
      throw new RangeError(
        `${run.label}: pathway ${pathway} is on but no chemical has an EPC for it`,
      );
    }
  }

  for (const pathway of run.pathways) {
    for (const c of run.chemicals) {
      const given = c.epcs[pathway];
      if (given === undefined) continue;
      const epc = asEpc(given);
      checkEpc(`${c.id} ${pathway}`, epc);
      const cell = legacyPathway(pathway, epc, run.receptor, c.chemical, {
        routeExtrapolation: run.routeExtrapolation === true,
      });
      cells.push({ chemical: c.id, pathway, cell });

      if (PATHWAYS[pathway].medium === 'soil') {
        const top = Math.max(epc.cancer, epc.noncancer);
        if (c.chemical.csat !== undefined && top > c.chemical.csat) {
          warnings.push({
            code: 'exposure.csat-exceeded',
            message: `${run.label}: ${c.id} soil EPC exceeds its saturation concentration; the contact assumptions may not hold`,
          });
        }
        if (top > SOIL_CEILING) {
          warnings.push({
            code: 'exposure.soil-ceiling',
            message: `${run.label}: ${c.id} soil EPC exceeds 1e5 mg/kg (10 percent of the soil by mass)`,
          });
        }
      }

      if (!cell.computable) {
        const isChem = (m: string): boolean => m === 'aaf' || m === 'kp' || isProduceChemicalGap(m);
        const chemMissing = cell.missing.filter(isChem);
        const siteMissing = cell.missing.filter((m) => !isChem(m));
        if (chemMissing.length > 0) {
          warnings.push({
            code: 'exposure.not-quantified',
            message: `${run.label}: ${c.id} has no ${chemMissing.join(', ')} for ${pathway}; not quantified`,
          });
        }
        const key = `${pathway}:${siteMissing.join(',')}`;
        if (siteMissing.length > 0 && !seenSiteSpecific.has(key)) {
          seenSiteSpecific.add(key);
          warnings.push({
            code: 'exposure.site-specific-required',
            message: `${run.label}: ${pathway} needs ${siteMissing.join(', ')}; not quantified until entered`,
          });
        }
        continue;
      }

      const endpoints = [
        cell.risk === null ? 'cancer risk' : '',
        cell.hq === null ? 'hazard quotient' : '',
      ].filter(Boolean);
      if (endpoints.length > 0) {
        warnings.push({
          code: 'exposure.not-quantified',
          message: `${run.label}: ${c.id} has no toxicity value for ${pathway} ${endpoints.join(' and ')}; not quantified`,
        });
      }
      if (cell.extrapolated) {
        warnings.push({
          code: 'exposure.route-extrapolated',
          message: `${run.label}: ${c.id} ${pathway} uses a toxicity value extrapolated from another route`,
        });
      }
      if (cell.risk !== null && cell.risk > RISK_LINEAR_LIMIT) {
        warnings.push({
          code: 'risk.linear-above-0.01',
          message: `${run.label}: ${c.id} ${pathway} risk ${cell.risk.toPrecision(3)} exceeds 0.01; the linear form overstates it`,
        });
      }
      sum((byPathway[pathway] ??= { risk: 0, hi: 0 }), cell.risk, cell.hq);
      sum((byChemical[c.id] ??= { risk: 0, hi: 0 }), cell.risk, cell.hq);
      sum(totals, cell.risk, cell.hq);
    }
  }

  if (totals.risk > RISK_LINEAR_LIMIT) {
    warnings.push({
      code: 'risk.linear-above-0.01',
      message: `${run.label}: total risk ${totals.risk.toPrecision(3)} exceeds 0.01; the linear form overstates it`,
    });
  }
  if (totals.hi > 1) {
    warnings.push({
      code: 'risk.hi-above-1-unsegregated',
      message: `${run.label}: the hazard index exceeds 1 and sums all target organs; consider segregating by target organ`,
    });
  }
  return { label: run.label, cells, byPathway, byChemical, totals, warnings };
}

/**
 * One or two receptors, side by side. With `additive`, the two receptors' cancer risks are also summed
 * (the way a child plus an adult resident is built); hazard indices are never summed across receptors.
 */
export function evaluateLegacyRun(
  receptors: readonly LegacyReceptorRun[],
  options: { additive?: boolean } = {},
): LegacyRunResult {
  if (receptors.length < 1 || receptors.length > 2) {
    throw new RangeError('a run has one or two receptors');
  }
  if (options.additive === true && receptors.length !== 2) {
    throw new RangeError('the additive option needs two receptors');
  }
  const results = receptors.map(evaluateLegacyReceptor);
  const additiveCancerRisk =
    options.additive === true ? results.reduce((s, r) => s + r.totals.risk, 0) : null;
  const warnings = results.flatMap((r) => r.warnings);
  if (additiveCancerRisk !== null && additiveCancerRisk > RISK_LINEAR_LIMIT) {
    warnings.push({
      code: 'risk.linear-above-0.01',
      message: `additive cancer risk ${additiveCancerRisk.toPrecision(3)} exceeds 0.01; the linear form overstates it`,
    });
  }
  return { receptors: results, additiveCancerRisk, warnings };
}
