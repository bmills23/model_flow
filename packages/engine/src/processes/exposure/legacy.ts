import {
  produceContact,
  validateProduceFactors,
  type ProduceFactors,
  type ProduceIntakes,
} from './produce.js';
import {
  DAY_S,
  PATHWAYS,
  STANDARD_ADULT_BW,
  STANDARD_ADULT_INHALATION,
  rfdiFromRfc,
  sfiFromIur,
  type PathwayId,
  type ToxicityValues,
} from './units.js';

/**
 * Legacy exposure kernels (`exposure.rags-a-1989`): the dose-based intakes of RAGS Part A chapter 6
 * for the nine pathways, SI throughout. Each pathway has a daily contact term (dose rate on an
 * exposure day, per kg body weight), turned into a chronic average daily dose (CADD, noncancer) and a
 * lifetime average daily dose (LADD, cancer) by the frequency and duration fractions.
 */

/** Chemical inputs of the legacy kernels (toxicity values in SI, see `ToxicityValues`). */
export interface LegacyChemical extends ToxicityValues {
  /** Dermal-soil absorption fraction AAF, [0, 1]. */
  aaf?: number;
  /** Steady-state dermal permeability Kp, m/s. */
  kp?: number;
  /** Soil ingestion bioavailability, [0, 1]; defaults to 1. */
  bio?: number;
  /** Soil saturation concentration Csat, kg/kg (used only for the warning). */
  csat?: number;
  /** Fresh-weight plant factors per produce class (kg/kg per kg/kg soil), for the `produce` pathway. */
  produceFactors?: ProduceFactors;
}

/** Receptor exposure factors in SI. Anything the pathways do not use may be absent. */
export interface LegacyReceptor {
  /** Body weight, kg. */
  bw: number;
  /** Exposure duration, s. */
  ed: number;
  /** Lifetime for cancer averaging, s. */
  lifetime: number;
  /** Exposure frequency, fraction of the 365-day year. */
  ef: number;
  /** Per-pathway frequency overriding `ef` (swimming, for example). */
  efByPathway?: Partial<Record<PathwayId, number>>;
  /** Per-pathway exposure time, fraction of the day. Needed by the dermal-water, air and swimming pathways. */
  etByPathway?: Partial<Record<PathwayId, number>>;
  /** Soil ingestion rate, kg/s (daily rate averaged over the day). */
  soilIngestionRate?: number;
  /** Skin area exposed to soil, m^2. */
  soilSkinArea?: number;
  /** Soil-to-skin adherence, kg/m^2 per event (one event per exposure day). */
  soilAdherence?: number;
  /** Drinking-water ingestion rate, m^3/s (daily rate averaged over the day). */
  waterIngestionRate?: number;
  /** Skin area exposed to water while bathing, m^2. */
  waterSkinArea?: number;
  /** Inhalation rate while exposed, m^3/s. */
  inhalationRate?: number;
  /** Surface-water ingestion rate while in the water, m^3/s. */
  swimIngestionRate?: number;
  /** Skin area exposed to surface water, m^2. */
  swimSkinArea?: number;
  /** Homegrown produce intake per class (the `produce` pathway). */
  produce?: ProduceIntakes;
}

export interface LegacyEpc {
  /** Concentration for the cancer dose (window average over the exposure duration). */
  cancer: number;
  /** Concentration for the noncancer dose (largest 7-year window, or the duration when shorter). */
  noncancer: number;
}

export interface LegacyOptions {
  /**
   * Route-to-route extrapolation of oral and inhalation values (dose-based, off by default as in the
   * RSL tables). When on, a missing route value is taken from the other route.
   */
  routeExtrapolation?: boolean;
}

