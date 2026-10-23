import {
  dermalToxicity,
  dermalWaterEventPerEpc,
  validateDermalWater,
  type DermalWaterParams,
} from './dermal.js';
import { timeWeightedBathingTime, type LifeStage, type ModernReceptor } from './lifeStages.js';
import { produceContact, validateProduceFactors, type ProduceFactors } from './produce.js';
import { DAY_S, PATHWAYS, type PathwayId, type ToxicityValues } from './units.js';

/**
 * Modern exposure kernels (`exposure.rags-e-f-2014`), SI throughout: RAGS Part F concentration-based
 * inhalation (`ragsf2009`), RAGS Part E dermal event model (`ragse2004`), age-segmented intakes with the
 * ADAF of `epa2005adaf` for mutagens, and the 2014 default factors (`epa2014ef`).
 *
 * Every pathway is linear in the EPC, so the kernel works with a coefficient per unit EPC for each life
 * stage (cancer) and each noncancer group (hazard quotient); a risk is the coefficients times the EPCs.
 */

export type SpecialCase = 'trichloroethylene' | 'vinyl-chloride';

/** Chemical inputs of the modern kernels (toxicity in SI, see `ToxicityValues`). */
export interface ModernChemical extends ToxicityValues {
  /** Mutagenic mode of action: the ADAF age segments apply to the cancer dose. */
  mutagen: boolean;
  /** Gastrointestinal absorption fraction, [0, 1]; absent is treated as at least 0.5. */
  giabs?: number;
  /** Dermal-soil absorption fraction ABSd, [0, 1]. Absent: no soil dermal pathway. */
  absd?: number;
  /** Relative bioavailability of the ingested soil dose, [0, 1]; defaults to 1. */
  rba?: number;
  /** Soil saturation concentration, kg/kg (used only for the warning). */
  csat?: number;
  /** Dermal-water parameters. Absent: no dermal-water pathway. */
  dermalWater?: DermalWaterParams;
  /** The chemical lies in the RAGS E effective prediction domain (false: outside, true or absent: inside or unknown). */
  inEpd?: boolean;
  /**
   * An RSL special case: the cancer equations of the RSL User's Guide for trichloroethylene or vinyl chloride
   * (`specialCancerTerms`) replace the ordinary cancer dose for a receptor that models early-life exposure.
   */
  special?: SpecialCase;
  /**
   * Which cancer values were entered by the user, not taken from the database: the oral slope factor `sfo`
   * and the inhalation unit risk `iur`. The equations of a special case are applied to a given value in the
   * guide's own proportions, and the receptor evaluation warns for each value a pathway uses.
   */
  cancerOverridden?: { sfo: boolean; iur: boolean };
  /** Fresh-weight plant factors per produce class (kg/kg per kg/kg soil), for the `produce` pathway. */
  produceFactors?: ProduceFactors;
}

/**
 * An EPC for a pathway: a constant (SI), or one concentration per cancer life stage and one per
 * noncancer group (the window averages a series reduces to).
 */
export type ModernEpcInput =
  number | { cancerByStage: readonly number[]; noncancerByGroup: Readonly<Record<string, number>> };

export interface ModernCell {
  pathway: PathwayId;
  /** True when every needed factor and value was present; otherwise `missing` names what is not. */
  computable: boolean;
  missing: string[];
  /** Incremental lifetime cancer risk; null when there is no slope factor or unit risk for the route. */
  risk: number | null;
  /** Cancer risk per unit cancer EPC when every stage sees the same EPC (M5 hand-off); null as `risk`. */
  riskPerEpc: number | null;
  /** Risk coefficient and contribution of each cancer life stage; empty when `risk` is null. */
  riskByStage: { stage: string; riskPerEpc: number; risk: number }[];
  /** Headline hazard quotient: the largest over the noncancer groups; null when there is no reference value. */
  hq: number | null;
  /** The largest group coefficient, hazard quotient per unit EPC; null as `hq`. */
  hqPerEpc: number | null;
  /** Hazard quotient of each noncancer group; empty when `hq` is null. Never added across groups. */
  hqByGroup: { group: string; hqPerEpc: number; hq: number }[];
  /** A dermal toxicity value was adjusted for GIABS below 0.5. */
  dermalAdjusted: boolean;
  /** A dermal-water dose was computed for a chemical outside the RAGS E prediction domain. */
  outsideEpd: boolean;
}

