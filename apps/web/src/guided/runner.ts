import { getGuided, setGuided } from '../project/store';
import { runPlan, type ChemicalData, type RunPlan } from './derive';
import { outputHashes, type OutputHashes } from './hash';
import {
  jobsOf,
  runAll,
  type ChemicalRun,
  type RunJob,
  type RunMessage,
  type RunProgress,
  type RunReply,
} from './run';
import type { GuidedOutputs, GuidedState } from './state';

/**
 * The step 3d Run (plan section 2): the jobs of every project chemical go to one module worker
 * (`run.worker.ts`), which runs them one after another and reports progress after each; a newer Run
 * supersedes the older one, whose result is never written. Five chemicals through the layered vadose model
 * took about 10 s on one thread (measured with `run.timing.test.ts`), so one worker is enough and the
 * uncertainty pool is not used. Without Worker support (tests) the jobs run on a timer tick.
 */

export interface GuidedRunner {
  /** Resolves with the reply, or null when a newer Run superseded this one. */
  run(jobs: readonly RunJob[], onProgress?: (p: RunProgress) => void): Promise<RunReply | null>;
  dispose(): void;
}

export function createGuidedRunner(): GuidedRunner {
  let worker: Worker | null = null;
  let pending: { resolve: (o: RunReply | null) => void } | null = null;
  let counter = 0;

  const supersede = (): void => {
    pending?.resolve(null);
    pending = null;
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };

  return {
    run(jobs, onProgress) {
      supersede();
      const id = ++counter;
      if (typeof Worker === 'undefined') {
        return new Promise((resolve) => {
          pending = { resolve };
          setTimeout(() => {
            if (counter !== id) return;
            pending = null;
            resolve({
              ok: true,
              runs: runAll(jobs, (p) => {
                if (counter === id) onProgress?.(p);
              }),
            });
          }, 0);
        });
      }
      return new Promise((resolve) => {
        pending = { resolve };
        const w = new Worker(new URL('./run.worker.ts', import.meta.url), { type: 'module' });
        worker = w;
        w.onmessage = (e: MessageEvent<RunMessage>) => {
          if (counter !== id) return;
          if ('progress' in e.data) {
            onProgress?.(e.data.progress);
            return;
          }
          pending = null;
          resolve(e.data);
        };
        w.onerror = (e) => {
          if (counter !== id) return;
          pending = null;
          resolve({ ok: false, error: e.message || 'The calculation worker failed.' });
        };
        w.postMessage(jobs);
      });
    },
    dispose() {
      counter++;
      supersede();
    },
  };
}

/** A Run ready to start: its jobs and the live hashes its outputs record, or why it cannot start. */
export interface PreparedRun {
  plan: RunPlan | null;
  jobs: RunJob[];
  hashes: OutputHashes;
  problems: string[];
}

export function prepareRun(guided: GuidedState, data: readonly ChemicalData[]): PreparedRun {
  const plan = runPlan(guided);
  if (plan === null) {
    return {
      plan,
      jobs: [],
      hashes: {},
      problems: ['Step 2 has a problem to settle before the models can run.'],
    };
  }
  if (plan.problems.length > 0) return { plan, jobs: [], hashes: {}, problems: plan.problems };
  return { plan, jobs: jobsOf(guided, data), hashes: outputHashes(guided, data), problems: [] };
}

/**
 * The outputs a Run leaves: each chain output it computed, with the hash of the inputs it started from.
 * Everything else (a path the site model no longer uses, a chemical no longer listed, an output that did
 * not compute this time) is dropped.
 */
export function outputsOfRun(prepared: PreparedRun, runs: readonly ChemicalRun[]): GuidedOutputs {
  const out: GuidedOutputs = {};
  for (const r of runs) {
    for (const [feed, value] of Object.entries(r.outputs)) {
      const inputsHash = prepared.hashes[feed]?.[r.chemicalId];
      if (inputsHash === undefined) continue;
      (out[feed] ??= {})[r.chemicalId] = { inputsHash, value };
    }
  }
  return out;
}

/**
 * Run step 3d on the project as it stands and write the outputs into the guided state. Resolves with each
 * chemical's run (its outputs and problems), or null when the Run could not start or a newer Run
 * superseded it; then nothing is written. A reply with an error writes nothing either and is thrown.
 */
export async function runGuided(
  runner: GuidedRunner,
  data: readonly ChemicalData[],
  onProgress?: (p: RunProgress) => void,
): Promise<ChemicalRun[] | null> {
  const prepared = prepareRun(getGuided(), data);
  if (prepared.problems.length > 0) return null;
  const reply = await runner.run(prepared.jobs, onProgress);
  if (reply === null) return null;
  if (!reply.ok) throw new Error(reply.error);
  setGuided({ ...getGuided(), outputs: outputsOfRun(prepared, reply.runs) });
  return reply.runs;
}
