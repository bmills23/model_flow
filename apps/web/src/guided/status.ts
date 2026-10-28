import type { GuidedStepId } from '../steps';
import { chain } from './chain';
import { exposureDone } from './exposure';
import { propertiesComplete as catalogComplete } from './propertyCatalog';
import type { GuidedOutputs, GuidedRunNotes, GuidedState } from './state';
import { classifyValue } from './units';

/**
 * The step list's marks (plan section 1, "Re-run marks"). A step is done, to do, or (step 3d only) to
 * run again; "current" is the open route, which the shell adds. Its function reads the project state it is given and two
 * injected checks, so it holds no store and no hash design of its own.
 */

export type StepMark = 'done' | 'todo' | 'run-again' | 'checking';

/**
 * Whether a Run's output for one chemical and feed is current, out of date, not there, blocked (the last
 * Run could not produce it and its inputs have not changed since, so running again changes nothing), or
 * unchecked (there, but the chemical files its hash needs are still loading).
 */
export type OutputState = 'current' | 'stale' | 'missing' | 'blocked' | 'unchecked';
export type OutputCheck = (feedKey: string, chemicalId: string) => OutputState;

/**
 * The output check of plan section 1: an output is current while the inputs hash it recorded at Run
 * equals the live hash of its chemical and model (`guided/hash.ts`), stale when they differ, and missing
 * when the Run left no output. An output with no live hash (its model left the chain) is not current.
 * With the Run's notes, a missing output the Run recorded as unproducible for the same inputs is blocked.
 */
export function hashOutputCheck(
  outputs: GuidedOutputs,
  live: Readonly<Record<string, Readonly<Record<string, string>>>>,
  notes: GuidedRunNotes = {},
): OutputCheck {
  return (feedKey, chemicalId) => {
    const slot = outputs[feedKey]?.[chemicalId];
    if (slot === undefined) {
      const recorded = notes[chemicalId]?.feeds[feedKey];
      return recorded !== undefined && recorded === live[feedKey]?.[chemicalId]
        ? 'blocked'
        : 'missing';
    }
    return slot.inputsHash === live[feedKey]?.[chemicalId] ? 'current' : 'stale';
  };
}

export interface StatusInput {
  chemicals: readonly { id: string }[];
  guided: GuidedState;
  /** Step 3d: whether each output is current (`hashOutputCheck`), injected so marks test with any answer. */
  outputCheck: OutputCheck;
  /**
   * Step 3a: true when no field a chosen model needs is blank. Without one, the property catalog's check
   * (`guided/propertyCatalog.ts`) reads the guided state given here.
   */
  propertiesComplete?: () => boolean;
}

export type GuidedStatus = Record<GuidedStepId, StepMark>;

/**
 * A value counts as entered when a Run can read it: "ND" (not detected, which the Run takes as zero from
 * that medium), "<x" (below the reporting limit, which the Run takes as half of it) or a number above zero. Blank text and text a Run cannot read do not count.
 */
const entered = (v: { value: string } | undefined): boolean => {
  if (v === undefined) return false;
  const k = classifyValue(v.value).kind;
  return k === 'nd' || k === 'below' || k === 'number';
};

export function guidedStatus(input: StatusInput): GuidedStatus {
  const { chemicals, guided, outputCheck } = input;
  const c = chain(guided.site);
  const sound = c.problems.length === 0;
  const hasChemicals = chemicals.length > 0;

  const propertiesDone = sound ? (input.propertiesComplete?.() ?? catalogComplete(guided)) : false;

  const sourcesDone =
    hasChemicals &&
    sound &&
    c.valuesNeeded.length > 0 &&
    chemicals.every((chem) =>
      c.valuesNeeded.every((medium) => entered(guided.sources[chem.id]?.values[medium])),
    );

  let run: StepMark = 'todo';
  if (hasChemicals && sound) {
    let ran = false;
    let allSettled = true;
    let anyCurrent = false;
    let anyUnchecked = false;
    let anyOpen = false;
    for (const chem of chemicals) {
      for (const feed of c.outputs) {
        const state = outputCheck(feed, chem.id);
        if (state !== 'missing') ran = true;
        if (state === 'current') anyCurrent = true;
        // blocked is settled: running again cannot change it until an input does
        if (state !== 'current' && state !== 'blocked') allSettled = false;
        if (state === 'unchecked') anyUnchecked = true;
        else if (state === 'stale' || state === 'missing') anyOpen = true;
      }
    }
    if (anyUnchecked && !anyOpen) run = 'checking';
    else if (allSettled) {
      // nothing to run (values entered directly) is done once the chain is sound; a Run that produced
      // nothing at all (every output blocked) is not done
      run = anyCurrent || c.outputs.length === 0 ? 'done' : 'todo';
    } else run = ran ? 'run-again' : 'todo';
  }

  const exposure: StepMark = exposureDone(guided) ? 'done' : 'todo';

  return {
    chemicals: hasChemicals ? 'done' : 'todo',
    site: sound ? 'done' : 'todo',
    properties: propertiesDone ? 'done' : 'todo',
    sources: sourcesDone ? 'done' : 'todo',
    run,
    // step 4 is one answer read live: a pathway on and receptors that can be built
    pathways: exposure,
    receptors: exposure,
    toxicity: exposure,
    targets: 'todo',
    results: 'todo',
  };
}
