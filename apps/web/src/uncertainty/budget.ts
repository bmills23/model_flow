import { UncertaintyError } from '@model-flow/engine';

/**
 * Run budget for the browser (uncertainty note, "Runtime budget in the browser"; DECISIONS ruling 11):
 * a pool of min(4, cores - 1) workers, a 5-row pilot, a confirmation above 60 s of projected wall
 * time and a refusal above 10 minutes.
 */
export const MAX_WORKERS = 4;
export const PILOT_ROWS = 5;
export const CONFIRM_MS = 60_000;
export const REFUSE_MS = 600_000;
export const DEFAULT_CHUNK_ROWS = 50;

export type BudgetDecision = 'run' | 'confirm' | 'refuse';

export interface Projection {
  /** Mean model time per row, measured on the pilot rows, in milliseconds. */
  msPerRow: number;
  /** Projected wall time for all rows on the pool, in milliseconds. */
  projectedMs: number;
  totalRows: number;
  workers: number;
  decision: BudgetDecision;
}

/** min(4, hardwareConcurrency - 1), at least 1; an unknown core count gives 1. */
export function poolSize(hardwareConcurrency: number | undefined): number {
  if (hardwareConcurrency === undefined || !Number.isFinite(hardwareConcurrency)) return 1;
  return Math.max(1, Math.min(MAX_WORKERS, Math.floor(hardwareConcurrency) - 1));
}

export function decideBudget(projectedMs: number): BudgetDecision {
  if (!Number.isFinite(projectedMs) || projectedMs > REFUSE_MS) return 'refuse';
  return projectedMs > CONFIRM_MS ? 'confirm' : 'run';
}

export function projectRun(args: {
  pilotMs: number;
  pilotRows: number;
  totalRows: number;
  workers: number;
}): Projection {
  const msPerRow = args.pilotMs / Math.max(1, args.pilotRows);
  const workers = Math.max(1, args.workers);
  const projectedMs = (msPerRow * args.totalRows) / workers;
  return {
    msPerRow,
    projectedMs,
    totalRows: args.totalRows,
    workers,
    decision: decideBudget(projectedMs),
  };
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return 'an unbounded time';
  const s = ms / 1000;
  if (s < 60) return `${Number(s.toFixed(1))} s`;
  const totalMin = Math.floor(s / 60);
  if (totalMin < 60) return `${totalMin} min ${Math.round(s - totalMin * 60)} s`;
  const h = Math.floor(totalMin / 60);
  return `${h} h ${totalMin - h * 60} min`;
}

/** Throws the run-budget refusal, with the projection shown, when the run is over the hard cap. */
export function assertWithinBudget(p: Projection): void {
  if (p.decision !== 'refuse') return;
  throw new UncertaintyError(
    'uncertainty.run-budget',
    `the run is projected to take ${formatDuration(p.projectedMs)} on ${p.workers} worker${p.workers === 1 ? '' : 's'} (${p.totalRows} rows at ${p.msPerRow.toFixed(1)} ms each), above the ${formatDuration(REFUSE_MS)} limit; reduce the iteration count`,
  );
}
