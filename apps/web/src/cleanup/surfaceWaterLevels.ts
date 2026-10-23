import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import { feedChemicalProblem } from '../project/feedChemical';
import { sourceLevelOfChemical } from './chemicalLevel';
import type { CleanupOutcome } from './compute';
import { makeSurfaceJob, type SurfaceSolveJob, type SurfaceSolves } from './surfaceSolve';
import {
  interpretSolved,
  sendAgain,
  solvedFor,
  SOURCE_UNITS,
  type LevelPath,
} from './surfaceSolved';

export interface SurfaceWaterLevelRow {
  /** The receptor method of the M5 run the surface water level comes from. */
  method: 'legacy' | 'modern';
  chemical: string;
  /** Source level in SI (kg/m3 groundwater, kg/kg soil); null when not quantified or still being solved. */
  level: number | null;
  cancerLevel: number | null;
  noncancerLevel: number | null;
  limiting: string | null;
  /** The surface water level the source level reproduces, kg/m3. */
  mediumLevel: number | null;
  /** The surface water method id behind the coefficient, when one was recorded. */
  surfaceMethod: string | null;
  /** Why the level is not quantified; null when it is. */
  reason: string | null;
  /** The medium the source level is in: the dissolved groundwater, or the soil of the screen feeding the plume. */
  sourceMedium: 'groundwater' | 'soil';
  unit: 'mg/L' | 'mg/kg';
  fromSi: 1e3 | 1e6;
  /** Whether the level is the linear estimate or the inverted forward run; null where there is no level. */
  path: LevelPath | null;
  /** How a solved level ended (shortcut or Brent); null for a linear level. */
  solver: string | null;
  /** The forward-run solve this level waits for or came from; null for a linear level. */
  job: SurfaceSolveJob | null;
  /** True while the level waits for its solve in the worker. */
  pending: boolean;
  warnings: string[];
}

const GROUNDWATER = SOURCE_UNITS.groundwater;
const SURFACE_UNIT = { fromSi: 1e3, unit: 'mg/L' } as const;

/**
 * The source level behind the cleanup screen's surface water level, for the surface water run the screen
 * sent. Where the run is linear in its source the level is the surface water level over the run's
 * coefficient (peak surface water per unit of the groundwater source), with no root find, as before. Where
 * it is not (an upstream background, a plume fed by a vadose or saturated source screen) the level is
 * solved against the run's own forward model with the engine's root find (wave V slice V2b): the
 * groundwater concentration of the dissolved source, or for a fed plume the soil concentration of the
 * screen feeding it. Those solves run in the worker; until `solves` holds a job's result the row is
 * pending (`job` says what to solve). The coefficient is the run's own, so it applies to the chemical the
 * run was made for. A run tagged with its chemical (taken from the transport run it is linked to) is
 * quantified for the cleanup row of that chemical, and every other row is not quantified, with a reason
 * naming both chemicals. An untagged run (sent before the tag existed, or not linked) is taken for a
 * cleanup run of one chemical; with two or more every row is not quantified, with the reason. A level is
 * not quantified, with the reason, where the run recorded no coefficient, nothing transfers, the source
 * cannot reach the level up to its limit, or (linear route) the source level exceeds the solubility
 * entered on the run; it is never printed as zero.
 */
