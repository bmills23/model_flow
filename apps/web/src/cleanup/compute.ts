import { backCalculateLegacy, backCalculateModern, type DirectResult } from '@model-flow/engine';
import type { CleanupLegacyInput, CleanupModernInput } from './build';

export type MethodOutcome<R> = { ok: true; result: R } | { ok: false; error: string };

export interface CleanupOutcome {
  legacy: MethodOutcome<DirectResult>;
  modern: MethodOutcome<DirectResult>;
}

function attempt<I>(run: (input: I) => DirectResult, input: I): MethodOutcome<DirectResult> {
  try {
    return { ok: true, result: run(input) };
  } catch (e) {
    // The engine throws RangeError for inputs it refuses; one method refusing does not stop the other.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Runs both methods on the same scenario; an input one of them refuses is reported for it alone. */
export function runCleanup(inputs: {
  legacy: CleanupLegacyInput;
  modern: CleanupModernInput;
}): CleanupOutcome {
  return {
    legacy: attempt(backCalculateLegacy, inputs.legacy),
    modern: attempt(backCalculateModern, inputs.modern),
  };
}
