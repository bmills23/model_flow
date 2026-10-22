import { formatReference, references, type Criterion } from '@model-flow/engine';
import type { CsvColumn } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import { feedChemicalProblem } from '../project/feedChemical';
import { pickSlot, type FeedSlots } from '../project/feedSlots';
import { criteriaFor, type CriteriaDb } from '../surfaceWater/criteriaDb';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { SourceKind } from './form';

/**
 * A surface water cleanup target for one chemical (wave P slice P2): the concentration the surface water
 * must meet, from a shipped NRWQC criterion or a value the user enters with a note. The source level is
 * the target over the surface water run's coefficient for that chemical (peak surface water per unit of
 * the dissolved groundwater source), the same linear route as the surface water source level panel.
 */
export type SurfaceTargetKind = 'none' | 'nrwqc' | 'user';

export interface SurfaceTargetRow {
  chemicalId: string;
  kind: SurfaceTargetKind;
  /** The chosen NRWQC criterion id; blank takes the default (see `defaultCriterion`). */
  criterionId: string;
  /** The user's target, ug/L (the unit the criteria tables print). */
  value: string;
  /** Where a user value comes from; required for a user value. */
  note: string;
}

export const newSurfaceTarget = (chemicalId: string): SurfaceTargetRow => ({
  chemicalId,
  kind: 'none',
  criterionId: '',
  value: '',
  note: '',
});

/** The kinds of criterion tried, in order, when the user has not chosen one. */
export const DEFAULT_CRITERION_ENDPOINTS: readonly string[] = [
  'aquatic-freshwater-chronic',
  'human-health-water-organism',
];

export const USER_VALUE_BASIS = 'User value (this project)';

const UG_PER_L_TO_SI = 1e-6;
const MG_PER_L_TO_SI = 1e-3;

/** A tabulated surface water criterion value in SI (kg/m3), or null where it needs site inputs. */
export function criterionSi(c: Criterion): number | null {
  if (c.medium !== 'surfaceWater' || c.value === undefined || !(c.value >= 0)) return null;
  return c.value * (c.unit === 'mg/L' ? MG_PER_L_TO_SI : UG_PER_L_TO_SI);
}

/** The tabulated (no hardness or site inputs) surface water criteria a chemical has, as the user can pick. */
export function choosableCriteria(db: CriteriaDb, chemicalId: string): Criterion[] {
  return criteriaFor(db, chemicalId, 'surfaceWater').filter((c) => criterionSi(c) !== null);
}

/** The criterion taken when none is chosen: the first of `DEFAULT_CRITERION_ENDPOINTS` the chemical has. */
export function defaultCriterion(db: CriteriaDb, chemicalId: string): Criterion | undefined {
  const list = choosableCriteria(db, chemicalId);
  for (const endpoint of DEFAULT_CRITERION_ENDPOINTS) {
    const c = list.find((x) => x.endpoint === endpoint);
    if (c) return c;
  }
  return undefined;
}

/** A criterion's kind as text, for example "human-health water-organism". */
export function criterionBasis(c: Criterion): string {
  return c.endpoint.startsWith('human-health-')
    ? `human-health ${c.endpoint.slice('human-health-'.length)}`
    : c.endpoint.replace(/-/g, ' ');
}

/** The reference key of the table a criterion id comes from. */
export function criterionCitationKey(c: Criterion): string {
  return c.id.startsWith('hh:') ? 'epanrwqchh' : 'epanrwqc';
}

function citationText(key: string): string {
  const ref = references.find((r) => r.key === key);
  return ref ? formatReference(ref) : key;
}

export interface SurfaceTargetLevel {
  chemicalId: string;
  chemical: string;
  /** The chemical whose surface water slot is read (for the stale mark). */
  feedChemicalId: string;
  /** The target in SI (kg/m3); null where it could not be found. */
  target: number | null;
  targetUnit: 'ug/L';
  /** SI to the unit the target prints in. */
  targetFromSi: 1e6;
  /** What the target is: the criterion kind, or the user value. */
  basis: string;
  /** The reference key behind an NRWQC target; null for a user value. */
  citationKey: string | null;
  /** The full citation of an NRWQC target, or "User value (this project)". */
  citation: string;
  /** The user's note; blank for an NRWQC target. */
  note: string;
  /** Groundwater source level in SI (kg/m3); null when not quantified. */
  level: number | null;
  /** The surface water method id behind the coefficient. */
  surfaceMethod: string | null;
  reason: string | null;
  unit: 'mg/L';
  fromSi: 1e3;
}

const OUT = { targetUnit: 'ug/L', targetFromSi: 1e6, unit: 'mg/L', fromSi: 1e3 } as const;

/**
 * One row per chemical with a target. Each is the target over the coefficient of that chemical's own
 * surface water slot. A level is not quantified, with the reason, where the source is not a dissolved
 * groundwater source, the criterion or value is missing, no surface water result was sent for the
 * chemical, the run recorded no coefficient, or the source level would exceed the run's solubility.
 */
