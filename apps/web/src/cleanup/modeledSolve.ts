import { computeModeled } from './compute';
import type { ModeledOutcome, ModeledRequest } from './modeledTypes';

/** One chemical's solve: its outcome, or the error that stopped it (the others are still solved). */
export type ModeledItem = { ok: true; outcome: ModeledOutcome } | { ok: false; error: string };

export type WorkerReply = { ok: true; items: ModeledItem[] } | { ok: false; error: string };

/** What a worker posts while it works: one message after each chemical, then the reply. */
export type WorkerMessage = WorkerReply | { progress: ModeledProgress };

export interface ModeledProgress {
  done: number;
  total: number;
}

/** Solves the requests in order, one chemical at a time; a chemical that throws does not stop the rest. */
export function solveAll(
  reqs: readonly ModeledRequest[],
  onProgress?: (p: ModeledProgress) => void,
): ModeledItem[] {
  const items: ModeledItem[] = [];
  for (const req of reqs) {
    try {
      items.push({ ok: true, outcome: computeModeled(req) });
    } catch (e) {
      // computeModeled reports each method's engine errors itself; this guards anything else.
      items.push({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    onProgress?.({ done: items.length, total: reqs.length });
  }
  return items;
}
