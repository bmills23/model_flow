import { computeModeled } from './compute';
import type { ModeledRequest } from './modeledTypes';

self.onmessage = (e: MessageEvent<ModeledRequest>) => {
  try {
    self.postMessage({ ok: true, outcome: computeModeled(e.data) });
  } catch (err) {
    // computeModeled reports each method's engine errors itself; this guards anything else.
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