export interface LegacyCell {
  pathway: PathwayId;
  /** True when every needed factor and value was present; otherwise `missing` names what is not. */
  computable: boolean;
  missing: string[];
  /** Chronic average daily dose (noncancer), kg/(kg s). Null when not computable. */
  cadd: number | null;
  /** Lifetime average daily dose (cancer), kg/(kg s). */
  ladd: number | null;
  /** Incremental lifetime cancer risk; null when there is no slope factor for the route. */
  risk: number | null;
  /** Hazard quotient; null when there is no reference value for the route. */
  hq: number | null;
  /** Risk per unit cancer EPC (SI), for the M5 hand-off. Null as `risk`. */
  riskPerEpc: number | null;
  /** Hazard quotient per unit noncancer EPC (SI). Null as `hq`. */
  hqPerEpc: number | null;
  /** True when a route value came from another route. */
  extrapolated: boolean;
}

/**
 * Inhalation slope factor and reference dose of the legacy method: IUR and RfC converted at the
 * standard adult 20 m^3/d and 70 kg (a RISC5 choice, whatever the receptor breathes or weighs).
 */
export function legacyInhalationValues(t: ToxicityValues): { sfi?: number; rfdi?: number } {
  const out: { sfi?: number; rfdi?: number } = {};
  if (t.iur !== undefined)
    out.sfi = sfiFromIur(t.iur, STANDARD_ADULT_INHALATION, STANDARD_ADULT_BW);
  if (t.rfc !== undefined)
    out.rfdi = rfdiFromRfc(t.rfc, STANDARD_ADULT_INHALATION, STANDARD_ADULT_BW);
  return out;
}

/** Slope factor and reference dose for a pathway's route, after optional extrapolation. */
function routeValues(
  pathway: PathwayId,
  chem: ToxicityValues,
  extrapolate: boolean,
): { sf: number | undefined; rfd: number | undefined; extrapolated: boolean } {
  const { sfi, rfdi } = legacyInhalationValues(chem);
  const inhalation = PATHWAYS[pathway].route === 'inhalation';
  let sf = inhalation ? sfi : chem.sfo;
  let rfd = inhalation ? rfdi : chem.rfdo;
  let extrapolated = false;
  if (extrapolate) {
    const otherSf = inhalation ? chem.sfo : sfi;
    const otherRfd = inhalation ? chem.rfdo : rfdi;
    if (sf === undefined && otherSf !== undefined) {
      sf = otherSf;
      extrapolated = true;
    }
    if (rfd === undefined && otherRfd !== undefined) {
      rfd = otherRfd;
      extrapolated = true;
    }
  }
  return { sf, rfd, extrapolated };
}

interface Contact {
  /** Dose rate on an exposure day per unit EPC (SI), or null with the names of the missing inputs. */
  perEpc: number | null;
  missing: string[];
}

function need(missing: string[], name: string, v: number | undefined): number {
  if (v === undefined) {
    missing.push(name);
    return 0;
  }
  return v;
}

/**
 * Daily contact term per unit EPC, kg/(kg s) per (kg/kg or kg/m^3). Pathway equations (RAGS Part A
 * chapter 6): soil ingestion IRS BIO / BW; dermal soil SA AF AAF / BW (one event a day); drinking
 * water IRW / BW; dermal water SA ET Kp / BW; inhalation InhR ET / BW; surface-water ingestion
 * IRsw ET / BW; dermal surface water as dermal water.
 */
export function legacyContactTerm(
  pathway: PathwayId,
  receptor: LegacyReceptor,
  chem: LegacyChemical,
): Contact {
  const m: string[] = [];
  const et = (): number => need(m, `etByPathway.${pathway}`, receptor.etByPathway?.[pathway]);
  let numerator = 0;
  switch (pathway) {
    case 'soilIngestion':
      numerator = need(m, 'soilIngestionRate', receptor.soilIngestionRate) * (chem.bio ?? 1);
      break;
    case 'soilDermal':
      numerator =
        (need(m, 'soilSkinArea', receptor.soilSkinArea) *
          need(m, 'soilAdherence', receptor.soilAdherence) *
          need(m, 'aaf', chem.aaf)) /
        DAY_S;
      break;
    case 'waterIngestion':
      numerator = need(m, 'waterIngestionRate', receptor.waterIngestionRate);
      break;
    case 'waterDermal':
      numerator = need(m, 'waterSkinArea', receptor.waterSkinArea) * need(m, 'kp', chem.kp) * et();
      break;
    case 'showerInhalation':
    case 'indoorInhalation':
    case 'outdoorInhalation':
      numerator = need(m, 'inhalationRate', receptor.inhalationRate) * et();
      break;
    case 'swimIngestion':
      numerator = need(m, 'swimIngestionRate', receptor.swimIngestionRate) * et();
      break;
    case 'swimDermal':
      numerator = need(m, 'swimSkinArea', receptor.swimSkinArea) * need(m, 'kp', chem.kp) * et();
      break;
    case 'produce': {
      // already per kg body weight
      const c = produceContact(receptor.bw, receptor.produce, chem.produceFactors);
      return { perEpc: c.perEpc, missing: c.missing };
    }
  }
  return m.length > 0
    ? { perEpc: null, missing: m }
    : { perEpc: numerator / receptor.bw, missing: m };
}

