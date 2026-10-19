import type { Warning } from '../../registry/index.js';
import type { DermalWaterParams } from './dermal.js';
import { isProduceChemicalGap, type ProduceFactors } from './produce.js';
import {
  isAgeSegmented,
  modernReceptorFromBoundary,
  type LifeStageBoundary,
  type ModernReceptor,
  type ModernReceptorBoundary,
} from './lifeStages.js';
import {
  modernPathway,
  noncancerGroups,
  validateModernChemical,
  type ModernCell,
  type ModernChemical,
  type ModernEpcInput,
  type SpecialCase,
} from './modern.js';
import {
  PATHWAYS,
  cmPerHourToMPerS,
  hoursToSeconds,
  iurFromPerUgM3,
  mgPerKgToKgPerKg,
  rfcFromMgPerM3,
  rfdFromMgPerKgDay,
  sfFromPerMgKgDay,
  type PathwayId,
} from './units.js';

/** CAS number of inorganic arsenic, whose RSL relative bioavailability is 0.6 (`epa2012asrba`). */
export const ARSENIC_CAS = '7440-38-2';
const ARSENIC_RBA = 0.6;

/**
 * Chemical in the RSL's boundary units: `sfo` (mg/kg-d)^-1, `iur` (ug/m^3)^-1, `rfdo` mg/kg-d, `rfci`
 * mg/m^3, `csat` mg/kg, `kp` cm/h, `tauEvent` and `tStar` h. The field names follow the database
 * (`packages/data`), so a database row maps over with `organic` added.
 */
export interface ModernChemicalBoundary {
  /** The CAS number or database id. */
  id: string;
  cas?: string | undefined;
  mutagen: boolean;
  sfo?: number | undefined;
  iur?: number | undefined;
  rfdo?: number | undefined;
  rfci?: number | undefined;
  giabs?: number | undefined;
  absd?: number | undefined;
  /** Relative bioavailability; defaults to 0.6 for inorganic arsenic (CAS 7440-38-2) and 1 otherwise. */
  rba?: number | undefined;
  csat?: number | undefined;
  kp?: number | undefined;
  tauEvent?: number | undefined;
  tStar?: number | undefined;
  b?: number | undefined;
  fa?: number | undefined;
  /**
   * Lag-time model (true) or Kp times the event time (false) for dermal water. The RSL's lag-time columns
   * are filled for inorganics too (cadmium, mercury salts, nickel, zinc), so their presence does not say
   * which applies, and guessing overstates metals' dermal hazard 1.8 to 7 times. Absent, dermal water is
   * not quantified (reported missing), never defaulted. The database field `dermalForm` carries it.
   */
  organic?: boolean | undefined;
  inEpd?: boolean | undefined;
  special?: SpecialCase | undefined;
  /** Fresh-weight plant factors per produce class (kg/kg per kg/kg soil). */
  produceFactors?: ProduceFactors | undefined;
}

/** Converts a boundary chemical to SI, applying the arsenic RBA default and checking the ranges. */
export function modernChemical(b: ModernChemicalBoundary): ModernChemical {
  const arsenic = b.id === ARSENIC_CAS || b.cas === ARSENIC_CAS;
  const out: ModernChemical = { mutagen: b.mutagen, rba: b.rba ?? (arsenic ? ARSENIC_RBA : 1) };
  if (b.sfo !== undefined) out.sfo = sfFromPerMgKgDay(b.sfo);
  if (b.iur !== undefined) out.iur = iurFromPerUgM3(b.iur);
  if (b.rfdo !== undefined) out.rfdo = rfdFromMgPerKgDay(b.rfdo);
  if (b.rfci !== undefined) out.rfc = rfcFromMgPerM3(b.rfci);
  if (b.giabs !== undefined) out.giabs = b.giabs;
  if (b.absd !== undefined) out.absd = b.absd;
  if (b.csat !== undefined) out.csat = mgPerKgToKgPerKg(b.csat);
  if (b.inEpd !== undefined) out.inEpd = b.inEpd;
  if (b.special !== undefined) out.special = b.special;
  if (b.produceFactors !== undefined) out.produceFactors = { ...b.produceFactors };
  if (b.kp !== undefined && b.organic !== undefined) {
    out.dermalWater = dermalWaterParams(b, b.kp, b.organic);
  }
  validateModernChemical(out);
  return out;
}

function dermalWaterParams(
  b: ModernChemicalBoundary,
  kp: number,
  organic: boolean,
): DermalWaterParams {
  const dw: DermalWaterParams = { organic, kp: cmPerHourToMPerS(kp) };
  if (b.tauEvent !== undefined) dw.tauEvent = hoursToSeconds(b.tauEvent);
  if (b.tStar !== undefined) dw.tStar = hoursToSeconds(b.tStar);
  if (b.b !== undefined) dw.b = b.b;
  if (b.fa !== undefined) dw.fa = b.fa;
  return dw;
}

const INDOOR_ALL_DAY = 24;

