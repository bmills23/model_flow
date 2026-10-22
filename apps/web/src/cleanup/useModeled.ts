import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createModeledRunner,
  type ModeledItem,
  type ModeledProgress,
  type ModeledRunner,
  type WorkerReply,
} from './modeledRunner';
import type { ModeledRequest } from './modeledTypes';

const DEBOUNCE_MS = 300;

function replacer(_k: string, v: unknown): unknown {
  return v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : v;
}

export interface ModeledState {
  reply: WorkerReply | null;
  /** The requests the reply answers, in the order of its items. */
  answered: readonly ModeledRequest[] | null;
  computing: boolean;
  /** Chemicals solved so far of those being solved; null while nothing is being solved. */
  progress: ModeledProgress | null;
}

/**
 * Debounced, latest-wins solve of one request per chemical, in the background worker one chemical after
 * another; keeps the previous reply on screen while computing and reports progress per chemical.
 */
export function useModeled(reqs: readonly ModeledRequest[] | null): ModeledState {
  const [done, setDone] = useState<{
    key: string;
    reply: WorkerReply;
    reqs: readonly ModeledRequest[];
  } | null>(null);
  const [progress, setProgress] = useState<{ key: string; p: ModeledProgress } | null>(null);
  const runner = useRef<ModeledRunner | null>(null);
  const first = useRef(true);
  const cache = useRef(new Map<string, ModeledItem>());
  const key = useMemo(
    () => (reqs && reqs.length > 0 ? JSON.stringify(reqs, replacer) : ''),
    [reqs],
  );

  useEffect(() => () => runner.current?.dispose(), []);

  useEffect(() => {
    if (!reqs || reqs.length === 0) return;
    const delay = first.current ? 0 : DEBOUNCE_MS;
    first.current = false;
    const timer = setTimeout(() => {
      runner.current ??= createModeledRunner();
      // a chemical whose request did not change keeps its solve from the last set: only the changed
      // chemicals go to the worker, so editing one chemical does not re-solve the others
      const keys = reqs.map((r) => JSON.stringify(r, replacer));
      const todo = reqs.filter((_, i) => !cache.current.has(keys[i]!));
      const cached = reqs.length - todo.length;
      const finish = (fresh: ModeledItem[]): void => {
        todo.forEach((r, i) => cache.current.set(JSON.stringify(r, replacer), fresh[i]!));
        const items = keys.map((k) => cache.current.get(k)!);
        cache.current = new Map(keys.map((k, i) => [k, items[i]!]));
        setDone({ key, reply: { ok: true, items }, reqs });
      };
      if (todo.length === 0) {
        finish([]);
        return;
      }
      setProgress({ key, p: { done: cached, total: reqs.length } });
      void runner.current
        .run(todo, (p) => setProgress({ key, p: { done: cached + p.done, total: reqs.length } }))
        .then((reply) => {
          if (reply === null) return;
          if (reply.ok) finish(reply.items);
          else setDone({ key, reply, reqs });
        });
    }, delay);
    return () => clearTimeout(timer);
    // key captures every input of the requests
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const computing = key !== '' && done?.key !== key;
  return {
    reply: done?.reply ?? null,
    answered: done?.reqs ?? null,
    computing,
    progress: computing && progress?.key === key ? progress.p : null,
  };
}
