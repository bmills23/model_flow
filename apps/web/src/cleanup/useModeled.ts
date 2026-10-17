import { useEffect, useMemo, useRef, useState } from 'react';
import { createModeledRunner, type ModeledRunner, type WorkerReply } from './modeledRunner';
import type { ModeledRequest } from './modeledTypes';

const DEBOUNCE_MS = 300;

function replacer(_k: string, v: unknown): unknown {
  return v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : v;
}

export interface ModeledState {
  reply: WorkerReply | null;
  /** The request the reply answers. */
  answered: ModeledRequest | null;
  computing: boolean;
}

/** Debounced, latest-wins solve of the request; keeps the previous reply on screen while computing. */
export function useModeled(req: ModeledRequest | null): ModeledState {
  const [done, setDone] = useState<{ key: string; reply: WorkerReply; req: ModeledRequest } | null>(
    null,
  );
  const runner = useRef<ModeledRunner | null>(null);
  const first = useRef(true);
  const key = useMemo(() => (req ? JSON.stringify(req, replacer) : ''), [req]);

  useEffect(() => () => runner.current?.dispose(), []);

  useEffect(() => {
    if (!req) return;
    const delay = first.current ? 0 : DEBOUNCE_MS;
    first.current = false;
    const timer = setTimeout(() => {
      runner.current ??= createModeledRunner();
      void runner.current.run(req).then((reply) => {
        if (reply !== null) setDone({ key, reply, req });
      });
    }, delay);
    return () => clearTimeout(timer);
    // key captures every input of the request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    reply: done?.reply ?? null,
    answered: done?.req ?? null,
    computing: req !== null && done?.key !== key,
  };
}