function inRange(name: string, v: number | undefined, lo: number, hi: number): void {
  if (v !== undefined && !(Number.isFinite(v) && v >= lo && v <= hi)) {
    throw new RangeError(`${name} must be in [${lo}, ${hi}]`);
  }
}

/** Throws a RangeError for a fraction outside [0, 1] or a toxicity or permeability value out of range. */
export function validateModernChemical(chem: ModernChemical): void {
  validateProduceFactors(chem.produceFactors);
  inRange('absd', chem.absd, 0, 1);
  inRange('giabs', chem.giabs, 0, 1);
  inRange('rba', chem.rba, 0, 1);
  for (const [name, v] of [
    ['sfo', chem.sfo],
    ['iur', chem.iur],
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
  if (chem.dermalWater !== undefined) validateDermalWater(chem.dermalWater);
}

/**
 * Trichloroethylene (RSL User's Guide section 5.18): the cancer and mutagenic parts of its toxicity values, as
 * fractions of the adult-based value the tables carry (0.037 of 0.046 and 0.0093 of 0.046 per mg/kg-d; 3.1e-6
 * and 1.0e-6 of 4.1e-6 per ug/m3, as printed in the guide's equation, read 2026-10-23). The guide's equations
 * print the fractions to three figures, and so do these constants.
 */
export const TCE_ADJUSTMENT = {
  oral: { cancer: 0.804, mutagen: 0.202 },
  inhalation: { cancer: 0.756, mutagen: 0.244 },
} as const;

/** One term of the cancer dose: a life stage, its place on the life-time axis and its weight. */
export interface CancerTerm {
  id: string;
  stage: LifeStage;
  /** Start of the stage on the life-time axis (the stage list it belongs to starts at age 0), s. */
  offset: number;
  /** Multiplier of the slope factor or unit risk: the ADAF, and for trichloroethylene the CAF or MAF. */
  weight: number;
  /**
   * True: the dose is averaged over the lifetime (EF ED / LT). False: the unaveraged early-life term of vinyl
   * chloride, the child's daily dose (inhalation: a unit contact) with no frequency, duration or averaging.
   */
  averaged: boolean;
}

export interface CancerPlan {
  terms: CancerTerm[];
  /** The stages that define the time-weighted event time of the dermal-water cancer dose. */
  timeStages: readonly LifeStage[];
  /** The RSL special-case equations are applied to this pathway and receptor. */
  special: boolean;
}

const segments = (
  stages: readonly LifeStage[],
  weight: (s: LifeStage) => number,
  tag = '',
): CancerTerm[] => {
  let offset = 0;
  return stages.map((s) => {
    const term: CancerTerm = {
      id: `${s.id}${tag}`,
      stage: s,
      offset,
      weight: weight(s),
      averaged: true,
    };
    offset += s.ed;
    return term;
  });
};

/** Pathways to which the early-life term of vinyl chloride does not extend (the guide has no equation for them). */
const VINYL_CHLORIDE_UNCOVERED: readonly PathwayId[] = ['showerInhalation', 'produce'];

/** What the RSL special-case equations cover for a chemical, receptor and pathway. */
export type SpecialStatus =
  { kind: 'none' } | { kind: 'applied' } | { kind: 'not-covered'; what: string };

export function specialStatus(
  chem: ModernChemical,
  receptor: ModernReceptor,
  pathway: PathwayId,
): SpecialStatus {
  if (chem.special === undefined) return { kind: 'none' };
  if (receptor.mutagenStages === undefined) {
    return {
      kind: 'not-covered',
      what: 'the receptor has no early-life segments, so the ordinary cancer equation is used (the RSL does the same for workers)',
    };
  }
  // what the cancer dose falls back to: a mutagen takes its age-dependent adjustment factors (cancerPlan)
  const fallback = chem.mutagen
    ? 'the mutagen equation with the age-dependent adjustment factors (10, 3, 3 and 1) is used'
    : 'the ordinary cancer equation is used';
  if (chem.special === 'vinyl-chloride') {
    if (VINYL_CHLORIDE_UNCOVERED.includes(pathway)) {
      return {
        kind: 'not-covered',
        what: `${pathway} has no early-life term in the guide's equations, so ${fallback}`,
      };
    }
    if (receptor.stages[0]!.group !== 'child') {
      return {
        kind: 'not-covered',
        what: `the receptor's first stage is not a child stage, so the guide's early-life term has no child to take, and ${fallback}`,
      };
    }
  }
  return { kind: 'applied' };
}

/**
 * The terms of the cancer dose of a chemical for a receptor and pathway.
 *
 * Ordinary: the receptor's stages (a mutagen's ADAF segments when it has them), each weighted by its ADAF.
 *
 * Trichloroethylene (guide sections 4.1.x.6, 4.6.x.6 and 5.18), where the receptor has ADAF segments: the
 * stages weighted by the cancer fraction CAF plus the ADAF segments weighted by the mutagenic fraction MAF
 * (oral or inhalation by the route of the pathway; the dermal dose uses the oral fractions).
 *
 * Vinyl chloride (sections 4.1.x.5 and 4.6.x.5), where the first stage is a child: the stages averaged over the
 * lifetime without an ADAF, plus the first stage (the child) once more as an unaveraged daily dose, which is the guide's non-prorated
 * early-life exposure added to the prorated continuous exposure.
 */
export function cancerPlan(
  pathway: PathwayId,
  receptor: ModernReceptor,
  chem: ModernChemical,
): CancerPlan {
  if (specialStatus(chem, receptor, pathway).kind === 'applied') {
    const adaf = receptor.mutagenStages!;
    if (chem.special === 'trichloroethylene') {
      const f =
        PATHWAYS[pathway].route === 'inhalation' ? TCE_ADJUSTMENT.inhalation : TCE_ADJUSTMENT.oral;
      return {
        terms: [
          ...segments(receptor.stages, (s) => s.adaf * f.cancer),
          ...segments(adaf, (s) => s.adaf * f.mutagen),
        ],
        timeStages: adaf,
        special: true,
      };
    }
    const first = receptor.stages[0]!;
    return {
      terms: [
        ...segments(receptor.stages, (s) => s.adaf),
        { id: `${first.id}-from-birth`, stage: first, offset: 0, weight: 1, averaged: false },
      ],
      timeStages: receptor.stages,
      special: true,
    };
  }
  const stages =
    chem.mutagen && receptor.mutagenStages !== undefined ? receptor.mutagenStages : receptor.stages;
  return { terms: segments(stages, (s) => s.adaf), timeStages: stages, special: false };
}

interface Contact {
  /** Contact term per unit EPC on an exposure day (per kg body weight; inhalation: the day fraction). */
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

/** Exposure frequency of a pathway: swimming has no default and must be entered, others fall back to `ef`. */
function efFor(stage: LifeStage, pathway: PathwayId, missing: string[]): number {
  const own = stage.efByPathway?.[pathway];
  if (pathway === 'swimIngestion' || pathway === 'swimDermal') {
    return need(missing, `efByPathway.${pathway}`, own);
  }
  return own ?? stage.ef;
}

/**
 * Contact term of one life stage, kg/(kg s) per unit EPC on an exposure day (inhalation: the exposure
 * time as a day fraction, since RAGS Part F uses the concentration, not a dose).
 *
 * Soil ingestion IRS RBA / BW; soil dermal SA AF EV ABSd / BW (the event dose of eq. 3.12);
 * drinking water IRW / BW; dermal water SA EV DA_event / BW (eq. 3.1 with DA_event of eq. 3.2 to 3.4);
 * surface-water ingestion IRsw t_ev EV / BW; dermal surface water as dermal water.
 * `eventTimeOverride` replaces the stage's bathing or swimming event time (the time-weighted cancer convention).
 */
export function modernStageContact(
  pathway: PathwayId,
  stage: LifeStage,
  chem: ModernChemical,
  eventTimeOverride?: number,
): Contact & { ef: number } {
  const m: string[] = [];
  let numerator = 0;
  const dermalWater = (
    area: number | undefined,
    areaName: string,
    t: number | undefined,
    tName: string,
    ev: number,
  ): void => {
    const skin = need(m, areaName, area);
    const time = need(m, tName, t);
    if (chem.dermalWater === undefined) {
      m.push('dermalWater');
      return;
    }
    if (m.length > 0) return;
    const event = dermalWaterEventPerEpc(chem.dermalWater, time);
    if (event === null) {
      m.push('dermalWater');
      return;
    }
    numerator = (skin * ev * event.perEpc) / DAY_S;
  };
  switch (pathway) {
    case 'soilIngestion':
      numerator = need(m, 'soilIngestionRate', stage.soilIngestionRate) * (chem.rba ?? 1);
      break;
    case 'soilDermal': {
      const sa = need(m, 'soilSkinArea', stage.soilSkinArea);
      const af = need(m, 'soilAdherence', stage.soilAdherence);
      const abs = need(m, 'absd', chem.absd);
      numerator = (sa * af * abs * (stage.soilEventsPerDay ?? 1)) / DAY_S;
      break;
    }
    case 'waterIngestion':
      numerator = need(m, 'waterIngestionRate', stage.waterIngestionRate);
      break;
    case 'waterDermal':
      dermalWater(
        stage.waterSkinArea,
        'waterSkinArea',
        eventTimeOverride ?? stage.bathingEventTime,
        'bathingEventTime',
        stage.bathingEventsPerDay ?? 1,
      );
      break;
    case 'showerInhalation':
    case 'indoorInhalation':
    case 'outdoorInhalation':
      numerator = need(m, `etByPathway.${pathway}`, stage.etByPathway?.[pathway]);
      break;
    case 'swimIngestion':
      numerator =
        (need(m, 'swimIngestionRate', stage.swimIngestionRate) *
          need(m, 'swimEventTime', stage.swimEventTime) *
          (stage.swimEventsPerDay ?? 1)) /
        DAY_S;
      break;
    case 'swimDermal':
      dermalWater(
        stage.swimSkinArea,
        'swimSkinArea',
        eventTimeOverride ?? stage.swimEventTime,
        'swimEventTime',
        stage.swimEventsPerDay ?? 1,
      );
      break;
    case 'produce': {
      // the contact term is already per kg body weight; the common division below undoes it
      const c = produceContact(stage.bw, stage.produce, chem.produceFactors);
      m.push(...c.missing);
      numerator = (c.perEpc ?? 0) * stage.bw;
      break;
    }
  }
  const ef = efFor(stage, pathway, m);
  if (m.length > 0) return { perEpc: null, missing: m, ef };
  const inhalation = PATHWAYS[pathway].route === 'inhalation';
  return { perEpc: inhalation ? numerator : numerator / stage.bw, missing: m, ef };
}

function checkConcentration(label: string, v: number): void {
  if (!Number.isFinite(v) || v < 0) {
    throw new RangeError(`${label}: concentrations must be finite and not negative`);
  }
}

function emptyCell(pathway: PathwayId, missing: string[]): ModernCell {
  return {
    pathway,
    computable: false,
    missing,
    risk: null,
    riskPerEpc: null,
    riskByStage: [],
    hq: null,
    hqPerEpc: null,
    hqByGroup: [],
    dermalAdjusted: false,
    outsideEpd: false,
  };
}

/** The noncancer groups of a receptor with their representative stage, in order of first appearance. */
export function noncancerGroups(receptor: ModernReceptor): { group: string; stage: LifeStage }[] {
  const seen = new Map<string, LifeStage>();
  for (const s of receptor.stages) if (!seen.has(s.group)) seen.set(s.group, s);
  return [...seen].map(([group, stage]) => ({ group, stage }));
}

/**
 * One pathway for one chemical and a receptor: cancer risk summed over the life stages with their ADAF
 * (the receptor's mutagen stages for a mutagen), and one hazard quotient per noncancer group, each
 * with its own exposure frequency and no duration (the averaging time is the group's duration).
 *
 * The dermal-water cancer dose of every chemical (mutagens included) uses one time-weighted bathing event
 * time for all stages, as the RSL tables do (the receptor's `cancerBathingEventTime`, else the ED-weighted
 * mean of the stages' times); every hazard quotient uses each group's own event time. A route without a
 * toxicity value gives `null` and a missing factor makes the cell not computable, never zero.
 */
export function modernPathway(
  pathway: PathwayId,
  receptor: ModernReceptor,
  chem: ModernChemical,
  epc: ModernEpcInput,
): ModernCell {
  validateModernChemical(chem);
  const route = PATHWAYS[pathway].route;
  const plan = cancerPlan(pathway, receptor, chem);
  const groups = noncancerGroups(receptor);

  let cancerEpc: readonly number[];
  let noncancerEpc: Record<string, number>;
  if (typeof epc === 'number') {
    checkConcentration(pathway, epc);
    cancerEpc = plan.terms.map(() => epc);
    noncancerEpc = Object.fromEntries(groups.map((g) => [g.group, epc]));
  } else {
    if (epc.cancerByStage.length !== plan.terms.length) {
      throw new RangeError(
        `${pathway}: cancerByStage needs ${plan.terms.length} concentrations, one per cancer term (${plan.terms.map((x) => x.id).join(', ')})`,
      );
    }
    cancerEpc = epc.cancerByStage;
    cancerEpc.forEach((v) => checkConcentration(pathway, v));
    noncancerEpc = {};
    for (const g of groups) {
      const v = epc.noncancerByGroup[g.group];
      if (v === undefined) {
        throw new RangeError(`${pathway}: noncancerByGroup needs a concentration for ${g.group}`);
      }
      checkConcentration(pathway, v);
      noncancerEpc[g.group] = v;
    }
  }

  let sf: number | undefined;
  let rfd: number | undefined;
  let dermalAdjusted = false;
  if (route === 'inhalation') {
    sf = chem.iur;
    rfd = chem.rfc;
  } else if (route === 'dermal') {
    const d = dermalToxicity({ sfo: chem.sfo, rfdo: chem.rfdo, giabs: chem.giabs });
    sf = d.sf;
    rfd = d.rfd;
    dermalAdjusted = d.adjusted;
  } else {
    sf = chem.sfo;
    rfd = chem.rfdo;
  }

  const missing = new Set<string>();
  let weighted: number | undefined;
  if (pathway === 'waterDermal') {
    weighted = receptor.cancerBathingEventTime ?? timeWeightedBathingTime(plan.timeStages);
  } else if (pathway === 'swimDermal' && plan.special) {
    weighted = timeWeightedBathingTime(plan.timeStages, (s) => s.swimEventTime);
  }

  const riskByStage: ModernCell['riskByStage'] = [];
  for (const [i, term] of plan.terms.entries()) {
    const s = term.stage;
    const c = modernStageContact(pathway, s, chem, weighted);
    c.missing.forEach((x) => missing.add(x));
    if (c.perEpc !== null && sf !== undefined) {
      let coef: number;
      if (term.averaged) coef = (sf * term.weight * c.perEpc * c.ef * s.ed) / receptor.lifetime;
      else coef = sf * term.weight * (route === 'inhalation' ? 1 : c.perEpc);
      riskByStage.push({ stage: term.id, riskPerEpc: coef, risk: coef * cancerEpc[i]! });
    }
  }
  const hqByGroup: ModernCell['hqByGroup'] = [];
  for (const g of groups) {
    const c = modernStageContact(pathway, g.stage, chem);
    c.missing.forEach((x) => missing.add(x));
    if (c.perEpc !== null && rfd !== undefined) {
      const coef = (c.perEpc * c.ef) / rfd;
      hqByGroup.push({ group: g.group, hqPerEpc: coef, hq: coef * noncancerEpc[g.group]! });
    }
  }
  if (missing.size > 0) return emptyCell(pathway, [...missing]);

  const hasRisk = sf !== undefined;
  const hasHq = rfd !== undefined;
  const outsideEpd =
    (pathway === 'waterDermal' || pathway === 'swimDermal') && chem.inEpd === false;
  return {
    pathway,
    computable: true,
    missing: [],
    risk: hasRisk ? riskByStage.reduce((a, x) => a + x.risk, 0) : null,
    riskPerEpc: hasRisk ? riskByStage.reduce((a, x) => a + x.riskPerEpc, 0) : null,
    riskByStage: hasRisk ? riskByStage : [],
    hq: hasHq ? Math.max(...hqByGroup.map((x) => x.hq)) : null,
    hqPerEpc: hasHq ? Math.max(...hqByGroup.map((x) => x.hqPerEpc)) : null,
    hqByGroup: hasHq ? hqByGroup : [],
    dermalAdjusted: dermalAdjusted && (hasRisk || hasHq),
    outsideEpd,
  };
}
