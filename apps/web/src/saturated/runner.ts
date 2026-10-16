import { compute, type SaturatedComputeRequest, type SaturatedOutcome } from './compute';

export interface Runner {
  /** Resolves with the outcome, or null when a newer request superseded this one. */
  run(req: SaturatedComputeRequest): Promise<SaturatedOutcome | null>;
  dispose(): void;
}

/**
 * Runs the engine in a module Web Worker so a long horizon never blocks input. A
 * newer request terminates the worker and starts a fresh one so only the latest request is
 * computed. Without Worker support (tests, very old browsers) it computes on a timer tick instead.
 * The scenario is plain data, so it crosses the worker boundary unchanged.
 */
export function createRunner(): Runner {
  let worker: Worker | null = null;
  let pending: { resolve: (o: SaturatedOutcome | null) => void } | null = null;
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
            resolve(compute(req));
          }, 0);
        });
      }
      return new Promise((resolve) => {
        pending = { resolve };
        const w = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' });
        worker = w;
        w.onmessage = (e: MessageEvent<SaturatedOutcome>) => {
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
