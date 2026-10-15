import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComputeOutcome, ComputeRequest } from './compute';
import { createRunner, toWire } from './runner';

export const DEBOUNCE_MS = 300;

export interface TransportState {
  outcome: ComputeOutcome | null;
  computing: boolean;
}

function jsonReplacer(_k: string, v: unknown): unknown {
  return v === Infinity ? 'Infinity' : v;
}

/**
 * Debounced, latest-wins recomputation of the request; keeps the previous outcome while computing.
 * `computing` is derived: the request key differs from the key of the last delivered outcome.
 */
export function useTransportResult(req: ComputeRequest | null): TransportState {
  const [done, setDone] = useState<{ key: string; outcome: ComputeOutcome } | null>(null);
  const runner = useRef<ReturnType<typeof createRunner> | null>(null);
  const first = useRef(true);
  const key = useMemo(() => (req ? JSON.stringify(toWire(req), jsonReplacer) : ''), [req]);

  useEffect(() => () => runner.current?.dispose(), []);

  useEffect(() => {
    if (!req) return;
    const delay = first.current ? 0 : DEBOUNCE_MS;
    first.current = false;
    const timer = setTimeout(() => {
      runner.current ??= createRunner();
      void runner.current.run(req).then((outcome) => {
        if (outcome !== null) setDone({ key, outcome });
      });
    }, delay);
    return () => clearTimeout(timer);
    // key captures every input of the request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { outcome: done?.outcome ?? null, computing: req !== null && done?.key !== key };
}
