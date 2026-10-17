import { useEffect, useMemo, useRef, useState } from 'react';
import type { SwOutcome, SwResult } from './compute';
import type { SwRequest } from './inputs';
import { createRunner } from './runner';

export const DEBOUNCE_MS = 300;

export interface SwState {
  outcome: SwOutcome | null;
  /** The most recent successful result and the request it was computed for, kept through errors. */
  lastGood: { result: SwResult; request: SwRequest } | null;
  computing: boolean;
}

function jsonReplacer(_k: string, v: unknown): unknown {
  return v === Infinity ? 'Infinity' : v;
}

/** Debounced, latest-wins recomputation; keeps the previous outcome while computing. */
export function useSurfaceWaterResult(req: SwRequest | null): SwState {
  const [lastGood, setLastGood] = useState<SwState['lastGood']>(null);
  const [done, setDone] = useState<{ key: string; outcome: SwOutcome } | null>(null);
  const runner = useRef<ReturnType<typeof createRunner> | null>(null);
  const first = useRef(true);
  const key = useMemo(() => (req ? JSON.stringify(req, jsonReplacer) : ''), [req]);

  useEffect(() => () => runner.current?.dispose(), []);

  useEffect(() => {
    if (!req) return;
    const delay = first.current ? 0 : DEBOUNCE_MS;
    first.current = false;
    const timer = setTimeout(() => {
      runner.current ??= createRunner();
      void runner.current.run(req).then((outcome) => {
        if (outcome === null) return;
        if (outcome.ok) setLastGood({ result: outcome.result, request: req });
        setDone({ key, outcome });
      });
    }, delay);
    return () => clearTimeout(timer);
    // key captures every input of the request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { outcome: done?.outcome ?? null, lastGood, computing: req !== null && done?.key !== key };
}
