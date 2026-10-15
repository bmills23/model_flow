import { compute } from './compute';
import { fromWire, type WireRequest } from './runner';

self.onmessage = (e: MessageEvent<WireRequest>) => {
  try {
    self.postMessage(compute(fromWire(e.data)));
  } catch (err) {
    // compute() reports engine RangeErrors itself; this guards anything else so the page never sees
    // an unhandled worker error.
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
