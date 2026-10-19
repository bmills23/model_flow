import { UncertaintyError, type IterationFailure, type Matrix } from '@model-flow/engine';
import {
  DEFAULT_CHUNK_ROWS,
  PILOT_ROWS,
  assertWithinBudget,
  poolSize,
  projectRun,
  type Projection,
} from './budget';
import type { ModeledRowsRequest, PoolRequest, PoolResponse } from './protocol';

/** The part of a Web Worker the pool uses, so tests can stand in for real workers. */
export interface WorkerLike {
  postMessage(message: PoolRequest): void;
  terminate(): void;
  onmessage: ((e: { data: PoolResponse }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}
export type WorkerFactory = () => WorkerLike;

export class RunCancelledError extends Error {
  constructor(message = 'The run was cancelled.') {
    super(message);
    this.name = 'RunCancelledError';
  }
}

export interface RowsJob {
  type?: 'rows';
  modelId: string;
  base: unknown;
  ids: readonly string[];
  /** The whole sample matrix, built on one thread before the pool starts (n by k). */
  rows: Matrix;
  outputPath: readonly string[];
}

/** Probabilistic cleanup rows of a modeled source; the output of a row is its level (see protocol). */
export interface ModeledCleanupJob {
  type: 'modeled-cleanup';
  request: ModeledRowsRequest['request'];
  method: ModeledRowsRequest['method'];
  ids: readonly string[];
  rows: Matrix;
}

export type PooledJob = RowsJob | ModeledCleanupJob;

/** The message for one chunk of a job. */
function chunkMessage(job: PooledJob, index: number, start: number, end: number): PoolRequest {
  const rows = job.rows.slice(start, end) as number[][];
  if (job.type === 'modeled-cleanup') {
    return {
      type: 'modeled-cleanup',
      job: index,
      start,
      request: job.request,
      method: job.method,
      ids: job.ids,
      rows,
    };
  }
  return {
    type: 'rows',
    job: index,
    start,
    modelId: job.modelId,
    base: job.base,
    ids: job.ids,
    rows,
    outputPath: job.outputPath,
  };
}

export interface Progress {
  done: number;
  total: number;
}

export interface PoolOptions {
  /** Pool size; default min(4, cores - 1). */
  workers?: number;
  /** Rows per chunk; default 50. Never changes the result. */
  chunkSize?: number;
  pilotRows?: number;
  onProgress?: (p: Progress) => void;
  /** Called with the projection when the run is projected above 60 s; return false to stop. */
  confirm?: (p: Projection) => boolean | Promise<boolean>;
  signal?: AbortSignal;
}

export interface PooledResult {
  /** Output per row, in row order; NaN for a failed iteration. */
  outputs: number[];
  failures: {
    count: number;
    fraction: number;
    first: IterationFailure[];
    /** Every failure, by absolute row. */
    all: IterationFailure[];
    codes: Record<string, number>;
  };
  /** Forward runs per row, in row order (0 when the worker does not count them). */
  evaluations: number[];
  projection: Projection;
  workers: number;
}

function defaultWorkers(): number {
  const n = typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency;
  return poolSize(n);
}

/**
 * Runs the rows of a sample on a pool of workers. The first PILOT_ROWS rows run alone on one worker
 * and are timed; the projection (per-row time times the rows, over the pool) is checked against the
 * run budget before the rest are queued in chunks. Results are written back by row index, so the
 * outputs do not depend on the pool size, the chunk size or the order chunks finish in.
 */
export async function runPooled(
  job: PooledJob,
  makeWorker: WorkerFactory,
  options: PoolOptions = {},
): Promise<PooledResult> {
  const total = job.rows.length;
  if (total < 1) {
    throw new UncertaintyError('uncertainty.bad-specification', 'the sample has no rows');
  }
  const poolMax = Math.max(1, Math.floor(options.workers ?? defaultWorkers()));
  const chunk = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_CHUNK_ROWS));
  const pilotCount = Math.min(total, Math.max(1, Math.floor(options.pilotRows ?? PILOT_ROWS)));
  const signal = options.signal;
  if (signal?.aborted) throw new RunCancelledError();

