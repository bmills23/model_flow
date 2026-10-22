import {
  LEGACY_PRESETS,
  MODERN_RESIDENT_BOUNDARY,
  MODERN_WORKER_BOUNDARY,
  PATHWAYS,
  DIRECT_PATHWAY_IDS,
  cmPerHourToMPerS,
  constantEpc,
  iurFromPerUgM3,
  legacyReceptor,
  mgPerKgToKgPerKg,
  modernChemical,
  modernReceptor,
  rfcFromMgPerM3,
  rfdFromMgPerKgDay,
  seriesEpc,
  surfaceWaterEpc,
  sfFromPerMgKgDay,
  type EpcSpec,
  type LegacyChemical,
  type LegacyPresetId,
  type LegacyReceptorBoundary,
  type LegacyScenarioInput,
  type LegacyScenarioReceptor,
  type LifeStageBoundary,
  type ModernReceptorBoundary,
  type ModernScenarioInput,
  type ModernScenarioReceptor,
  type PathwayId,
  type ProduceBoundary,
  type ProduceFactors,
  type ScenarioChemical,
} from '@model-flow/engine';
import type { DermalForm } from '@model-flow/data/rsl-types';
import type { WellFeed } from '../transport/wellFeed';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { HouseholdRiskFeed } from '../household/feeds';
import type { ProduceRiskFeed } from '../plantsEco/feeds';
import { PATHWAY_LABELS } from './chartData';
import type { ChemicalDb, ChemicalRecord } from './chemicalDb';
import { feedChemicalProblem } from '../project/feedChemical';
import {
  LEGACY_FIELDS,
  LIFETIME_KEY,
  MODERN_FIELDS,
  modernKey,
  type ReceptorEdits,
} from '../overrides/receptors';
import { MEDIA, PRESET_LABELS, type PresetId, type ReceptorForm, type RiskForm } from './form';

/**
 * One year on the transport time axis, which counts 365.25-day years. The exposure start the user
 * enters, and the start year shown, are on that axis. The engine's exposure durations stay 365-day years.
 */
export const TRANSPORT_YEAR_S = 365.25 * 86400;

/** The one input error that means "nothing to compute yet" rather than "something is wrong". */
export const ENTER_CONCENTRATION =
  'Enter a concentration for at least one chemical in at least one medium.';

export type BuildResult =
  | { ok: true; legacy: LegacyScenarioInput; modern: ModernScenarioInput; notes: string[] }
  | { ok: false; errors: string[] };

export const LEGACY_PRESET: Record<PresetId, LegacyPresetId> = {
  resident: 'residentAdult',
  worker: 'worker',
  child: 'residentChild',
};

/** The modern child resident: the resident's child stage alone, with its two mutagen age segments. */
const MODERN_CHILD_BOUNDARY: ModernReceptorBoundary = {
  label: 'Child resident',
  cancerBathingTimeHr: 0.54,
  stages: MODERN_RESIDENT_BOUNDARY.stages.slice(0, 1),
  ...(MODERN_RESIDENT_BOUNDARY.mutagenStages
    ? { mutagenStages: MODERN_RESIDENT_BOUNDARY.mutagenStages.slice(0, 2) }
    : {}),
};

export const MODERN_PRESET: Record<PresetId, ModernReceptorBoundary> = {
  resident: MODERN_RESIDENT_BOUNDARY,
  worker: MODERN_WORKER_BOUNDARY,
  child: MODERN_CHILD_BOUNDARY,
};

export const mediumLabel = (key: string): string => MEDIA.find((m) => m.key === key)?.label ?? key;

export class Errors {
  list: string[] = [];
  add(msg: string): void {
    if (!this.list.includes(msg)) this.list.push(msg);
  }
}

/** A blank entry is `undefined`; anything else must be a finite number not below zero. */
export function parse(text: string | undefined, label: string, errors: Errors): number | undefined {
  if (text === undefined || text.trim() === '') return undefined;
  const v = Number(text.trim());
  if (!Number.isFinite(v) || v < 0) {
    errors.add(`${label}: enter a number that is not negative`);
    return undefined;
  }
  return v;
}

