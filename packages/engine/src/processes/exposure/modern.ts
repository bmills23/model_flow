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
  /** An RSL special case (computed as an ordinary chemical, warned by the receptor evaluation). */
  special?: SpecialCase;
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
 * `eventTimeOverride` replaces the stage's bathing event time (the time-weighted cancer convention).
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
        stage.swimEventTime,
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
  const cancerStages =
    chem.mutagen && receptor.mutagenStages !== undefined ? receptor.mutagenStages : receptor.stages;
  const groups = noncancerGroups(receptor);

  let cancerEpc: readonly number[];
  let noncancerEpc: Record<string, number>;
  if (typeof epc === 'number') {
    checkConcentration(pathway, epc);
    cancerEpc = cancerStages.map(() => epc);
    noncancerEpc = Object.fromEntries(groups.map((g) => [g.group, epc]));
  } else {
    if (epc.cancerByStage.length !== cancerStages.length) {
      throw new RangeError(
        `${pathway}: cancerByStage needs ${cancerStages.length} concentrations, one per life stage`,
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
  const weighted =
    pathway === 'waterDermal'
      ? (receptor.cancerBathingEventTime ?? timeWeightedBathingTime(cancerStages))
      : undefined;

  const riskByStage: ModernCell['riskByStage'] = [];
  for (const [i, s] of cancerStages.entries()) {
    const c = modernStageContact(pathway, s, chem, weighted);
    c.missing.forEach((x) => missing.add(x));
    if (c.perEpc !== null && sf !== undefined) {
      const coef = (sf * s.adaf * c.perEpc * c.ef * s.ed) / receptor.lifetime;
      riskByStage.push({ stage: s.id, riskPerEpc: coef, risk: coef * cancerEpc[i]! });
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
