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
  /** True when a seasonal schedule did not fit the cap and the annual mean was fed instead. */
  fallback: boolean;
}

const withSchedule = (i: SaturatedSourceInput, kind: 'annual-mean' | 'seasonal') => ({
  ...i,
  source: { ...i.source, schedule: kind },
});

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
 * The loading steps a saturated-fed groundwater run uses. Each step carries exactly the mass the
 * release schedule delivers over it, so the cap bounds the superposition cost without changing the
 * loaded mass. The legacy annual mean is one step; a modern schedule is cut into steps of at least
 * `stepLength`, lengthened as needed to stay within the cap.
 *
 * A seasonal schedule has two segments per year that must stay separate steps. It is kept by
 * lengthening the steps up to one segment per step; only when the segments alone exceed the cap
 * (more than about 24 years of release) does the feed fall back to the annual mean, with
 * `fallback` set so the screen can say so (DECISIONS.md, 2026-10-16).
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
    return {
      steps: stepsFor(withSchedule(input, 'annual-mean'), method, time, stepLength),
      fallback: true,
    };
  }
  let len = stepLength;
  for (;;) {
    const steps = stepsFor(input, method, time, len);
    if (steps.length <= maxSteps) return { steps, fallback: false };
    // at a step length of a year or more each season is one step; longer cannot reduce the count
    if (len >= YEAR) break;
    len = Math.min(len * 1.5, YEAR);
  }
  return {
    steps: stepsFor(withSchedule(input, 'annual-mean'), method, time, stepLength),
    fallback: true,
  };
}
