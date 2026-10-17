import {
  LEGACY_PRESETS,
  MODERN_RESIDENT_BOUNDARY,
  MODERN_WORKER_BOUNDARY,
  PATHWAYS,
  PATHWAY_IDS,
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
  type ScenarioChemical,
} from '@model-flow/engine';
import type { DermalForm } from '@model-flow/data/rsl-types';
import type { WellFeed } from '../transport/wellFeed';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import { PATHWAY_LABELS } from './chartData';
import type { ChemicalDb, ChemicalRecord } from './chemicalDb';
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

const LEGACY_PRESET: Record<PresetId, LegacyPresetId> = {
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

const MODERN_PRESET: Record<PresetId, ModernReceptorBoundary> = {
  resident: MODERN_RESIDENT_BOUNDARY,
  worker: MODERN_WORKER_BOUNDARY,
  child: MODERN_CHILD_BOUNDARY,
};

const mediumLabel = (key: string): string => MEDIA.find((m) => m.key === key)?.label ?? key;

class Errors {
  list: string[] = [];
  add(msg: string): void {
    if (!this.list.includes(msg)) this.list.push(msg);
  }
}

/** A blank entry is `undefined`; anything else must be a finite number not below zero. */
function parse(text: string | undefined, label: string, errors: Errors): number | undefined {
  if (text === undefined || text.trim() === '') return undefined;
  const v = Number(text.trim());
  if (!Number.isFinite(v) || v < 0) {
    errors.add(`${label}: enter a number that is not negative`);
    return undefined;
  }
  return v;
}

function legacyChemical(rec: ChemicalRecord): LegacyChemical {
  const t = rec.tox;
  const out: LegacyChemical = {};
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

function modernChem(rec: ChemicalRecord, dermalForm: DermalForm | undefined) {
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

function parseSite(rf: ReceptorForm, tag: string, errors: Errors): Site {
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

function legacyBoundary(preset: PresetId, s: Site): LegacyReceptorBoundary {
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
  return b;
}

function modernBoundary(preset: PresetId, s: Site): ModernReceptorBoundary {
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
    return out;
  };
  const out: ModernReceptorBoundary = { ...base, stages: base.stages.map(stage) };
  if (base.mutagenStages) out.mutagenStages = base.mutagenStages.map(stage);
  if (s.bathTime !== undefined) out.cancerBathingTimeHr = s.bathTime;
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
  surface: SurfaceWaterFeed | null = null,
): BuildResult {
  const errors = new Errors();
  if (form.chemicals.length === 0) errors.add('Add at least one chemical.');

  const records = form.chemicals.map((row) => ({ row, rec: db.byId.get(row.id) }));
  const epcs = new Map<string, Partial<Record<PathwayId, EpcSpec>>>();
  for (const { row, rec } of records) {
    if (rec === undefined) {
      errors.add(`${row.name}: not in the chemical database`);
      continue;
    }
    const byPathway: Partial<Record<PathwayId, EpcSpec>> = {};
    for (const pathway of PATHWAY_IDS) {
      const medium = PATHWAYS[pathway].medium;
      if (medium === 'groundwater' && row.groundwaterFromWell) {
        if (well === null) {
          errors.add(
            `${row.name}: no transport well result to use; run the groundwater transport screen and send its well result here`,
          );
          continue;
        }
        byPathway[pathway] = seriesEpc(
          { times: well.times, values: well.values },
          `transport.${well.method}`,
        );
        continue;
      }
      if (medium === 'surfaceWater' && row.surfaceWaterFromModel) {
        if (surface === null) {
          errors.add(
            `${row.name}: no surface water result to use; run the surface water screen and send its result here`,
          );
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
    epcs.set(row.id, byPathway);
  }

  const notes: string[] = [];
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
  for (const { tag, rf } of receptors) {
    const site = parseSite(rf, tag, errors);
    if (!ready || errors.list.length > 0) continue;
    const label = `${tag} (${PRESET_LABELS[rf.preset]})`;
    const pathways = PATHWAY_IDS.filter(
      (p) => rf.pathways[p] && [...epcs.values()].some((e) => e[p] !== undefined),
    );
    for (const p of PATHWAY_IDS) {
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
      const legacyR = legacyReceptor(legacyBoundary(rf.preset, site));
      const modernR = modernReceptor(modernBoundary(rf.preset, site));
      legacyReceptors.push({
        label,
        receptor: legacyR,
        pathways,
        chemicals: records.map(({ row, rec }): ScenarioChemical<LegacyChemical> => ({
          id: row.id,
          chemical: legacyChemical(rec!),
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
          chemical: modernChem(rec!, row.dermalForm),
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
