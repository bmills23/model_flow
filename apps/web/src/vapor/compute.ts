import {
  devaullRun,
  jeEpaIndoor,
  jeLegacyIndoor,
  type DevaullResult,
  type EpaJeInput,
  type EpaJeResult,
  type LegacyJeInput,
  type LegacyJeResult,
} from '@model-flow/engine';
import type { DevaullParse } from './oxygenLimited';

export type MethodOutcome<R> = { ok: true; result: R } | { ok: false; error: string };

export interface VaporOutcome {
  legacy: MethodOutcome<LegacyJeResult>;
  modern: MethodOutcome<EpaJeResult>;
  /** The oxygen-limited method; present only when it is the method chosen. */
  devaull?: MethodOutcome<DevaullResult>;
}

function attempt<I, R>(run: (input: I) => R, input: I): MethodOutcome<R> {
  try {
    return { ok: true, result: run(input) };
  } catch (e) {
    // The engine throws RangeError for inputs it refuses; one method refusing does not stop the other.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Runs the indoor air methods on the same scenario (the oxygen-limited one only when it was parsed). */
export function runVapor(inputs: {
  legacy: LegacyJeInput;
  modern: EpaJeInput;
  devaull?: DevaullParse | undefined;
}): VaporOutcome {
  const out: VaporOutcome = {
    legacy: attempt(jeLegacyIndoor, inputs.legacy),
    modern: attempt(jeEpaIndoor, inputs.modern),
  };
  const d = inputs.devaull;
  if (d) {
    out.devaull = d.ok ? attempt(devaullRun, d.input) : { ok: false, error: d.errors.join('; ') };
  }
  return out;
}
