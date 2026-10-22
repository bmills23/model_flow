import type { Warning } from '@model-flow/engine';
import { stableStringify } from '../project/hash';
import type { ModeledCleanupRun } from '../uncertainty/headless';
import type { UncertaintySetup } from '../uncertainty/project';
import { ownSlot, pickSlot, slotOf, type FeedSlots } from '../project/feedSlots';
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
  /** The cleanup chemical the run was made for (its id and name); the summary is kept per chemical. */
  chemicalId: string;
  chemical: string;
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
  chemical: { id: string; name: string } = { id: '', name: '' },
): ModeledUncertaintySummary {
  const r = run.result;
  return {
    chemicalId: chemical.id,
    chemical: chemical.name,
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

/**
 * The kept summaries, one per chemical (wave P slice P3): a modeled run over several chemicals keeps
 * the last probabilistic run of each, under the chemical it was run for. The Map keeps its identity
 * until a slot changes.
 */
let held: FeedSlots<ModeledUncertaintySummary> = new Map();
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((fn) => fn());

/** The summary a chemical reads (its own, else the untagged one, else the latest); null when none. */
export const getModeledSummary = (chemicalId?: string): ModeledUncertaintySummary | null =>
  pickSlot(held, chemicalId);
/** The summary kept for exactly this chemical, with no fallback. */
export const getOwnModeledSummary = (chemicalId: string): ModeledUncertaintySummary | null =>
  ownSlot(held, chemicalId);
export function setModeledSummary(value: ModeledUncertaintySummary): void {
  const next = new Map(held);
  next.set(slotOf(value.chemicalId), value);
  held = next;
  emit();
}
/** Forgets the summary of one chemical, or every summary when no chemical is given. */
export function clearModeledSummary(chemicalId?: string): void {
  if (chemicalId === undefined) {
    if (held.size === 0) return;
    held = new Map();
  } else {
    const key = slotOf(chemicalId);
    if (!held.has(key)) return;
    const next = new Map(held);
    next.delete(key);
    held = next;
  }
  emit();
}
export const subscribeModeledSummary = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