const CHILD_FACTORS = {
  group: 'child',
  bwKg: 15,
  efDaysPerYr: 350,
  waterIngestionLPerDay: 0.78,
  soilIngestionMgPerDay: 200,
  soilSkinAreaCm2: 2373,
  soilAdherenceMgPerCm2: 0.2,
  soilEventsPerDay: 1,
  waterSkinAreaCm2: 6365,
  bathingTimeHr: 0.54,
  bathingEventsPerDay: 1,
  swimSkinAreaCm2: 6365,
  etHoursPerDay: { indoorInhalation: INDOOR_ALL_DAY, showerInhalation: 0.54 },
} as const satisfies Partial<LifeStageBoundary>;

const ADULT_FACTORS = {
  group: 'adult',
  bwKg: 80,
  efDaysPerYr: 350,
  waterIngestionLPerDay: 2.5,
  soilIngestionMgPerDay: 100,
  soilSkinAreaCm2: 6032,
  soilAdherenceMgPerCm2: 0.07,
  soilEventsPerDay: 1,
  waterSkinAreaCm2: 19652,
  bathingTimeHr: 0.71,
  bathingEventsPerDay: 1,
  swimSkinAreaCm2: 19652,
  etHoursPerDay: { indoorInhalation: INDOOR_ALL_DAY, showerInhalation: 0.71 },
} as const satisfies Partial<LifeStageBoundary>;

/**
 * Modern resident (`epa2014ef`, RSL default parameter file, November 2024): child 6 yr and adult 20 yr,
 * and for a mutagen the four ADAF segments 0-2, 2-6, 6-16, 16-26 yr (10, 3, 3, 1) with child factors
 * before age 6 and adult factors after. Surface-water ingestion follows the RSL file: 0.12 L/h for a
 * child and 0.11 L/h for the adult stage, 0.124 and 0.0985 L/h for the 6-16 and 16-26 segments.
 * Swimming time and frequency, and the outdoor air time, have no default and are entered.
 */
export const MODERN_RESIDENT_BOUNDARY: ModernReceptorBoundary = {
  label: 'Resident',
  // the RSL's time-weighted resident event time for the cancer dermal-water dose
  cancerBathingTimeHr: 0.6708,
  stages: [
    { id: 'child', edYr: 6, swimIngestionLPerHour: 0.12, ...CHILD_FACTORS },
    { id: 'adult', edYr: 20, swimIngestionLPerHour: 0.11, ...ADULT_FACTORS },
  ],
  mutagenStages: [
    { id: 'age-0-2', edYr: 2, adaf: 10, swimIngestionLPerHour: 0.12, ...CHILD_FACTORS },
    { id: 'age-2-6', edYr: 4, adaf: 3, swimIngestionLPerHour: 0.12, ...CHILD_FACTORS },
    { id: 'age-6-16', edYr: 10, adaf: 3, swimIngestionLPerHour: 0.124, ...ADULT_FACTORS },
    { id: 'age-16-26', edYr: 10, adaf: 1, swimIngestionLPerHour: 0.0985, ...ADULT_FACTORS },
  ],
};

/**
 * Modern composite worker (`epa2014ef`, RSL default parameter file): one adult stage, BW 80 kg,
 * 250 d/yr, 25 yr, 100 mg/d soil, 3527 cm^2 and 0.12 mg/cm^2 for dermal soil, 8 h/d indoors. No
 * drinking-water or bathing factors (a worker's water use is entered).
 */
export const MODERN_WORKER_BOUNDARY: ModernReceptorBoundary = {
  label: 'Composite worker',
  stages: [
    {
      id: 'worker',
      group: 'worker',
      bwKg: 80,
      edYr: 25,
      efDaysPerYr: 250,
      soilIngestionMgPerDay: 100,
      soilSkinAreaCm2: 3527,
      soilAdherenceMgPerCm2: 0.12,
      soilEventsPerDay: 1,
      etHoursPerDay: { indoorInhalation: 8, outdoorInhalation: 8 },
    },
  ],
};

/** Converts a boundary receptor to SI (ranges checked). */
export const modernReceptor = modernReceptorFromBoundary;
export const modernResident = (): ModernReceptor =>
  modernReceptorFromBoundary(MODERN_RESIDENT_BOUNDARY);
export const modernWorker = (): ModernReceptor =>
  modernReceptorFromBoundary(MODERN_WORKER_BOUNDARY);

export interface ModernChemicalRun {
  id: string;
  chemical: ModernChemical;
  /** EPC per pathway; a pathway absent here skips this chemical for that pathway. */
  epcs: Partial<Record<PathwayId, ModernEpcInput>>;
}

export interface ModernReceptorRun {
  label: string;
  receptor: ModernReceptor;
  pathways: readonly PathwayId[];
  chemicals: readonly ModernChemicalRun[];
}

export interface ModernReceptorCell {
  chemical: string;
  pathway: PathwayId;
  cell: ModernCell;
}

