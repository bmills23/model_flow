import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ModeledSolved } from '../cleanup/ModeledCleanup';
import { useModeled, type ModeledProgress } from '../cleanup/useModeled';
import { stableStringify } from '../project/hash';
import { getGuided, setGuided, subscribeGuided } from '../project/store';
import { keptLevelsFrom, requestsToSolve, type GuidedSolvePlan } from './solve';

export interface GuidedSolveState {
  /** Chemicals are being solved in the background worker. */
  computing: boolean;
  progress: ModeledProgress | null;
  /** The worker failed outright; nothing new is kept. */
  error: string | null;
}

/**
 * Step 5's solve: the chemicals whose kept levels are not current are solved in the background worker, one
 * after another (`useModeled`, the cleanup screen's runner), and each answer that still matches its request
 * is kept in `guided.levels` with its fingerprint. Kept levels that are current are not solved again, so
 * opening the step after a reload solves nothing until an input changes.
 */
export function useGuidedSolve(plan: GuidedSolvePlan | null): GuidedSolveState {
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const kept = guided.levels;
  const requests = useMemo(() => {
    if (plan === null) return null;
    const reqs = requestsToSolve(plan, kept ?? {});
    return reqs.length > 0 ? reqs : null;
  }, [plan, kept]);
  const unbuilt = plan === null ? 0 : plan.rows.filter((r) => !r.result.ok).length;
  const modeled = useModeled(requests, unbuilt);

  useEffect(() => {
    if (plan === null) return;
    const solved = new Map<string, ModeledSolved>();
    const reply = modeled.reply;
    if (reply?.ok && modeled.answered) {
      modeled.answered.forEach((req, i) =>
        solved.set(req.chemical.id, { req, item: reply.items[i]! }),
      );
    }
    const entries = keptLevelsFrom(plan, solved);
    if (entries.length === 0) return;
    const g = getGuided();
    const levels = { ...(g.levels ?? {}) };
    let changed = false;
    for (const e of entries) {
      if (stableStringify(levels[e.chemicalId]) === stableStringify(e)) continue;
      levels[e.chemicalId] = e;
      changed = true;
    }
    if (changed) setGuided({ ...g, levels });
  }, [plan, modeled.reply, modeled.answered]);

  return {
    computing: modeled.computing,
    progress: modeled.progress,
    error: modeled.reply && !modeled.reply.ok ? modeled.reply.error : null,
  };
}
