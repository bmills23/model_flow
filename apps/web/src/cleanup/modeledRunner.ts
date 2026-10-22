import type { ModeledRequest } from './modeledTypes';
import {
  solveAll,
  type ModeledProgress,
  type WorkerMessage,
  type WorkerReply,
} from './modeledSolve';

export type { ModeledItem, ModeledProgress, WorkerReply } from './modeledSolve';

export interface ModeledRunner {
  /** Resolves with the reply, or null when a newer request superseded this one. */
  run(
    reqs: readonly ModeledRequest[],
    onProgress?: (p: ModeledProgress) => void,
  ): Promise<WorkerReply | null>;
  dispose(): void;
}

/**
 * Runs the modeled-chain solves in a module Web Worker so the forward runs never block input. The
 * chemicals of one request set are solved one after another in the worker, which reports after each so
 * the screen can show progress per chemical. A newer request terminates the worker and starts a fresh
 * one, so only the latest request set is computed. Without Worker support (tests) it computes on a
 * timer tick instead.
 */
export function createModeledRunner(): ModeledRunner {
  let worker: Worker | null = null;
  let pending: { resolve: (o: WorkerReply | null) => void } | null = null;
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
    run(reqs, onProgress) {
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
              items: solveAll(reqs, (p) => {
                if (counter === id) onProgress?.(p);
              }),
            });
          }, 0);
        });
      }
      return new Promise((resolve) => {
        pending = { resolve };
        const w = new Worker(new URL('./modeled.worker.ts', import.meta.url), { type: 'module' });
        worker = w;
        w.onmessage = (e: MessageEvent<WorkerMessage>) => {
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
        w.postMessage(reqs);
      });
    },
    dispose() {
      counter++;
      supersede();
    },
  };
}
