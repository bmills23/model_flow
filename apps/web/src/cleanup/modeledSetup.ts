import type { UnitDisplay } from '../uncertainty/DistributionEditor';
import type { UncertainInput } from '@model-flow/engine';
import { FROM_SI, MEDIUM_UNIT } from './build';
import type { Method } from './modeledChains';
import type { ModeledOutcome, ModeledRequest } from './modeledTypes';
import { modeledDisplays, modeledUncertainInputs } from './modeledUncertainty';

/**
 * What the modeled-source panel runs for one method, built on the main thread from the screen's
 * request and its solved outcome. Kept apart from `modeledUncertainty.ts`, which the uncertainty
 * worker loads, so the worker bundle does not pull in the screen's form modules.
 */

export interface ModeledSetup {
  ok: true;
  method: Method;
  request: ModeledRequest;
  model: { uncertainInputs: readonly UncertainInput<ModeledRequest>[] };
  displays: Record<string, UnitDisplay>;
  /** Screen unit of the solved concentration and the factor from SI to it. */
  unit: string;
  fromSi: number;
  /** The screen's own level for the point values, SI; null when not reachable. */
  deterministic: number | null;
  /** The chain's search ceiling, SI; censored iterations sit there. */
  cap: number | undefined;
}

export type ModeledSetupBuild = ModeledSetup | { ok: false; error: string };

/**
 * The setup of one method from the screen's request and the outcome its worker solved: the
 * deterministic level and the cap come from that solve, so nothing is solved on this thread.
 */
export function buildModeledSetup(
  req: ModeledRequest,
  outcome: ModeledOutcome,
  method: Method,
): ModeledSetupBuild {
  const m = outcome[method];
  if (!m) return { ok: false, error: `The ${method} method was not solved for this source.` };
  if (!m.ok) return { ok: false, error: m.error };
  const inputs = modeledUncertainInputs(req, method);
  return {
    ok: true,
    method,
    request: req,
    model: { uncertainInputs: inputs },
    displays: modeledDisplays(inputs),
    unit: MEDIUM_UNIT(outcome.medium),
    fromSi: FROM_SI(outcome.medium),
    deterministic: m.run.result.levels[0]?.level ?? null,
    cap: m.run.cap ?? undefined,
  };
}
