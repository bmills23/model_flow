import { formatReference, references, type Criterion } from '@model-flow/engine';
import type { CsvColumn } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import { feedChemicalProblem } from '../project/feedChemical';
import { pickSlot, type FeedSlots } from '../project/feedSlots';
import { criteriaFor, type CriteriaDb } from '../surfaceWater/criteriaDb';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { SaturatedFeed } from '../saturated/feed';
import type { VadoseFeed } from '../vadose/feed';
import type { SourceKind } from './form';
import { NEEDS_SATURATED, NEEDS_VADOSE } from './modeledBuild';
import { makeSurfaceJob, type SurfaceSolveJob, type SurfaceSolves } from './surfaceSolve';
import {
  interpretSolved,
  LEVEL_PATH_TEXT,
  SEND_AGAIN,
  SOURCE_UNITS,
  sendAgain,
  solvedFor,
  type LevelPath,
} from './surfaceSolved';

/**
 * A surface water cleanup target for one chemical (wave P slice P2): the concentration the surface water
 * must meet, from a shipped NRWQC criterion or a value the user enters with a note. The source level is
 * the target over the surface water run's coefficient for that chemical (peak surface water per unit of
 * the dissolved groundwater source), the same linear route as the surface water source level panel.
 * Wave V slice V2b adds the paths that are not linear in the source: an upstream background and a plume
 * fed by a vadose or saturated source screen are solved against the run's forward model, and a soil
 * source of the cleanup is carried through the run's linked aquifer and bank to the surface water.
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

/**
 * A tabulated surface water criterion value in SI (kg/m3), or null where it needs site inputs or is printed on an
 * element basis (nitrogen as N): the model's concentration is of the chemical itself, so it is no target.
 */
export function criterionSi(c: Criterion): number | null {
  if (c.medium !== 'surfaceWater' || c.value === undefined || !(c.value >= 0)) return null;
  if (c.elementBasis !== undefined) return null;
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
  /** Source level in SI (kg/m3 groundwater, kg/kg soil); null when not quantified or still being solved. */
  level: number | null;
  /** The surface water method id behind the coefficient. */
  surfaceMethod: string | null;
  reason: string | null;
  /** The medium of the source level: dissolved groundwater, or the soil of a source screen. */
  sourceMedium: 'groundwater' | 'soil';
  unit: 'mg/L' | 'mg/kg';
  fromSi: 1e3 | 1e6;
  /** Whether the level is the linear estimate or the inverted forward run; null where there is no level. */
  path: LevelPath | null;
  /** How a solved level ended; null for a linear level. */
  solver: string | null;
  /** The forward-run solve this level waits for or came from; null for a linear level. */
  job: SurfaceSolveJob | null;
  /** True while the level waits for its solve in the worker. */
  pending: boolean;
  warnings: string[];
}

const OUT = { targetUnit: 'ug/L', targetFromSi: 1e6 } as const;
const TARGET_UNIT = { fromSi: 1e6, unit: 'ug/L' } as const;

/** The soil sources the cleanup holds, read for a soil source of the surface water target. */
export interface SurfaceTargetSoil {
  vadose: VadoseFeed | FeedSlots<VadoseFeed> | null | undefined;
  saturated: SaturatedFeed | FeedSlots<SaturatedFeed> | null | undefined;
  /** TPH mode of the search (the cleanup form's setting). */
  tphHeld: boolean;
  /** Soil saturation concentration of each chemical, kg/kg, for the free product warning. */
  csat?: Record<string, number>;
}

/**
 * One row per chemical with a target. Each is the target over the coefficient of that chemical's own
 * surface water slot, or, where that run is not linear in its source, the solve of its forward model
 * (see `surfaceSolve.ts`). A dissolved groundwater source is quantified on the linear route, the
 * background route and, for a plume fed by a source screen, as the soil concentration of that screen. A
 * soil source of the cleanup (vadose, saturated) is carried through the linked aquifer and bank of the
 * surface water run. A level is not quantified, with the reason, where the criterion or value is missing,
 * no surface water result was sent for the chemical, the run recorded no way to solve it, nothing
 * transfers, or the source cannot reach the target up to its limit (the linear route's solubility check
 * included). Until `solves` holds the result of a solved row's job the row is pending.
 */
