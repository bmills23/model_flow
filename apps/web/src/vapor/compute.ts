import {
  jeEpaIndoor,
  jeLegacyIndoor,
  type EpaJeInput,
  type EpaJeResult,
  type LegacyJeInput,
  type LegacyJeResult,
} from '@model-flow/engine';

export type MethodOutcome<R> = { ok: true; result: R } | { ok: false; error: string };

export interface VaporOutcome {
  legacy: MethodOutcome<LegacyJeResult>;
  modern: MethodOutcome<EpaJeResult>;
}

function attempt<I, R>(run: (input: I) => R, input: I): MethodOutcome<R> {
  try {
    return { ok: true, result: run(input) };
  } catch (e) {
    // The engine throws RangeError for inputs it refuses; one method refusing does not stop the other.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Runs both indoor air methods on the same scenario. */
export function runVapor(inputs: { legacy: LegacyJeInput; modern: EpaJeInput }): VaporOutcome {
  return {
    legacy: attempt(jeLegacyIndoor, inputs.legacy),
    modern: attempt(jeEpaIndoor, inputs.modern),
  };
}
