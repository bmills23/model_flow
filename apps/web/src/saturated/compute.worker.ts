import { compute, type SaturatedComputeRequest } from './compute';

self.onmessage = (e: MessageEvent<SaturatedComputeRequest>) => {
  try {
    self.postMessage(compute(e.data));
  } catch (err) {
    // compute() reports engine RangeErrors itself; this guards anything else so the page never sees
    // an unhandled worker error.
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
