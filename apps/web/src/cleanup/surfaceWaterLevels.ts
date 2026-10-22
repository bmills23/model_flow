import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import { feedChemicalProblem } from '../project/feedChemical';
import { sourceLevelOfChemical } from './chemicalLevel';
import type { CleanupOutcome } from './compute';

export interface SurfaceWaterLevelRow {
  /** The receptor method of the M5 run the surface water level comes from. */
  method: 'legacy' | 'modern';
  chemical: string;
  /** Groundwater source level in SI (kg/m3); null when not quantified. */
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
  unit: 'mg/L';
  fromSi: 1e3;
  warnings: string[];
}

const UNIT = { unit: 'mg/L', fromSi: 1e3 } as const;

/**
 * The dissolved groundwater source level behind the cleanup screen's surface water level, for the
 * surface water run the screen sent: the surface water level over the run's coefficient (peak surface
 * water per unit of the groundwater source), with no root find. The coefficient is the run's own, so it
 * applies to the chemical the run was made for. A run tagged with its chemical (taken from the transport
 * run it is linked to) is quantified for the cleanup row of that chemical, and every other row is not
 * quantified, with a reason naming both chemicals. An untagged run (sent before the tag existed, or not
 * linked) is taken for a cleanup run of one chemical; with two or more every row is not quantified, with
 * the reason. A level is not quantified, with the reason, where the
 * run recorded no coefficient, the chain is not proportional to its source, nothing transfers, or the
 * source level exceeds the solubility entered on the run; it is never printed as zero.
 */
export function surfaceWaterSourceLevels(
  outcome: CleanupOutcome,
  feed: SurfaceWaterFeed,
  names: Record<string, string> = {},
): SurfaceWaterLevelRow[] {
  const rows: SurfaceWaterLevelRow[] = [];
  const c = feed.coefficient;
  for (const method of ['legacy', 'modern'] as const) {
    const o = outcome[method];
    if (!o.ok) continue;
    const medium = o.result.media.find((m) => m.medium === 'surfaceWater');
    if (!medium) continue;
    const none = (chemical: string, reason: string, mediumLevel: number | null) => {
      rows.push({
        method,
        chemical,
        level: null,
        cancerLevel: null,
        noncancerLevel: null,
        limiting: null,
        mediumLevel,
        surfaceMethod: c?.method ?? null,
        reason,
        ...UNIT,
        warnings: [],
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
        none(lv.chemical, c.reason ?? 'The run did not quantify a source coefficient.', lv.level);
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
        method,
        chemical: lv.chemical,
        level: sl.level,
        cancerLevel: sl.cancerLevel,
        noncancerLevel: sl.noncancerLevel,
        limiting: sl.limiting,
        mediumLevel: sl.mediumLevel,
        surfaceMethod: c.method,
        reason: null,
        ...UNIT,
        warnings: sl.warnings.map((w) => w.message),
      });
    }
  }
  return rows;
}
