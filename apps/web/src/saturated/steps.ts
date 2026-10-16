import {
  releaseToLoadingSteps,
  runExponential,
  runTwoRegion,
  type LoadingStep,
  type SaturatedSourceInput,
} from '@model-flow/engine';
import type { SaturatedMethod } from './feed';

/** Step cap of a saturated-fed schedule: the same bound the vadose feed uses (see transport/compute). */
export const FED_MAX_STEPS = 48;
const YEAR = 365.25 * 86400;

export interface FedSteps {
  steps: LoadingStep[];
  /**
   * True when a seasonal schedule did not fit the cap and was fed as whole-year steps instead: each
   * step carries the seasonal schedule's exact mass over its span, so the cumulative mass is exact at
   * every step boundary and the within-step seasonal timing is lost.
   */
  fallback: boolean;
}

function stepsFor(
  input: SaturatedSourceInput,
  method: SaturatedMethod,
  time: number,
  stepLength: number,
): LoadingStep[] {
  if (method === 'legacy') {
    // the legacy method has no source decay; the shared input may carry one for the modern run
    const { sourceDecayRate: _d, ...legacy } = input;
    void _d;
    return releaseToLoadingSteps(runTwoRegion({ ...legacy, tEnd: time }), time, stepLength);
  }
  return releaseToLoadingSteps(runExponential({ ...input, tEnd: time }), time, stepLength);
}

/**
 * Whole-year steps of a seasonal schedule: boundaries at multiples of n years (n chosen so the count
 * stays within the cap), ending at the horizon or, for the legacy method, the depletion time. Each
 * step carries the schedule's exact delivered mass over its span, with or without source decay.
 */
function coarseSeasonalSteps(
  input: SaturatedSourceInput,
  method: SaturatedMethod,
  time: number,
  maxSteps: number,
): LoadingStep[] {
  let schedule;
  let end = time;
  if (method === 'legacy') {
    const { sourceDecayRate: _d, ...legacy } = input;
    void _d;
    const out = runTwoRegion({ ...legacy, tEnd: time });
    schedule = out.schedule;
    end = Math.min(time, out.depletionTime);
  } else {
    schedule = runExponential({ ...input, tEnd: time }).schedule;
  }
  if (!(end > 0)) return [];
  const years = Math.max(1, Math.ceil(((end / YEAR) * (1 - 1e-12)) / maxSteps));
  const span = years * YEAR;
  const count = Math.max(1, Math.ceil((end / span) * (1 - 1e-12)));
  const steps: LoadingStep[] = [];
  for (let k = 0; k < count; k++) {
    const start = k * span;
    const stop = k === count - 1 ? end : (k + 1) * span;
    const mass = schedule.delivered(stop) - schedule.delivered(start);
    steps.push({ start, end: stop, rate: Math.max(0, mass) / (stop - start) });
  }
  return steps;
}

/**
 * The loading steps a saturated-fed groundwater run uses. Each step carries exactly the mass the
 * release schedule delivers over it, so the cap bounds the superposition cost without changing the
 * loaded mass. The legacy annual mean is one step; a modern schedule is cut into steps of at least
 * `stepLength`, lengthened as needed to stay within the cap.
 *
 * A seasonal schedule has two segments per year that must stay separate steps. It is kept by
 * lengthening the steps up to one segment per step; only when the segments alone exceed the cap
 * (more than about 24 years of release) does the feed fall back to whole-year steps that each
 * carry the seasonal schedule's exact mass, so the cumulative mass is exact at every step boundary
 * and only the timing within a step is lost, with `fallback` set so the screen can say so
 * (DECISIONS.md, 2026-10-16).
 */
export function saturatedFedSteps(
  input: SaturatedSourceInput,
  method: SaturatedMethod,
  time: number,
  stepLength: number,
  maxSteps: number = FED_MAX_STEPS,
): FedSteps {
  const seasonal = (input.source.schedule ?? 'annual-mean') === 'seasonal';
  if (!seasonal) return { steps: stepsFor(input, method, time, stepLength), fallback: false };
  // far beyond the cap even at one step per season: do not generate the segments at all
  if (method === 'modern' && (2 * time) / YEAR > 4 * maxSteps) {
    return { steps: coarseSeasonalSteps(input, method, time, maxSteps), fallback: true };
  }
  let len = stepLength;
  for (;;) {
    const steps = stepsFor(input, method, time, len);
    if (steps.length <= maxSteps) return { steps, fallback: false };
    // at a step length of a year or more each season is one step; longer cannot reduce the count
    if (len >= YEAR) break;
    len = Math.min(len * 1.5, YEAR);
  }
  return { steps: coarseSeasonalSteps(input, method, time, maxSteps), fallback: true };
}