export function surfaceTargetLevels(args: {
  targets: readonly SurfaceTargetRow[];
  db: CriteriaDb | null;
  slots: SurfaceWaterFeed | FeedSlots<SurfaceWaterFeed> | null | undefined;
  names: Record<string, string>;
  source: SourceKind;
  /** How many chemicals the cleanup run holds (not how many have a target). */
  runCount: number;
  /** The soil sources, for a soil cleanup source. */
  soil?: SurfaceTargetSoil;
  /** The results of the forward-run solves, by job key. */
  solves?: SurfaceSolves;
}): SurfaceTargetLevel[] {
  const { db, slots, names, source, solves } = args;
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
    const groundwater = SOURCE_UNITS.groundwater;
    const base = {
      chemicalId: t.chemicalId,
      chemical,
      feedChemicalId: t.chemicalId,
      target,
      basis,
      citationKey,
      citation,
      note,
      ...OUT,
    };
    const blank = {
      level: null,
      surfaceMethod: null as string | null,
      sourceMedium: 'groundwater' as 'groundwater' | 'soil',
      unit: groundwater.unit as 'mg/L' | 'mg/kg',
      fromSi: groundwater.fromSi as 1e3 | 1e6,
      path: null as LevelPath | null,
      solver: null as string | null,
      job: null as SurfaceSolveJob | null,
      pending: false,
      warnings: [] as string[],
    };
    const none = (why: string, surfaceMethod: string | null = null): SurfaceTargetLevel => ({
      ...base,
      ...blank,
      surfaceMethod,
      reason: why,
    });
    if (reason !== null) return none(reason);
    const soilSource = source === 'vadose' || source === 'saturated';
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
      runCount: args.runCount,
      nameOf,
    });
    if (problem !== null) return none(`${chemical}: ${problem}.`);
    const c = feed.coefficient;

    /** A solved level from a job: pending until its result is in. */
    const solved = (
      job: SurfaceSolveJob,
      surfaceMethod: string | null,
      csat?: number,
    ): SurfaceTargetLevel => {
      const medium: 'groundwater' | 'soil' = job.route === 'groundwater' ? 'groundwater' : 'soil';
      const unit = SOURCE_UNITS[medium];
      const part = {
        ...base,
        ...blank,
        surfaceMethod,
        sourceMedium: medium,
        unit: unit.unit,
        fromSi: unit.fromSi,
        job,
      };
      const got = solvedFor(job, solves, target);
      if (got.pending) return { ...part, reason: null, pending: true };
      if (got.error !== null) return { ...part, reason: got.error };
      if (got.solved === undefined) return { ...part, reason: 'The level was not solved.' };
      const read = interpretSolved(got.solved, medium, TARGET_UNIT, csat);
      return read.level === null
        ? { ...part, reason: read.reason, warnings: read.warnings }
        : {
            ...part,
            level: read.level,
            reason: null,
            path: 'solved',
            solver: read.detail,
            warnings: read.warnings,
          };
    };

    if (soilSource) {
      const kind = source === 'vadose' ? 'vadose' : 'saturated';
      const held = kind === 'vadose' ? args.soil?.vadose : args.soil?.saturated;
      const soilFeed = pickSlot<VadoseFeed | SaturatedFeed>(held, t.chemicalId);
      if (soilFeed === null) {
        return none(
          `${chemical}: ${kind === 'vadose' ? NEEDS_VADOSE : NEEDS_SATURATED}`,
          feed.coefficient?.method ?? null,
        );
      }
      const soilProblem = feedChemicalProblem({
        feed: kind === 'vadose' ? 'vadose zone run' : 'saturated soil source run',
        feedChemical: soilFeed.chemicalId,
        rowId: t.chemicalId,
        runCount: args.runCount,
        nameOf,
      });
      if (soilProblem !== null) return none(`${chemical}: ${soilProblem}.`);
      const method = `surfaceWater.${feed.method}`;
      if (feed.solve === undefined) {
        return none(
          `The surface water run held no request to carry a soil source to the surface water (it was sent before this panel could). ${SEND_AGAIN}`,
          method,
        );
      }
      if (feed.solve.request.link === null) {
        return none(
          'The surface water run is not linked to a groundwater transport run, so it has no aquifer to carry a soil source to the bank; link it to the transport run on the surface water screen and send it again.',
          method,
        );
      }
      const job = makeSurfaceJob({
        request: feed.solve.request,
        method: feed.method,
        route: 'soil',
        soil: {
          ...('scenario' in soilFeed
            ? { vadose: soilFeed.scenario }
            : { saturated: soilFeed.input }),
          tphHeld: args.soil?.tphHeld ?? false,
          label: soilFeed.label,
        },
        targets: target === null ? [] : [target],
      });
      return solved(job, method, args.soil?.csat?.[t.chemicalId]);
    }

    if (c === undefined) {
      return none(
        'The surface water run held no source coefficient (it was sent before this panel existed); send the surface water result again from the surface water screen.',
      );
    }
    if (c.value === null) {
      const route = c.path === 'background' ? 'groundwater' : c.path === 'fed' ? 'fed' : null;
      if (route === null || feed.solve === undefined) {
        const why = c.reason ?? 'The run did not quantify a source coefficient.';
        return none(route === null && c.path !== undefined ? why : sendAgain(why), c.method);
      }
      const job = makeSurfaceJob({
        request: feed.solve.request,
        method: feed.method,
        route,
        targets: target === null ? [] : [target],
      });
      return solved(job, c.method);
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
    return { ...base, ...blank, surfaceMethod: c.method, level, reason: null, path: 'linear' };
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
  { key: 'path', header: 'level path' },
  { key: 'solver', header: 'solve detail' },
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
        source: `${r.sourceMedium === 'soil' ? 'Soil source' : 'Groundwater source'} (surface water target)`,
        unit: r.unit,
        level: r.level === null ? null : r.level * r.fromSi,
        path: r.path === null ? null : r.path,
        solver: r.solver ?? (r.path === 'linear' ? LEVEL_PATH_TEXT.linear : null),
        reason: r.reason,
      })),
      columns: COLUMNS,
      missing: { keys: ['level'], because: 'reason' },
    },
  ];
}
