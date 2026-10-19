import type { Warning } from '@model-flow/engine';
import { stableStringify } from '../project/hash';
import type { ModeledCleanupRun } from '../uncertainty/headless';
import type { UncertaintySetup } from '../uncertainty/project';
import { createFeed } from '../vapor/feedStore';
import type { ModeledRequest } from './modeledTypes';

/**
 * What the report keeps of a modeled-source uncertainty run (docs/DECISIONS.md, wave J slice J2): the
 * protective levels, the run line, the warnings and the input ranking, never the draws. It lives in
 * memory for the session: the transport chain it was computed through is not saved with a project,
 * so after a reload nothing could say whether a saved summary still matches the inputs.
 */
export interface ModeledUncertaintySummary {
  /** `modeledFingerprint` of the request and setup the run used. */
  fingerprint: string;
  label: string;
  unit: string;
  /** Display units per SI unit. */
  fromSi: number;
  /** The point-value cleanup level, SI; null when the target is not reachable. */
  deterministic: number | null;
  n: number;
  succeeded: number;
  seed: string;
  forwardRuns: number;
  workers: number;
  /** The chosen protected fraction. */
  chosen: number;
  /** Chosen plus 50, 90 and 95 percent, ascending; levels in SI, null when not reachable. */
  levels: { p: number; level: number | null }[];
  warnings: Warning[];
  spearman: { label: string; rho: number }[];
}

/**
 * A fingerprint of everything a modeled-source run depends on: the solved request (chain, source,
 * chemical, receptors, targets) and the panel's setup (rows, correlation, method, protection, count,
 * seed). Equal text means the same run would give the same numbers.
 */
export function modeledFingerprint(request: ModeledRequest, setup: UncertaintySetup): string {
  return stableStringify({ request, setup });
}

export function summarizeModeledRun(
  run: ModeledCleanupRun,
  label: string,
  fingerprint: string,
): ModeledUncertaintySummary {
  const r = run.result;
  return {
    fingerprint,
    label,
    unit: run.unit,
    fromSi: run.fromSi,
    deterministic: run.deterministic,
    n: r.n,
    succeeded: r.succeeded,
    seed: r.seed,
    forwardRuns: r.forwardRuns,
    workers: run.workers,
    chosen: r.protection.p,
    levels: r.levels.map((l) => ({ p: l.p, level: l.level })),
    warnings: r.warnings.map((w) => ({ ...w })),
    spearman: run.spearman.map((s) => ({ ...s })),
  };
}

const store = createFeed<ModeledUncertaintySummary>();
export const getModeledSummary = store.get;
export const setModeledSummary = store.set;
export const clearModeledSummary = store.clear;
export const subscribeModeledSummary = store.subscribe;
