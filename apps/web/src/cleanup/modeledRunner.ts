import { computeModeled } from './compute';
import type { ModeledOutcome, ModeledRequest } from './modeledTypes';

export type WorkerReply = { ok: true; outcome: ModeledOutcome } | { ok: false; error: string };

export interface ModeledRunner {
  /** Resolves with the reply, or null when a newer request superseded this one. */
  run(req: ModeledRequest): Promise<WorkerReply | null>;
  dispose(): void;
}

/**
 * Runs the modeled-chain solves in a module Web Worker so the forward runs never block input. A newer
 * request terminates the worker and starts a fresh one, so only the latest request is computed.
 * Without Worker support (tests) it computes on a timer tick instead.
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
    run(req) {
      supersede();
      const id = ++counter;
      if (typeof Worker === 'undefined') {
        return new Promise((resolve) => {
          pending = { resolve };
          setTimeout(() => {
            if (counter !== id) return;
            pending = null;
            try {
              resolve({ ok: true, outcome: computeModeled(req) });
            } catch (e) {
              resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
            }
          }, 0);
        });
      }
      return new Promise((resolve) => {
        pending = { resolve };
        const w = new Worker(new URL('./modeled.worker.ts', import.meta.url), { type: 'module' });
        worker = w;
        w.onmessage = (e: MessageEvent<WorkerReply>) => {
          if (counter !== id) return;
          pending = null;
          resolve(e.data);
        };
        w.onerror = (e) => {
          if (counter !== id) return;
          pending = null;
          resolve({ ok: false, error: e.message || 'The calculation worker failed.' });
        };
        w.postMessage(req);
      });
    },
    dispose() {
      counter++;
      supersede();
    },
  };
}
