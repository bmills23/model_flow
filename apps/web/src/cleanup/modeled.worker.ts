import type { ModeledRequest } from './modeledTypes';
import { solveAll, type WorkerMessage } from './modeledSolve';
import { solveSurfaceJobs, type SurfaceSolveJob } from './surfaceSolve';
import type { SurfaceMessage } from './surfaceSolveRunner';

/**
 * The cleanup screen's background worker: an array of modeled-chain requests is solved chemical by
 * chemical (as before); `{ surface: jobs }` solves the surface water source levels with the same engine
 * solve (wave V slice V2b).
 */
self.onmessage = (e: MessageEvent<ModeledRequest[] | { surface: SurfaceSolveJob[] }>) => {
  if (!Array.isArray(e.data)) {
    const post = (m: SurfaceMessage): void => self.postMessage(m);
    try {
      post({
        ok: true,
        results: solveSurfaceJobs(e.data.surface, (progress) => post({ progress })),
      });
    } catch (err) {
      post({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  const post = (m: WorkerMessage): void => self.postMessage(m);
  try {
    post({
      ok: true,
      items: solveAll(e.data, (progress) => post({ progress })),
    });
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