export function surfaceWaterSourceLevels(
  outcome: CleanupOutcome,
  feed: SurfaceWaterFeed,
  names: Record<string, string> = {},
  solves?: SurfaceSolves,
  csat?: Record<string, number>,
): SurfaceWaterLevelRow[] {
  const rows: SurfaceWaterLevelRow[] = [];
  const c = feed.coefficient;
  // the surface water levels of both receptor methods for a chemical (governing, cancer and noncancer):
  // one job solves them all against one forward model
  const targetsOf = (chemical: string): number[] => {
    const out = new Set<number>();
    for (const m of ['legacy', 'modern'] as const) {
      const om = outcome[m];
      if (!om.ok) continue;
      const md = om.result.media.find((x) => x.medium === 'surfaceWater');
      for (const l of md?.levels ?? []) {
        if (l.chemical !== chemical) continue;
        for (const t of [l.level, l.cancerLevel, l.noncancerLevel]) {
          if (t !== null && t > 0) out.add(t);
        }
      }
    }
    return [...out];
  };
  for (const method of ['legacy', 'modern'] as const) {
    const o = outcome[method];
    if (!o.ok) continue;
    const medium = o.result.media.find((m) => m.medium === 'surfaceWater');
    if (!medium) continue;
    const blank = (): Omit<
      SurfaceWaterLevelRow,
      'method' | 'chemical' | 'mediumLevel' | 'surfaceMethod' | 'reason'
    > => ({
      level: null,
      cancerLevel: null,
      noncancerLevel: null,
      limiting: null,
      sourceMedium: 'groundwater',
      unit: GROUNDWATER.unit,
      fromSi: GROUNDWATER.fromSi,
      path: null,
      solver: null,
      job: null,
      pending: false,
      warnings: [],
    });
    const none = (chemical: string, reason: string, mediumLevel: number | null) => {
      rows.push({
        ...blank(),
        method,
        chemical,
        mediumLevel,
        surfaceMethod: c?.method ?? null,
        reason,
      });
    };
    for (const lv of medium.levels) {
      const problem = feedChemicalProblem({
        feed: 'surface water result',
        feedChemical: feed.chemicalId,
        rowId: lv.chemical,
        runCount: medium.levels.length,
        nameOf: (id) => names[id] ?? id,
      });
      if (problem !== null) {
        none(lv.chemical, `${names[lv.chemical] ?? lv.chemical}: ${problem}.`, lv.level);
        continue;
      }
      if (c === undefined) {
        none(
          lv.chemical,
          'The surface water run held no source coefficient (it was sent before this panel existed); send the surface water result again from the surface water screen.',
          lv.level,
        );
        continue;
      }
      if (c.value === null) {
        // a path that is not linear in the source: solved when the run holds its own request
        const route = c.path === 'background' ? 'groundwater' : c.path === 'fed' ? 'fed' : null;
        const solve = feed.solve;
        if (route === null || solve === undefined) {
          const why = c.reason ?? 'The run did not quantify a source coefficient.';
          none(
            lv.chemical,
            route === null && c.path !== undefined ? why : sendAgain(why),
            lv.level,
          );
          continue;
        }
        if (lv.level === null) {
          none(lv.chemical, 'There is no surface water level to trace to a source.', null);
          continue;
        }
        const job = makeSurfaceJob({
          request: solve.request,
          method: feed.method,
          route,
          targets: targetsOf(lv.chemical),
        });
        const unit = SOURCE_UNITS[route === 'groundwater' ? 'groundwater' : 'soil'];
        const part = {
          ...blank(),
          method,
          chemical: lv.chemical,
          mediumLevel: lv.level,
          surfaceMethod: c.method,
          sourceMedium: route === 'groundwater' ? ('groundwater' as const) : ('soil' as const),
          unit: unit.unit,
          fromSi: unit.fromSi,
          job,
        };
        const got = solvedFor(job, solves, lv.level);
        if (got.pending) {
          rows.push({ ...part, reason: null, pending: true });
          continue;
        }
        if (got.error !== null) {
          rows.push({ ...part, reason: got.error });
          continue;
        }
        const csatOf = csat?.[lv.chemical];
        const read = (t: number | null) =>
          t === null || solvedFor(job, solves, t).solved === undefined
            ? null
            : interpretSolved(solvedFor(job, solves, t).solved!, got.medium, SURFACE_UNIT, csatOf);
        const main = read(lv.level);
        const cancer = read(lv.cancerLevel);
        const noncancer = read(lv.noncancerLevel);
        rows.push({
          ...part,
          level: main?.level ?? null,
          cancerLevel: cancer?.level ?? null,
          noncancerLevel: noncancer?.level ?? null,
          limiting: main?.level != null ? lv.limiting : null,
          reason: main?.level != null ? null : (main?.reason ?? 'The level was not solved.'),
          path: main?.level != null ? 'solved' : null,
          solver: main?.level != null ? main.detail : null,
          warnings: main?.warnings ?? [],
        });
        continue;
      }
      const sl = sourceLevelOfChemical(o.result, 'surfaceWater', lv.chemical, c.value)!;
      if (sl.level === null) {
        none(
          lv.chemical,
          sl.warnings[0]?.message ?? 'There is no surface water level to trace to a source.',
          lv.level,
        );
        continue;
      }
      if (c.solubility !== undefined && sl.level > c.solubility) {
        none(
          lv.chemical,
          `The source level would exceed the solubility entered on the surface water run (${c.solubility * 1e3} mg/L), so a dissolved groundwater source cannot reach it.`,
          lv.level,
        );
        continue;
      }
      rows.push({
        ...blank(),
        method,
        chemical: lv.chemical,
        level: sl.level,
        cancerLevel: sl.cancerLevel,
        noncancerLevel: sl.noncancerLevel,
        limiting: sl.limiting,
        mediumLevel: sl.mediumLevel,
        surfaceMethod: c.method,
        reason: null,
        path: 'linear',
        warnings: sl.warnings.map((w) => w.message),
      });
    }
  }
  return rows;
}
