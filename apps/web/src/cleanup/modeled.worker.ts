import type { ModeledRequest } from './modeledTypes';
import { solveAll, type WorkerMessage } from './modeledSolve';

self.onmessage = (e: MessageEvent<ModeledRequest[]>) => {
  const post = (m: WorkerMessage): void => self.postMessage(m);
  try {
    post({
      ok: true,
      items: solveAll(e.data, (progress) => post({ progress })),
    });
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
