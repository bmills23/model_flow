import { compute, type ComputeOutcome, type ComputeRequest } from './compute';
import { makeZOf, type Scenario } from './form';

/** The request as sent to a worker: the scenario's zOf closure cannot be structured-cloned. */
export interface WireRequest extends Omit<ComputeRequest, 'scenario'> {
  scenario: Omit<Scenario, 'zOf'>;
}

export function toWire(req: ComputeRequest): WireRequest {
  const { zOf: _zOf, ...scenario } = req.scenario;
  void _zOf;
  return { ...req, scenario };
}

export function fromWire(w: WireRequest): ComputeRequest {
  return { ...w, scenario: { ...w.scenario, zOf: makeZOf(w.scenario.thickness) } };
}

export interface Runner {
  /** Resolves with the outcome, or null when a newer request superseded this one. */
  run(req: ComputeRequest): Promise<ComputeOutcome | null>;
  dispose(): void;
}

/**
 * Runs the engine in a module Web Worker so a 100 by 60 map plus curves never blocks input. A newer
 * request terminates the worker and starts a fresh one (cheap) so only the latest request is computed.
 * Without Worker support (tests, very old browsers) it computes on a timer tick instead.
 */
export function createRunner(): Runner {
  let worker: Worker | null = null;
  let pending: { resolve: (o: ComputeOutcome | null) => void } | null = null;
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
        w.onmessage = (e: MessageEvent<ComputeOutcome>) => {
          if (counter !== id) return;
          pending = null;
          resolve(e.data);
        };
        w.onerror = (e) => {
          if (counter !== id) return;
          pending = null;
          resolve({ ok: false, error: e.message || 'The calculation worker failed.' });
        };
        w.postMessage(toWire(req));
      });
    },
    dispose() {
      counter++;
      supersede();
    },
  };
}