/** Throws a RangeError for a fraction outside [0, 1] or a toxicity or permeability value out of range. */
export function validateLegacyChemical(chem: LegacyChemical): void {
  validateProduceFactors(chem.produceFactors);
  for (const [name, v] of [
    ['aaf', chem.aaf],
    ['bio', chem.bio],
  ] as const) {
    if (v !== undefined && !(Number.isFinite(v) && v >= 0 && v <= 1)) {
      throw new RangeError(`${name} must be in [0, 1]`);
    }
  }
  for (const [name, v] of [
    ['sfo', chem.sfo],
    ['iur', chem.iur],
    ['kp', chem.kp],
    ['csat', chem.csat],
  ] as const) {
    if (v !== undefined && !(Number.isFinite(v) && v >= 0)) {
      throw new RangeError(`${name} must be finite and not negative`);
    }
  }
  for (const [name, v] of [
    ['rfdo', chem.rfdo],
    ['rfc', chem.rfc],
  ] as const) {
    if (v !== undefined && !(Number.isFinite(v) && v > 0)) {
      throw new RangeError(`${name} must be finite and positive`);
    }
  }
}

/**
 * One pathway for one chemical: doses, risk and hazard quotient, and the per-unit-EPC coefficients.
 * Risk is SF x LADD and HQ is CADD / RfD, the linear low-dose form of RAGS Part A chapter 8. A route
 * without a toxicity value gives `null`, never zero. A missing exposure factor makes the cell not
 * computable (the caller reports it).
 */
export function legacyPathway(
  pathway: PathwayId,
  epc: LegacyEpc,
  receptor: LegacyReceptor,
  chem: LegacyChemical,
  options: LegacyOptions = {},
): LegacyCell {
  validateLegacyChemical(chem);
  const contact = legacyContactTerm(pathway, receptor, chem);
  const { sf, rfd, extrapolated } = routeValues(pathway, chem, options.routeExtrapolation === true);
  if (contact.perEpc === null) {
    return {
      pathway,
      computable: false,
      missing: contact.missing,
      cadd: null,
      ladd: null,
      risk: null,
      hq: null,
      riskPerEpc: null,
      hqPerEpc: null,
      extrapolated: false,
    };
  }
  const ef = receptor.efByPathway?.[pathway] ?? receptor.ef;
  const fNc = ef;
  const fC = (ef * receptor.ed) / receptor.lifetime;
  const cadd = contact.perEpc * epc.noncancer * fNc;
  const ladd = contact.perEpc * epc.cancer * fC;
  const riskPerEpc = sf === undefined ? null : sf * contact.perEpc * fC;
  const hqPerEpc = rfd === undefined ? null : (contact.perEpc * fNc) / rfd;
  return {
    pathway,
    computable: true,
    missing: [],
    cadd,
    ladd,
    risk: riskPerEpc === null ? null : riskPerEpc * epc.cancer,
    hq: hqPerEpc === null ? null : hqPerEpc * epc.noncancer,
    riskPerEpc,
    hqPerEpc,
    extrapolated: extrapolated && (sf !== undefined || rfd !== undefined),
  };
}