export function legacyChemical(
  rec: ChemicalRecord,
  produceFactors?: ProduceFactors,
): LegacyChemical {
  const t = rec.tox;
  const out: LegacyChemical = {};
  if (produceFactors !== undefined) out.produceFactors = produceFactors;
  if (t.sfo) out.sfo = sfFromPerMgKgDay(t.sfo.value);
  if (t.iur) out.iur = iurFromPerUgM3(t.iur.value);
  if (t.rfdo) out.rfdo = rfdFromMgPerKgDay(t.rfdo.value);
  if (t.rfci) out.rfc = rfcFromMgPerM3(t.rfci.value);
  if (t.absd !== undefined) out.aaf = t.absd;
  if (t.csat !== undefined) out.csat = mgPerKgToKgPerKg(t.csat);
  const kp = rec.phys?.values.kp;
  if (kp) out.kp = cmPerHourToMPerS(kp.value);
  return out;
}

export function modernChem(
  rec: ChemicalRecord,
  dermalForm: DermalForm | undefined,
  produceFactors?: ProduceFactors,
) {
  const t = rec.tox;
  const v = rec.phys?.values;
  return modernChemical({
    id: rec.id,
    cas: rec.cas,
    mutagen: t.mutagen,
    sfo: t.sfo?.value,
    iur: t.iur?.value,
    rfdo: t.rfdo?.value,
    rfci: t.rfci?.value,
    giabs: t.giabs,
    absd: t.absd,
    csat: t.csat,
    kp: v?.kp?.value,
    tauEvent: v?.tauEvent?.value,
    tStar: v?.tStar?.value,
    b: v?.b?.value,
    fa: rec.phys?.fa,
    inEpd: rec.phys?.inEpd,
    special: t.special,
    organic: dermalForm === undefined ? undefined : dermalForm === 'organic',
    produceFactors,
  });
}

interface Site {
  soilSkinArea: number | undefined;
  soilAdherence: number | undefined;
  waterIngestion: number | undefined;
  waterSkinArea: number | undefined;
  inhalationRate: number | undefined;
  bathTime: number | undefined;
  swimTime: number | undefined;
  swimDays: number | undefined;
  outdoorTime: number | undefined;
}

export function parseSite(rf: ReceptorForm, tag: string, errors: Errors): Site {
  const p = (text: string, what: string) => parse(text, `${tag}, ${what}`, errors);
  return {
    soilSkinArea: p(rf.soilSkinArea, 'soil skin area'),
    soilAdherence: p(rf.soilAdherence, 'soil adherence'),
    waterIngestion: p(rf.waterIngestion, 'drinking water ingestion'),
    waterSkinArea: p(rf.waterSkinArea, 'skin area for water'),
    inhalationRate: p(rf.inhalationRate, 'breathing rate'),
    bathTime: p(rf.bathTime, 'bathing time'),
    swimTime: p(rf.swimTime, 'swimming time'),
    swimDays: p(rf.swimDays, 'swimming days per year'),
    outdoorTime: p(rf.outdoorTime, 'outdoor air time'),
  };
}

/** The receptor's display name: the project's name for it, else the default tag. */
export const receptorTag = (rf: ReceptorForm, tag: string): string =>
  rf.edits !== undefined && rf.edits.name.trim() !== '' ? rf.edits.name.trim() : tag;

/** The typed factor edits as numbers by field key; a bad entry is an error and is left out. */
export type FactorEdits = Record<string, number>;

