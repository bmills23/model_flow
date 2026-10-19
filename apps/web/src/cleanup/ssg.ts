import { usableMcl } from './mcl';
import {
  DIRECT_PATHWAY_IDS,
  backCalculateModern,
  resolveConcentrationTarget,
  ssgLeachingLevel,
  type PathwayId,
  type SsgLeachingInput,
  type SsgLeachingResult,
  type Warning,
} from '@model-flow/engine';
import type { CleanupChemicalsFile } from '@model-flow/data/rsl-types';
import type { ChemicalDb } from '../risk/chemicalDb';
import { buildCleanup } from './build';
import type { CleanupForm } from './form';

/** Partition and solubility inputs of the cleanup screen, by database id (RSL units: L/kg, mg/L). */
export type CleanupProps = Map<string, { koc?: number; kd?: number; hPrime?: number; s?: number }>;

let loading: Promise<CleanupProps> | null = null;

/** Loads the derived cleanup-chemicals file on first use; its own chunk, like the risk database. */
export function loadCleanupProps(): Promise<CleanupProps> {
  loading ??= import('@model-flow/data/generated/rsl-2024-11/cleanup-chemicals.json').then((m) => {
    const file = m.default as unknown as CleanupChemicalsFile;
    const out: CleanupProps = new Map();
    for (const c of file.chemicals) {
      const v = c.values;
      const e: { koc?: number; kd?: number; hPrime?: number; s?: number } = {};
      if (v.koc) e.koc = v.koc.value;
      if (v.kd) e.kd = v.kd.value;
      if (v.hPrime) e.hPrime = v.hPrime.value;
      if (v.s) e.s = v.s.value;
      out.set(c.id, e);
    }
    return out;
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export interface SsgComparison {
  kind: 'mcl' | 'risk';
  /** The published RSL soil-to-groundwater SSL at DAF 1, mg/kg. */
  published: number;
  /** Computed partition level over the published one. */
  ratio: number;
}

export type SsgRow =
  | {
      ok: true;
      id: string;
      name: string;
      result: SsgLeachingResult;
      /** The groundwater target before the DAF, ug/L. */
      targetUgL: number;
      targetLabel: string;
      published: { risk?: { value: number; key: string }; mcl?: number };
      compare?: SsgComparison;
      warnings: Warning[];
    }
  | { ok: false; id: string; name: string; reason: string };

export type SsgBuildResult =
  { ok: true; rows: SsgRow[]; notes: string[] } | { ok: false; errors: string[] };

const YEAR_S = 365.25 * 86400;
const TAP: readonly PathwayId[] = ['waterIngestion', 'waterDermal'];

function num(
  text: string,
  label: string,
  errors: string[],
  opts: { optional?: boolean; max?: number } = {},
): number | undefined {
  if (text.trim() === '') {
    if (!opts.optional) errors.push(`${label}: enter a number`);
    return undefined;
  }
  const v = Number(text.trim());
  if (!Number.isFinite(v) || v <= 0 || (opts.max !== undefined && v > opts.max)) {
    errors.push(
      `${label}: enter a number above zero${opts.max !== undefined ? ` and at most ${opts.max}` : ''}`,
    );
    return undefined;
  }
  return v;
}

/** The risk-based tap water level (drinking plus bathing, receptor A, modern), kg/m^3, or null. */
function tapWaterLevels(form: CleanupForm, db: ChemicalDb): Map<string, number | null> | string[] {
  const pathways = Object.fromEntries(
    DIRECT_PATHWAY_IDS.map((p) => [p, TAP.includes(p)]),
  ) as Record<PathwayId, boolean>;
  const base = buildCleanup(
    { ...form, allocation: 'individual', a: { ...form.a, pathways }, b: null, additive: false },
    db,
  );
  if (!base.ok) return base.errors;
  const out = new Map<string, number | null>();
  const res = backCalculateModern(base.modern);
  const gw = res.media.find((m) => m.medium === 'groundwater');
  for (const lv of gw?.levels ?? []) out.set(lv.chemical, lv.level);
  return out;
}

function ssgInputFor(
  p: CleanupProps extends Map<string, infer V> ? V | undefined : never,
): Pick<SsgLeachingInput, 'kind' | 'kd' | 'koc' | 'H' | 'solubility'> | null {
  if (p === undefined || (p.kd === undefined && p.koc === undefined)) return null;
  const out: Pick<SsgLeachingInput, 'kind' | 'kd' | 'koc' | 'H' | 'solubility'> = {
    kind: p.koc !== undefined ? 'organic' : 'inorganic',
  };
  if (p.kd !== undefined) out.kd = p.kd * 1e-3;
  else out.koc = p.koc! * 1e-3;
  if (p.hPrime !== undefined) out.H = p.hPrime;
  if (p.s !== undefined) out.solubility = p.s * 1e-3;
  return out;
}

/** The soil screening leaching level of every listed chemical, closed form. SI inside, mg/kg and ug/L at the edge. */
export function computeSsg(form: CleanupForm, db: ChemicalDb, props: CleanupProps): SsgBuildResult {
  const f = form.ssg;
  const errors: string[] = [];
  if (form.chemicals.length === 0) return { ok: false, errors: ['Add at least one chemical.'] };

  const rhoB = num(f.rhoB, 'Bulk density (kg/L)', errors);
  const foc = num(f.foc, 'Organic carbon fraction', errors, { max: 1 });
  const theta = num(f.theta, 'Water-filled porosity', errors, { max: 1 });
  const sourceDepth = num(f.sourceDepth, 'Source depth (m)', errors, { optional: true });
  const user =
    f.targetKind === 'user' ? num(f.userTarget, 'Groundwater target (ug/L)', errors) : undefined;
  let site: SsgLeachingInput['daf'] = f.daf === '20' ? 20 : 1;
  let siteNote = '';
  if (f.daf === 'site') {
    const K = num(f.siteK, 'Hydraulic conductivity (m/d)', errors);
    const i = num(f.siteGradient, 'Hydraulic gradient', errors);
    const I = num(f.siteInfiltration, 'Infiltration (cm/yr)', errors);
    const L = num(f.siteL, 'Source length (m)', errors);
    const da = num(f.siteDa, 'Aquifer thickness (m)', errors);
    if (
      K !== undefined &&
      i !== undefined &&
      I !== undefined &&
      L !== undefined &&
      da !== undefined
    ) {
      site = { site: { K: K / 86400, i, I: (I * 0.01) / YEAR_S, L, da } };
      siteNote = `Site-specific DAF from K ${K} m/d, gradient ${i}, infiltration ${I} cm/yr, source length ${L} m and aquifer thickness ${da} m.`;
    }
  }
  if (errors.length > 0 || rhoB === undefined || foc === undefined || theta === undefined) {
    return { ok: false, errors };
  }

  let tap: Map<string, number | null> | null = null;
  if (f.targetKind === 'tap') {
    const t = tapWaterLevels(form, db);
    if (Array.isArray(t)) return { ok: false, errors: t };
    tap = t;
  }

  const soil = { rhoB: rhoB * 1000, foc, theta };
  const rows: SsgRow[] = [];
  for (const row of form.chemicals) {
    const rec = db.byId.get(row.id);
    const name = rec?.name ?? row.name;
    if (rec === undefined) {
      rows.push({ ok: false, id: row.id, name, reason: 'not in the chemical database' });
      continue;
    }
    const chem = ssgInputFor(props.get(row.id));
    if (chem === null) {
      rows.push({
        ok: false,
        id: row.id,
        name,
        reason: 'no soil-water partition coefficient (Koc or Kd) in the database',
      });
      continue;
    }
    const extra: Warning[] = [];
    let target: number | null;
    let label: string;
    if (f.targetKind === 'mcl') {
      const r = resolveConcentrationTarget(
        name,
        { kind: 'mcl' },
        usableMcl(rec.tox).value === undefined
          ? undefined
          : { value: usableMcl(rec.tox).value!, ...(rec.tox.mclGroup ? { group: true } : {}) },
      );
      target = r.value;
      extra.push(...r.warnings);
      label = 'MCL';
      if (target === null) {
        rows.push({
          ok: false,
          id: row.id,
          name,
          reason: 'no MCL in the database for this chemical',
        });
        continue;
      }
    } else if (f.targetKind === 'user') {
      target = user! * 1e-6;
      label = 'your value';
    } else {
      target = tap?.get(row.id) ?? null;
      label = 'risk-based tap water level';
      if (target === null) {
        rows.push({
          ok: false,
          id: row.id,
          name,
          reason: 'no toxicity value for drinking water or bathing, so no tap water level',
        });
        continue;
      }
      if (rec.tox.volatile && (rec.tox.iur !== undefined || rec.tox.rfci !== undefined)) {
        extra.push({
          code: 'cleanup.tapwater-inhalation-omitted',
          message:
            'the tap water level omits the household-use inhalation term, so it can be higher than the RSL tap water level',
        });
      }
    }
    try {
      const input: SsgLeachingInput = {
        ...chem,
        soil,
        target,
        daf: site,
        ...(sourceDepth !== undefined ? { sourceDepth } : {}),
      };
      const result = ssgLeachingLevel(input);
      const published = rec.tox.publishedSsl ?? {};
      let compare: SsgComparison | undefined;
      if (f.daf === '1') {
        const mgPart = result.partitionLevel * 1e6;
        if (f.targetKind === 'mcl' && published.mcl !== undefined) {
          compare = { kind: 'mcl', published: published.mcl, ratio: mgPart / published.mcl };
        } else if (f.targetKind === 'tap' && published.risk !== undefined) {
          compare = {
            kind: 'risk',
            published: published.risk.value,
            ratio: mgPart / published.risk.value,
          };
        }
      }
      rows.push({
        ok: true,
        id: row.id,
        name,
        result,
        targetUgL: target * 1e6,
        targetLabel: label,
        published,
        ...(compare ? { compare } : {}),
        warnings: [...extra, ...result.warnings],
      });
    } catch (e) {
      rows.push({
        ok: false,
        id: row.id,
        name,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
  const notes = [
    'Soil screening guidance: infinite source, uniform contamination to the water table, equilibrium partitioning, no attenuation in soil or aquifer, no NAPL.',
  ];
  if (siteNote) notes.push(siteNote);
  return { ok: true, rows, notes };
}
