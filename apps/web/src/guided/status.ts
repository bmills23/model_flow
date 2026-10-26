import type { GuidedStepId } from '../steps';
import { getGuided } from '../project/store';
import { chain } from './chain';
import type { GuidedState } from './state';

/**
 * The step list's marks (plan section 1, "Re-run marks"). A step is done, to do, or (step 3d only) to
 * run again; "current" is the open route, which the shell adds. Its function reads the project state it is given and two
 * injected checks, so it holds no store and no hash design of its own.
 */

export type StepMark = 'done' | 'todo' | 'run-again';

/** Whether a Run's output for one chemical and feed is current, out of date, or not there. */
export type OutputState = 'current' | 'stale' | 'missing';
export type OutputCheck = (feedKey: string, chemicalId: string) => OutputState;

/**
 * The output check until the orchestration slice records input hashes: a slot that is there counts as
 * current. The shell takes a check as a prop so the marks can be tested with any answer.
 */
export const presentOutputCheck: OutputCheck = (feedKey, chemicalId) =>
  getGuided().outputs[feedKey]?.[chemicalId] === undefined ? 'missing' : 'current';

export interface StatusInput {
  chemicals: readonly { id: string }[];
  guided: GuidedState;
  /** Step 3d. The input hash that decides "stale" arrives with the orchestration slice. */
  outputCheck: OutputCheck;
  /**
   * Step 3a: true when no field a chosen model needs is blank. The property catalog supplies it when the
   * step 3a screen lands; until then a sound chain with a template saved for every chosen model counts.
   */
  propertiesComplete?: () => boolean;
}

export type GuidedStatus = Record<GuidedStepId, StepMark>;

/** A value counts as entered when it has text, "ND" (not detected) included. */
const entered = (v: { value: string } | undefined): boolean =>
  v !== undefined && v.value.trim() !== '';

export function guidedStatus(input: StatusInput): GuidedStatus {
  const { chemicals, guided, outputCheck } = input;
  const c = chain(guided.site);
  const sound = c.problems.length === 0;
  const hasChemicals = chemicals.length > 0;

  const propertiesDone = sound
    ? (input.propertiesComplete?.() ?? c.models.every((m) => guided.forms[m] !== undefined))
    : false;

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
    let allCurrent = true;
    for (const chem of chemicals) {
      for (const feed of c.outputs) {
        const state = outputCheck(feed, chem.id);
        if (state !== 'missing') ran = true;
        if (state !== 'current') allCurrent = false;
      }
    }
    // nothing to run (values entered directly) is done once the chain is sound
    run = allCurrent ? 'done' : ran ? 'run-again' : 'todo';
  }

  return {
    chemicals: hasChemicals ? 'done' : 'todo',
    site: sound ? 'done' : 'todo',
    properties: propertiesDone ? 'done' : 'todo',
    sources: sourcesDone ? 'done' : 'todo',
    run,
    pathways: 'todo',
    receptors: 'todo',
    toxicity: 'todo',
    targets: 'todo',
    results: 'todo',
  };
}