export function surfaceTargetLevels(args: {
  targets: readonly SurfaceTargetRow[];
  db: CriteriaDb | null;
  slots: SurfaceWaterFeed | FeedSlots<SurfaceWaterFeed> | null | undefined;
  names: Record<string, string>;
  source: SourceKind;
}): SurfaceTargetLevel[] {
  const { db, slots, names, source } = args;
  const active = args.targets.filter((t) => t.kind !== 'none');
  const nameOf = (id: string): string => names[id] ?? id;
  return active.map((t): SurfaceTargetLevel => {
    const chemical = nameOf(t.chemicalId);
    let target: number | null = null;
    let basis = USER_VALUE_BASIS;
    let citationKey: string | null = null;
    let citation = USER_VALUE_BASIS;
    let note = '';
    let reason: string | null = null;
    if (t.kind === 'user') {
      note = t.note.trim();
      const v = Number(t.value.trim());
      if (t.value.trim() === '') reason = `${chemical}: enter the surface water target (ug/L).`;
      else if (!Number.isFinite(v) || v <= 0)
        reason = `${chemical}: the surface water target must be a number above zero (ug/L).`;
      else if (note === '')
        reason = `${chemical}: a user value needs a note saying where it comes from.`;
      else target = v * UG_PER_L_TO_SI;
    } else if (db === null) {
      reason = `${chemical}: the criteria tables are still loading.`;
    } else {
      const c =
        t.criterionId !== ''
          ? choosableCriteria(db, t.chemicalId).find((x) => x.id === t.criterionId)
          : defaultCriterion(db, t.chemicalId);
      if (!c) {
        reason =
          t.criterionId !== ''
            ? `${chemical}: the chosen criterion is not in the NRWQC tables with a value; choose another or enter your own value.`
            : `${chemical}: there is no NRWQC surface water criterion with a tabulated value (freshwater chronic or human health, water and organism); choose another kind or enter your own value.`;
      } else {
        target = criterionSi(c);
        basis = criterionBasis(c);
        citationKey = criterionCitationKey(c);
        citation = citationText(citationKey);
      }
    }
    const base = {
      chemicalId: t.chemicalId,
      chemical,
      feedChemicalId: t.chemicalId,
      target,
      basis,
      citationKey,
      citation,
      note,
      surfaceMethod: null as string | null,
      ...OUT,
    };
    const none = (why: string, surfaceMethod: string | null = null): SurfaceTargetLevel => ({
      ...base,
      surfaceMethod,
      level: null,
      reason: why,
    });
    if (reason !== null) return none(reason);
    if (source === 'vadose' || source === 'saturated') {
      return none(
        `${chemical}: a surface water target applies to a dissolved groundwater source only; this cleanup source is soil.`,
      );
    }
    const feed = pickSlot(slots, t.chemicalId);
    if (feed === null) {
      return none(
        `${chemical}: no surface water result has been sent; run the surface water screen for ${chemical} and send it.`,
      );
    }
    const problem = feedChemicalProblem({
      feed: 'surface water result',
      feedChemical: feed.chemicalId,
      rowId: t.chemicalId,
      runCount: args.targets.length,
      nameOf,
    });
    if (problem !== null) return none(`${chemical}: ${problem}.`);
    const c = feed.coefficient;
    if (c === undefined) {
      return none(
        'The surface water run held no source coefficient (it was sent before this panel existed); send the surface water result again from the surface water screen.',
      );
    }
    if (c.value === null) {
      return none(c.reason ?? 'The run did not quantify a source coefficient.', c.method);
    }
    if (!(c.value > 0)) {
      return none('There is no surface water concentration per unit of source to trace.', c.method);
    }
    const level = target! / c.value;
    if (c.solubility !== undefined && level > c.solubility) {
      return none(
        `The source level would exceed the solubility entered on the surface water run (${c.solubility * 1e3} mg/L), so a dissolved groundwater source cannot reach it.`,
        c.method,
      );
    }
    return { ...base, surfaceMethod: c.method, level, reason: null };
  });
}

/** The targets of the chemicals the run holds, in the run's order; a target of a removed chemical is not used. */
export function targetsOfChemicals(
  targets: readonly SurfaceTargetRow[],
  chemicalIds: readonly string[],
): SurfaceTargetRow[] {
  return chemicalIds.flatMap((id) => targets.filter((t) => t.chemicalId === id).slice(0, 1));
}

const COLUMNS: CsvColumn[] = [
  { key: 'chemical', header: 'chemical' },
  { key: 'target', header: 'surface water target' },
  { key: 'targetUnit', header: 'target unit' },
  { key: 'basis', header: 'target basis' },
  { key: 'citation', header: 'citation' },
  { key: 'note', header: 'note' },
  { key: 'sourceMethod', header: 'surface water method' },
  { key: 'source', header: 'source' },
  { key: 'unit', header: 'unit' },
  { key: 'level', header: 'source level' },
  { key: 'reason', header: 'not quantified because' },
];

/** The surface water target levels as one CSV table, in the screen units at full precision. */
export function surfaceTargetTables(rows: readonly SurfaceTargetLevel[]): CsvTable[] {
  if (rows.length === 0) return [];
  return [
    {
      name: 'cleanup-surface-water-targets',
      editions: rows.some((r) => r.citationKey !== null) ? ['nrwqc'] : [],
      label: 'surface water target source levels',
      feeds: rows.map((r) => ({ feed: 'surfaceWater' as const, chemicalId: r.feedChemicalId })),
      rows: rows.map((r) => ({
        chemical: r.chemical,
        target: r.target === null ? null : r.target * r.targetFromSi,
        targetUnit: r.targetUnit,
        basis: r.basis,
        citation: r.citation,
        note: r.note,
        sourceMethod: r.surfaceMethod,
        source: 'Groundwater source (surface water target)',
        unit: r.unit,
        level: r.level === null ? null : r.level * r.fromSi,
        reason: r.reason,
      })),
      columns: COLUMNS,
    },
  ];
}