export interface ModernTotals {
  /** Sum of the quantified cancer risks. */
  risk: number;
  /** Hazard index of each noncancer group (sums of that group's hazard quotients). */
  hiByGroup: Record<string, number>;
  /** Headline hazard index: the largest group's. */
  hi: number;
}

export interface ModernReceptorResult {
  label: string;
  cells: ModernReceptorCell[];
  byPathway: Partial<Record<PathwayId, ModernTotals>>;
  byChemical: Record<string, ModernTotals>;
  totals: ModernTotals;
  warnings: Warning[];
}

export interface ModernRunResult {
  receptors: ModernReceptorResult[];
  /** The additive option: A's and B's cancer risks summed. Null when the option is off. */
  additiveCancerRisk: number | null;
  warnings: Warning[];
}

const SOIL_CEILING = 1e-1; // 1e5 mg/kg, 10 percent of the soil by mass
const RISK_LINEAR_LIMIT = 0.01;
const isChemicalValue = (m: string): boolean =>
  m === 'absd' || m === 'dermalWater' || isProduceChemicalGap(m);

function epcMax(e: ModernEpcInput): number {
  return typeof e === 'number'
    ? e
    : Math.max(...e.cancerByStage, ...Object.values(e.noncancerByGroup));
}

function newTotals(groups: readonly string[]): ModernTotals {
  return { risk: 0, hiByGroup: Object.fromEntries(groups.map((g) => [g, 0])), hi: 0 };
}

function addCell(t: ModernTotals, cell: ModernCell): void {
  t.risk += cell.risk ?? 0;
  for (const g of cell.hqByGroup) t.hiByGroup[g.group] = (t.hiByGroup[g.group] ?? 0) + g.hq;
  t.hi = Math.max(...Object.values(t.hiByGroup));
}

/** Evaluates one receptor: every chemical by every pathway switched on, summed within the receptor. */
export function evaluateModernReceptor(run: ModernReceptorRun): ModernReceptorResult {
  const warnings: Warning[] = [];
  const cells: ModernReceptorCell[] = [];
  const groups = noncancerGroups(run.receptor).map((g) => g.group);
  const byPathway: Partial<Record<PathwayId, ModernTotals>> = {};
  const byChemical: Record<string, ModernTotals> = {};
  const totals = newTotals(groups);
  const seenSiteSpecific = new Set<string>();
  const seenSpecial = new Set<string>();

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
      const cell = modernPathway(pathway, run.receptor, c.chemical, given);
      cells.push({ chemical: c.id, pathway, cell });

      if (c.chemical.special !== undefined && !seenSpecial.has(c.id)) {
        seenSpecial.add(c.id);
        warnings.push({
          code: 'exposure.special-case-not-modelled',
          message: `${run.label}: ${c.id} is ${c.chemical.special}, which the RSL tables treat with their own equations; computed as an ordinary chemical`,
        });
      }

      if (PATHWAYS[pathway].medium === 'soil') {
        const top = epcMax(given);
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
        const chemMissing = cell.missing.filter((m) => isChemicalValue(m));
        const siteMissing = cell.missing.filter((m) => !isChemicalValue(m));
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
      if (cell.dermalAdjusted) {
        warnings.push({
          code: 'exposure.giabs-adjusted',
          message: `${run.label}: ${c.id} ${pathway} uses a dermal toxicity value adjusted for a gastrointestinal absorption below 0.5`,
        });
      }
      if (cell.outsideEpd) {
        warnings.push({
          code: 'exposure.dermal-outside-epd',
          message: `${run.label}: ${c.id} is outside the RAGS Part E prediction domain; the dermal-water dose is computed but uncertain (the RSL tables omit it)`,
        });
      }
      if (cell.risk !== null && cell.risk > RISK_LINEAR_LIMIT) {
        warnings.push({
          code: 'risk.linear-above-0.01',
          message: `${run.label}: ${c.id} ${pathway} risk ${cell.risk.toPrecision(3)} exceeds 0.01; the linear form overstates it`,
        });
      }
      addCell((byPathway[pathway] ??= newTotals(groups)), cell);
      addCell((byChemical[c.id] ??= newTotals(groups)), cell);
      addCell(totals, cell);
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
 * One or two receptors, side by side. With `additive`, the two receptors' cancer risks are also summed;
 * an age-segmented receptor (the resident) already covers child and adult, so combining it with the
 * additive option is a RangeError. Hazard indices are never summed across receptors.
 */
export function evaluateModernRun(
  receptors: readonly ModernReceptorRun[],
  options: { additive?: boolean } = {},
): ModernRunResult {
  if (receptors.length < 1 || receptors.length > 2) {
    throw new RangeError('a run has one or two receptors');
  }
  if (options.additive === true) {
    if (receptors.length !== 2) throw new RangeError('the additive option needs two receptors');
    if (receptors.some((r) => isAgeSegmented(r.receptor))) {
      throw new RangeError(
        'the additive option cannot be used with an age-segmented receptor (it would count the child twice)',
      );
    }
  }
  const results = receptors.map(evaluateModernReceptor);
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
