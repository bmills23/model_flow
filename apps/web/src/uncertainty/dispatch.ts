import { registry } from '@model-flow/engine';
import { handleModeledRows } from '../cleanup/modeledUncertainty';
import { createWorkerFactory, type WorkerFactory, type WorkerLike } from './pool';
import { handleRows, type PoolRequest, type PoolResponse } from './protocol';

/** Answers one pool message: model rows by registered method id, or modeled cleanup rows. */
export function handlePoolRequest(
  req: PoolRequest,
  now: () => number = () => performance.now(),
): PoolResponse {
  if (req.type === 'modeled-cleanup') return handleModeledRows(req, now);
  return handleRows(req, (id) => registry.get(id), now);
}

/**
 * A stand-in worker that answers on a timer tick on this thread, for a browser (or test runner)
 * without Web Worker support. Results are identical; only the page stays busy while a chunk runs.
 */
export function inlineWorkerFactory(): WorkerFactory {
  return () => {
    let stopped = false;
    const w: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(m) {
        setTimeout(() => {
          if (stopped) return;
          const res = handlePoolRequest(m);
          if (!stopped) w.onmessage?.({ data: res });
        }, 0);
      },
      terminate() {
        stopped = true;
      },
    };
    return w;
  };
}

/** Module Web Workers when the browser has them, else the inline stand-in. */
export function defaultWorkerFactory(): WorkerFactory {
  return typeof Worker === 'undefined' ? inlineWorkerFactory() : createWorkerFactory();
}
