import { useEffect, useMemo, useRef, useState } from 'react';
import type { SurfaceSolveJob, SurfaceSolveResult, SurfaceSolves } from './surfaceSolve';
import { createSurfaceRunner, type SurfaceRunner } from './surfaceSolveRunner';

const DEBOUNCE_MS = 300;
const EMPTY: SurfaceSolves = new Map();

export interface SurfaceSolveState {
  /** The result of every job solved so far, by job key; a job that is unchanged keeps its earlier result. */
  solves: SurfaceSolves;
  /** Jobs asked for that have no result yet. */
  computing: boolean;
  progress: { done: number; total: number } | null;
  /** The worker failed outright; the jobs it held have no result. */
  error: string | null;
}

/**
 * Debounced, latest-wins solve of the surface water source level jobs in the background worker. A job is
 * identified by its key (a hash of everything that goes into it), so only the jobs not yet solved are sent
 * and editing one chemical does not re-solve the others. The results of earlier job sets stay in the map
 * (a job is looked up by key, so a result that is no longer asked for is simply never read).
 */
export function useSurfaceSolves(jobs: readonly SurfaceSolveJob[]): SurfaceSolveState {
  const [solves, setSolves] = useState<SurfaceSolves>(EMPTY);
  const [error, setError] = useState<{ key: string; text: string } | null>(null);
  const [progress, setProgress] = useState<{
    key: string;
    p: { done: number; total: number };
  } | null>(null);
  const runner = useRef<SurfaceRunner | null>(null);
  const known = useRef(new Map<string, SurfaceSolveResult>());
  const key = useMemo(() => jobs.map((j) => j.key).join('|'), [jobs]);

  useEffect(() => () => runner.current?.dispose(), []);

  useEffect(() => {
    const todo = jobs.filter((j) => !known.current.has(j.key));
    if (todo.length === 0) return;
    const timer = setTimeout(() => {
      runner.current ??= createSurfaceRunner();
      setProgress({ key, p: { done: 0, total: todo.length } });
      void runner.current
        .run(todo, (p) => setProgress({ key, p }))
        .then((reply) => {
          if (reply === null) return;
          if (reply.ok) {
            todo.forEach((j, i) => known.current.set(j.key, reply.results[i]!));
            setSolves(new Map(known.current));
            setError(null);
          } else {
            setError({ key, text: reply.error });
          }
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // key captures every job
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const computing = jobs.some((j) => !solves.has(j.key)) && (error === null || error.key !== key);
  return {
    solves,
    computing,
    progress: computing && progress?.key === key ? progress.p : null,
    error: error !== null && error.key === key ? error.text : null,
  };
}
