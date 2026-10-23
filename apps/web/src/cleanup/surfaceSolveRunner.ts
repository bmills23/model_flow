import { solveSurfaceJobs, type SurfaceSolveJob, type SurfaceSolveResult } from './surfaceSolve';

/** What the worker answers to `{ surface: jobs }`: one result per job, in order. */
export type SurfaceReply =
  { ok: true; results: SurfaceSolveResult[] } | { ok: false; error: string };

export type SurfaceMessage = SurfaceReply | { progress: { done: number; total: number } };

export interface SurfaceRunner {
  /** Resolves with the reply, or null when a newer set of jobs superseded this one. */
  run(
    jobs: readonly SurfaceSolveJob[],
    onProgress?: (p: { done: number; total: number }) => void,
  ): Promise<SurfaceReply | null>;
  dispose(): void;
}

/**
 * Runs the surface water source level solves in the modeled cleanup's module Web Worker, so the forward
 * runs of the surface water screen (seconds each for a linked run) never block input. The jobs are solved
 * one after another and the worker reports after each. A newer set terminates the worker and starts a
 * fresh one (latest wins). Without Worker support (tests) it solves on a timer tick instead.
 */
export function createSurfaceRunner(): SurfaceRunner {
  let worker: Worker | null = null;
  let pending: { resolve: (o: SurfaceReply | null) => void } | null = null;
  let counter = 0;

  const supersede = (): void => {
    pending?.resolve(null);
    pending = null;
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };

  return {
    run(jobs, onProgress) {
      supersede();
      const id = ++counter;
      if (typeof Worker === 'undefined') {
        return new Promise((resolve) => {
          pending = { resolve };
          setTimeout(() => {
            if (counter !== id) return;
            pending = null;
            try {
              resolve({
                ok: true,
                results: solveSurfaceJobs(jobs, (p) => {
                  if (counter === id) onProgress?.(p);
                }),
              });
            } catch (e) {
              resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
            }
          }, 0);
        });
      }
      return new Promise((resolve) => {
        pending = { resolve };
        const w = new Worker(new URL('./modeled.worker.ts', import.meta.url), { type: 'module' });
        worker = w;
        w.onmessage = (e: MessageEvent<SurfaceMessage>) => {
          if (counter !== id) return;
          if ('progress' in e.data) {
            onProgress?.(e.data.progress);
            return;
          }
          pending = null;
          resolve(e.data);
        };
        w.onerror = (e) => {
          if (counter !== id) return;
          pending = null;
          resolve({ ok: false, error: e.message || 'The calculation worker failed.' });
        };
        w.postMessage({ surface: jobs });
      });
    },
    dispose() {
      counter++;
      supersede();
    },
  };
}

/**
 * Solves jobs in the worker and returns their results by key, for a caller that is not a component (the
 * report). A failure of the worker is the error of every job.
 */
export async function solveSurfaceJobsAsync(
  jobs: readonly SurfaceSolveJob[],
): Promise<Map<string, SurfaceSolveResult>> {
  const out = new Map<string, SurfaceSolveResult>();
  if (jobs.length === 0) return out;
  const runner = createSurfaceRunner();
  try {
    const reply = await runner.run(jobs);
    jobs.forEach((j, i) => {
      out.set(
        j.key,
        reply !== null && reply.ok
          ? reply.results[i]!
          : {
              medium: j.route === 'groundwater' ? 'groundwater' : 'soil',
              numerical: false,
              solved: [],
              error: reply !== null && !reply.ok ? reply.error : 'The calculation was cancelled.',
            },
      );
    });
  } finally {
    runner.dispose();
  }
  return out;
}
