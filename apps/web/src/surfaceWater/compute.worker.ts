import { compute } from './compute';
import type { SwRequest } from './inputs';

self.onmessage = (e: MessageEvent<SwRequest>) => {
  try {
    self.postMessage(compute(e.data));
  } catch (err) {
    // compute() reports engine errors itself; this guards anything else so the page never sees an
    // unhandled worker error.
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
