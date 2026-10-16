import type { At123dAquifer, BoxSource, LoadingStep } from '../groundwater/kernel.js';
import { waterTableSource } from '../vadose/coupling.js';
import { finite, pos } from './checks.js';
import { waterLevels, type SourceGeometry } from './geometry.js';
import { YEAR_SECONDS, type ReleaseSchedule } from './release.js';

/**
 * Coupling of the saturated source into the groundwater (M1) methods.
 *
 * The release is a mass rate with a closed-form cumulative, so the loading steps are built from the
 * schedule's natural constant-rate segments (a legacy rate has a jump at the depletion time that an
 * interpolant would smear). Every step carries exactly the mass delivered over it, so the loaded
 * mass equals `delivered(tEnd)` to rounding. `toConcentrationSteps` and `loadedMass` from the vadose
 * coupling serve the Wexler and Domenico source-basis conversion unchanged.
 */

const MONTH = YEAR_SECONDS / 12;

/** Anything carrying a release schedule, such as the output of either saturated source method. */
export interface ScheduleSource {
  schedule: ReleaseSchedule;
}

/**
 * Cut a release schedule into constant-rate loading steps up to tEnd. Boundaries always include the
 * depletion time (legacy) and the seasonal switch times that fall before tEnd. A legacy segment is
 * one step; a modern segment is cut into equal steps no longer than `stepLength` (default one month).
 * The list ends at min(tEnd, depletion time) and is empty when nothing is released.
 */
export function releaseToLoadingSteps(
  result: ScheduleSource,
  tEnd: number,
  stepLength: number = MONTH,
): LoadingStep[] {
  finite('tEnd', tEnd);
  if (!(tEnd > 0)) throw new RangeError(`tEnd must be positive, got ${tEnd}`);
  pos('stepLength', stepLength);
  const sch = result.schedule;
  const steps: LoadingStep[] = [];
  const push = (start: number, end: number): void => {
    const mass = sch.delivered(end) - sch.delivered(start);
    steps.push({ start, end, rate: Math.max(0, mass) / (end - start) });
  };
  if (!(sch.meanRate > 0) && sch.exponent === 0) return [];
  for (const seg of sch.segments(tEnd)) {
    if (sch.exponent === 0) {
      push(seg.start, seg.end);
      continue;
    }
    const len = seg.end - seg.start;
    const n = Math.max(1, Math.ceil((len / stepLength) * (1 - 1e-12)));
    for (let k = 0; k < n; k++) {
      push(
        k === 0 ? seg.start : seg.start + (k * len) / n,
        k === n - 1 ? seg.end : seg.start + ((k + 1) * len) / n,
      );
    }
  }
  return steps;
}

/**
 * The AT123D box the release enters: plan length by width at x in [-L, 0] (the screen convention),
 * from the water table down to the high-water saturated thickness. Infinitely deep aquifers use the
 * no-flux water table at z = 0 (z in [-hHi, 0]); a finite layer of thickness b uses [b - hHi, b]
 * (hHi > b is a RangeError). With hHi = 0 (a source wholly above the water table) the box collapses
 * to the vadose water-table patch. `top: 'unbounded'` is a RangeError, as in `waterTableSource`.
 */
export function saturatedSourceBox(
  input: { source: SourceGeometry },
  aquifer: At123dAquifer,
): BoxSource {
  const g = input.source;
  const { hHi } = waterLevels(g);
  if (hHi === 0) return waterTableSource(g.length, g.width, { xStart: -g.length, aquifer });
  if (aquifer.thickness === undefined && aquifer.top === 'unbounded') {
    throw new RangeError(
      "A saturated source on an infinitely deep aquifer needs top: 'no-flux' (the default; a water table at z = 0); the unbounded medium loses half of the loaded mass upward",
    );
  }
  const b = aquifer.thickness;
  if (b !== undefined && hHi > b) {
    throw new RangeError(
      `the high-water saturated thickness (${hHi} m) exceeds the aquifer thickness (${b} m)`,
    );
  }
  const top = b ?? 0;
  return {
    x1: -g.length,
    x2: 0,
    y1: -g.width / 2,
    y2: g.width / 2,
    z1: top - hHi,
    z2: top,
  };
}