  const outputs = new Array<number>(total).fill(Number.NaN);
  const evaluations = new Array<number>(total).fill(0);
  const failed: IterationFailure[] = [];
  const workers: WorkerLike[] = [];
  let done = 0;
  let settled = false;
  let rejectAll: (e: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAll = reject;
  });
  aborted.catch(() => {});

  const stopAll = (): void => {
    for (const w of workers) w.terminate();
  };
  const onAbort = (): void => {
    if (settled) return;
    stopAll();
    rejectAll(new RunCancelledError());
  };
  signal?.addEventListener('abort', onAbort);

  const spawn = (): WorkerLike => {
    const w = makeWorker();
    workers.push(w);
    return w;
  };

  /** Sends one chunk to a worker and resolves with the response; worker errors reject the run. */
  const exchange = (
    w: WorkerLike,
    index: number,
    start: number,
    end: number,
  ): Promise<{ elapsedMs: number }> =>
    new Promise((resolve, reject) => {
      w.onmessage = (e) => {
        const r = e.data;
        if (r.type === 'error') {
          reject(new Error(r.message));
          return;
        }
        r.outputs.forEach((y, i) => {
          outputs[start + i] = y;
        });
        r.evaluations?.forEach((k, i) => {
          evaluations[start + i] = k;
        });
        for (const f of r.failures) failed.push({ ...f, row: f.row + start });
        done += end - start;
        options.onProgress?.({ done, total });
        resolve({ elapsedMs: r.elapsedMs });
      };
      w.onerror = (e) => reject(new Error(e.message || 'An uncertainty worker failed.'));
      w.postMessage(chunkMessage(job, index, start, end));
    });

  const body = async (): Promise<PooledResult> => {
    const first = spawn();
    const pilot = await exchange(first, 0, 0, pilotCount);
    const projection = projectRun({
      pilotMs: pilot.elapsedMs,
      pilotRows: pilotCount,
      totalRows: total,
      workers: poolMax,
    });
    const chunks: Array<[number, number]> = [];
    for (let s = pilotCount; s < total; s += chunk) chunks.push([s, Math.min(total, s + chunk)]);
    const used = Math.max(1, Math.min(poolMax, chunks.length));
    const effective = { ...projection, workers: used };
    if (chunks.length > 0) {
      assertWithinBudget(projection);
      if (projection.decision === 'confirm') {
        const ok = options.confirm ? await options.confirm(projection) : false;
        if (!ok) throw new RunCancelledError();
      }
      let next = 0;
      const drive = async (w: WorkerLike): Promise<void> => {
        for (;;) {
          if (signal?.aborted) return;
          const i = next++;
          const c = chunks[i];
          if (!c) return;
          await exchange(w, i + 1, c[0], c[1]);
        }
      };
      const pool = [first];
      while (pool.length < used) pool.push(spawn());
      await Promise.all(pool.map(drive));
      if (signal?.aborted) throw new RunCancelledError();
    }
    failed.sort((a, b) => a.row - b.row);
    const codes: Record<string, number> = {};
    for (const f of failed) codes[f.code] = (codes[f.code] ?? 0) + 1;
    return {
      outputs,
      evaluations,
      failures: {
        count: failed.length,
        fraction: failed.length / total,
        first: failed.slice(0, 5),
        all: failed,
        codes,
      },
      projection: effective,
      workers: used,
    };
  };

  try {
    return await Promise.race([body(), aborted]);
  } finally {
    settled = true;
    signal?.removeEventListener('abort', onAbort);
    stopAll();
  }
}

/** The real pool: module Web Workers running uncertainty.worker.ts. */
export function createWorkerFactory(): WorkerFactory {
  return () =>
    new Worker(new URL('./uncertainty.worker.ts', import.meta.url), {
      type: 'module',
    }) as unknown as WorkerLike;
}