export function parseEdits(rf: ReceptorForm, tag: string, errors: Errors): FactorEdits {
  const out: FactorEdits = {};
  const values: ReceptorEdits['values'] = rf.edits?.values ?? {};
  const labels = new Map<string, string>([
    ...LEGACY_FIELDS.map((f) => [f.key, `legacy ${f.label.toLowerCase()}`] as const),
    ...MODERN_FIELDS.map((f) => [`*.${f.prop}`, `modern ${f.label.toLowerCase()}`] as const),
    [LIFETIME_KEY, 'averaging time for cancer'],
  ]);
  for (const [key, text] of Object.entries(values)) {
    const wild = key.startsWith('modern.') ? `*.${key.split('.')[2] ?? ''}` : key;
    const what = labels.get(wild) ?? key;
    const v = parse(text, `${tag}, ${what}`, errors);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

export function legacyBoundary(
  preset: PresetId,
  s: Site,
  produce?: ProduceBoundary,
  edits: FactorEdits = {},
): LegacyReceptorBoundary {
  const base = LEGACY_PRESETS[LEGACY_PRESET[preset]];
  const et: Partial<Record<PathwayId, number>> = { ...base.etHoursPerDay };
  const ef: Partial<Record<PathwayId, number>> = { ...base.efDaysPerYrByPathway };
  const b: LegacyReceptorBoundary = { ...base, etHoursPerDay: et, efDaysPerYrByPathway: ef };
  if (s.soilSkinArea !== undefined) b.soilSkinAreaCm2 = s.soilSkinArea;
  if (s.soilAdherence !== undefined) b.soilAdherenceMgPerCm2 = s.soilAdherence;
  if (s.waterIngestion !== undefined) b.waterIngestionLPerDay = s.waterIngestion;
  if (s.waterSkinArea !== undefined) {
    b.waterSkinAreaCm2 = s.waterSkinArea;
    b.swimSkinAreaCm2 = s.waterSkinArea;
  }
  if (s.inhalationRate !== undefined) b.inhalationM3PerHour = s.inhalationRate;
  if (s.bathTime !== undefined) {
    et.waterDermal = s.bathTime;
    et.showerInhalation = s.bathTime;
  }
  if (s.swimTime !== undefined) {
    et.swimIngestion = s.swimTime;
    et.swimDermal = s.swimTime;
  }
  if (s.swimDays !== undefined) {
    ef.swimIngestion = s.swimDays;
    ef.swimDermal = s.swimDays;
  }
  if (s.outdoorTime !== undefined) et.outdoorInhalation = s.outdoorTime;
  if (produce !== undefined) b.produce = produce;
  for (const f of LEGACY_FIELDS) {
    const v = edits[f.key];
    if (v !== undefined) b[f.prop] = v;
  }
  if (edits[LIFETIME_KEY] !== undefined) b.lifetimeYr = edits[LIFETIME_KEY];
  return b;
}

export function modernBoundary(
  preset: PresetId,
  s: Site,
  produce?: ProduceBoundary,
  edits: FactorEdits = {},
): ModernReceptorBoundary {
  const base = MODERN_PRESET[preset];
  const stage = (st: LifeStageBoundary): LifeStageBoundary => {
    const et: Partial<Record<PathwayId, number>> = { ...st.etHoursPerDay };
    const ef: Partial<Record<PathwayId, number>> = { ...st.efDaysPerYrByPathway };
    const out: LifeStageBoundary = { ...st, etHoursPerDay: et, efDaysPerYrByPathway: ef };
    if (s.soilSkinArea !== undefined) out.soilSkinAreaCm2 = s.soilSkinArea;
    if (s.soilAdherence !== undefined) out.soilAdherenceMgPerCm2 = s.soilAdherence;
    if (s.waterIngestion !== undefined) out.waterIngestionLPerDay = s.waterIngestion;
    if (s.waterSkinArea !== undefined) {
      out.waterSkinAreaCm2 = s.waterSkinArea;
      out.swimSkinAreaCm2 = s.waterSkinArea;
    }
    if (s.bathTime !== undefined) {
      out.bathingTimeHr = s.bathTime;
      et.showerInhalation = s.bathTime;
    }
    if (s.swimTime !== undefined) {
      out.swimTimeHr = s.swimTime;
      out.swimEventsPerDay = 1;
    }
    if (s.swimDays !== undefined) {
      ef.swimIngestion = s.swimDays;
      ef.swimDermal = s.swimDays;
    }
    if (s.outdoorTime !== undefined) et.outdoorInhalation = s.outdoorTime;
    if (produce !== undefined) out.produce = produce;
    for (const f of MODERN_FIELDS) {
      const v = edits[modernKey(st.group, f.prop)];
      if (v !== undefined) out[f.prop] = v;
    }
    return out;
  };
  const out: ModernReceptorBoundary = { ...base, stages: base.stages.map(stage) };
  if (base.mutagenStages) out.mutagenStages = base.mutagenStages.map(stage);
  if (s.bathTime !== undefined) out.cancerBathingTimeHr = s.bathTime;
  if (edits[LIFETIME_KEY] !== undefined) out.lifetimeYr = edits[LIFETIME_KEY];
  return out;
}

/**
 * Turns the form into one scenario input per method: the same chemicals, concentrations and receptors,
 * so the two methods are compared on equal footing. A pathway is switched on only when the receptor has
 * it on and some chemical has a concentration for its medium; the rest are listed in `notes`.
 */
export function buildInputs(
  form: RiskForm,
  db: ChemicalDb,
  well: WellFeed | null,
  vapor: VaporRiskFeed | null = null,
  surface: SurfaceWaterFeed | null = null,
  household: HouseholdRiskFeed | null = null,
  produce: ProduceRiskFeed | null = null,
): BuildResult {
  const errors = new Errors();
  if (form.chemicals.length === 0) errors.add('Add at least one chemical.');

  const records = form.chemicals.map((row) => ({ row, rec: db.byId.get(row.id) }));
  const nameOf = (id: string): string =>
    form.chemicals.find((c) => c.id === id)?.name ?? db.byId.get(id)?.name ?? id;
  const feedProblem = (feed: string, feedChemical: string | undefined, rowId: string) =>
    feedChemicalProblem({
      feed,
      feedChemical,
      rowId,
      runCount: form.chemicals.length,
      nameOf,
    });
  const epcs = new Map<string, Partial<Record<PathwayId, EpcSpec>>>();
  for (const { row, rec } of records) {
    if (rec === undefined) {
      errors.add(`${row.name}: not in the chemical database`);
      continue;
    }
    const byPathway: Partial<Record<PathwayId, EpcSpec>> = {};
    for (const pathway of DIRECT_PATHWAY_IDS) {
      const medium = PATHWAYS[pathway].medium;
      if (medium === 'groundwater' && row.groundwaterFromWell) {
        if (well === null) {
          errors.add(
            `${row.name}: no transport well result to use; run the groundwater transport screen and send its well result here`,
          );
          continue;
        }
        const wellProblem = feedProblem('transport well result', well.chemicalId, row.id);
        if (wellProblem !== null) {
          errors.add(`${row.name}: ${wellProblem}`);
          continue;
        }
        byPathway[pathway] = seriesEpc(
          { times: well.times, values: well.values },
          `transport.${well.method}`,
        );
        continue;
      }
      const householdSpec =
        medium === 'bathroomAir' && row.bathroomFromHousehold
          ? { spec: household?.bathroomAir, what: 'shower air' }
          : medium === 'indoorAir' && row.indoorFromHousehold
            ? { spec: household?.indoorAir, what: 'household (whole-house) air' }
            : medium === 'outdoorAir' && row.outdoorFromHousehold === 'sprinkler'
              ? { spec: household?.outdoorSprinkler, what: 'sprinkler spray air' }
              : medium === 'outdoorAir' && row.outdoorFromHousehold === 'particulate'
                ? { spec: household?.outdoorParticulate, what: 'windblown particulate air' }
                : null;
      if (householdSpec) {
        if (household === null || household.chemicalId !== row.id) {
          errors.add(
            `${row.name}: no household screen result for this chemical to use; run the shower, irrigation and particulates screen with it and send its result here`,
          );
        } else if (householdSpec.spec === undefined) {
          errors.add(`${row.name}: the household screen result has no ${householdSpec.what}`);
        } else {
          byPathway[pathway] = householdSpec.spec;
        }
        continue;
      }
      const vaporSpec =
        medium === 'indoorAir' && row.indoorFromVapor
          ? { spec: vapor?.indoor, what: 'indoor air' }
          : medium === 'outdoorAir' && row.outdoorFromVapor
            ? { spec: vapor?.outdoor, what: 'outdoor air' }
            : null;
      if (vaporSpec) {
        if (vapor === null || vapor.chemicalId !== row.id) {
          errors.add(
            `${row.name}: no vapor screen result for this chemical to use; run the vapor intrusion screen with it and send its result here`,
          );
        } else if (vaporSpec.spec === undefined) {
          errors.add(`${row.name}: the vapor screen result has no ${vaporSpec.what}`);
        } else {
          byPathway[pathway] = vaporSpec.spec;
        }
        continue;
      }
      if (medium === 'surfaceWater' && row.surfaceWaterFromModel) {
        if (surface === null) {
          errors.add(
            `${row.name}: no surface water result to use; run the surface water screen and send its result here`,
          );
          continue;
        }
        const surfaceProblem = feedProblem('surface water result', surface.chemicalId, row.id);
        if (surfaceProblem !== null) {
          errors.add(`${row.name}: ${surfaceProblem}`);
          continue;
        }
        byPathway[pathway] = surfaceWaterEpc(surface.times, surface.values, surface.origin);
        continue;
      }
      const v = parse(
        row.conc[medium],
        `${row.name}, ${mediumLabel(medium).toLowerCase()}`,
        errors,
      );
      if (v !== undefined) byPathway[pathway] = constantEpc(pathway, v);
    }
    if (row.produceFromPlantsEco) {
      if (produce === null || produce.chemicalId !== row.id) {
        errors.add(
          `${row.name}: no plants and ecology result for this chemical to use; run the plants and ecology screen with it and send its produce result here`,
        );
      } else {
        const soil = parse(row.conc.soil, `${row.name}, soil`, errors);
        if (soil === undefined) {
          if ((row.conc.soil ?? '').trim() === '')
            errors.add(
              `${row.name}: enter a soil concentration; the homegrown produce pathway is driven by it`,
            );
        } else {
          byPathway.produce = constantEpc('produce', soil);
        }
      }
    }
    epcs.set(row.id, byPathway);
  }

  const notes: string[] = [];
  const factorsFor = (row: { id: string; produceFromPlantsEco: boolean }) =>
    row.produceFromPlantsEco && produce?.chemicalId === row.id ? produce.factors : undefined;
  const hasAnyEpc = [...epcs.values()].some((e) => Object.keys(e).length > 0);
  if (form.chemicals.length > 0 && errors.list.length === 0 && !hasAnyEpc) {
    errors.add(ENTER_CONCENTRATION);
  }

  let startOption: { exposureStart: 'max-risk' | number } = { exposureStart: 'max-risk' };
  if (form.startMode === 'pinned') {
    const yr = parse(form.startYr, 'Exposure start', errors);
    if (yr !== undefined) startOption = { exposureStart: yr * TRANSPORT_YEAR_S };
  }

  const receptors: { tag: string; rf: ReceptorForm }[] = [
    { tag: 'Receptor A', rf: form.a },
    ...(form.b ? [{ tag: 'Receptor B', rf: form.b }] : []),
  ];
  const legacyReceptors: LegacyScenarioReceptor[] = [];
  const modernReceptors: ModernScenarioReceptor[] = [];
  const ready = errors.list.length === 0;
  for (const { tag: defaultTag, rf } of receptors) {
    const tag = receptorTag(rf, defaultTag);
    const site = parseSite(rf, tag, errors);
    const edits = parseEdits(rf, tag, errors);
    if (!ready || errors.list.length > 0) continue;
    const label = `${tag} (${PRESET_LABELS[rf.preset]})`;
    const pathways: PathwayId[] = DIRECT_PATHWAY_IDS.filter(
      (p) => rf.pathways[p] && [...epcs.values()].some((e) => e[p] !== undefined),
    );
    const produceOn =
      rf.produce && produce !== null && [...epcs.values()].some((e) => e.produce !== undefined);
    if (produceOn) {
      pathways.push('produce');
      notes.push(
        `${label}: homegrown produce uses the ${produce.intakeLabel} intake for every life stage of the receptor.`,
      );
    } else if (rf.produce) {
      notes.push(
        `${label}: homegrown produce skipped, no chemical uses the plants and ecology screen's plant factors.`,
      );
    }
    for (const p of DIRECT_PATHWAY_IDS) {
      if (rf.pathways[p] && !pathways.includes(p)) {
        notes.push(
          `${label}: ${PATHWAY_LABELS[p]} skipped, no concentration entered for ${mediumLabel(PATHWAYS[p].medium).toLowerCase()}.`,
        );
      }
    }
    if (pathways.length === 0) {
      errors.add(`${label}: no switched-on pathway has a concentration for its medium.`);
      continue;
    }
    try {
      const intake = produceOn ? produce.intakes : undefined;
      const legacyR = legacyReceptor(legacyBoundary(rf.preset, site, intake, edits));
      const modernR = modernReceptor(modernBoundary(rf.preset, site, intake, edits));
      legacyReceptors.push({
        label,
        receptor: legacyR,
        pathways,
        chemicals: records.map(({ row, rec }): ScenarioChemical<LegacyChemical> => ({
          id: row.id,
          chemical: legacyChemical(rec!, factorsFor(row)),
          epcs: epcs.get(row.id) ?? {},
        })),
        routeExtrapolation: form.routeExtrapolation,
      });
      modernReceptors.push({
        label,
        receptor: modernR,
        pathways,
        chemicals: records.map(({ row, rec }) => ({
          id: row.id,
          chemical: modernChem(rec!, row.dermalForm, factorsFor(row)),
          epcs: epcs.get(row.id) ?? {},
        })),
      });
    } catch (e) {
      errors.add(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.list.length > 0) return { ok: false, errors: errors.list };
  return {
    ok: true,
    legacy: { receptors: legacyReceptors, additive: form.additive },
    modern: { receptors: modernReceptors, additive: form.additive, ...startOption },
    notes,
  };
}
