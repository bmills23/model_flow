import {
  runLegacyScenario,
  runModernScenario,
  type LegacyScenarioInput,
  type LegacyScenarioResult,
  type ModernScenarioInput,
  type ModernScenarioResult,
} from '@model-flow/engine';

export type MethodOutcome<R> = { ok: true; result: R } | { ok: false; error: string };

export interface RiskOutcome {
  legacy: MethodOutcome<LegacyScenarioResult>;
  modern: MethodOutcome<ModernScenarioResult>;
}

function attempt<I, R>(run: (input: I) => R, input: I): MethodOutcome<R> {
  try {
    return { ok: true, result: run(input) };
  } catch (e) {
    // The engine throws RangeError for inputs it refuses; one method refusing does not stop the other.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Runs both methods on the same scenario; an input one of them refuses is reported for it alone. */
export function runRisk(inputs: {
  legacy: LegacyScenarioInput;
  modern: ModernScenarioInput;
}): RiskOutcome {
  return {
    legacy: attempt(runLegacyScenario, inputs.legacy),
    modern: attempt(runModernScenario, inputs.modern),
  };
}
