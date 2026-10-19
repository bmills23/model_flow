import { evaluateRows, type IterationFailure, type UncertainModel } from '@model-flow/engine';

/** Messages between the pool and an uncertainty worker. Everything here is plain structured-clone data. */
export interface RowsRequest {
  type: 'rows';
  /** Token echoed back; the pool uses the chunk index. */
  job: number;
  /** Index of the first row in the whole sample (informational; failures come back chunk-relative). */
  start: number;
  /** Id of the registered method whose run is the model. */
  modelId: string;
  base: unknown;
  ids: readonly string[];
  rows: number[][];
  /** Property path from the model result to the scalar output, for example ['summary', 'total']. */
  outputPath: readonly string[];
}
export type PoolRequest = RowsRequest;

export interface RowsResponse {
  type: 'rows';
  job: number;
  outputs: number[];
  failures: IterationFailure[];
  /** Model time for the chunk in milliseconds, measured inside the worker (engine load excluded). */
  elapsedMs: number;
}
export interface ErrorResponse {
  type: 'error';
  job: number;
  message: string;
}
export type PoolResponse = RowsResponse | ErrorResponse;

export function pathExtractor(path: readonly string[]): (result: unknown) => number {
  return (result) => {
    let v: unknown = result;
    for (const key of path) {
      if (v === null || typeof v !== 'object' || !(key in v)) {
        throw new RangeError(`the result has no property "${path.join('.')}"`);
      }
      v = (v as Record<string, unknown>)[key];
    }
    return typeof v === 'number' ? v : Number.NaN;
  };
}

/**
 * Evaluates one chunk of rows. Pure over its arguments (the resolver and the clock are passed in), so
 * the worker entry and the tests run the same code. The model is looked up by id on the worker's side
 * because functions do not cross the worker boundary.
 */
export function handleRows(
  req: RowsRequest,
  resolve: (id: string) => UncertainModel<unknown, unknown>,
  now: () => number = () => performance.now(),
): PoolResponse {
  try {
    const model = resolve(req.modelId);
    const t0 = now();
    const { outputs, failures } = evaluateRows(
      model,
      req.base,
      req.ids,
      req.rows,
      pathExtractor(req.outputPath),
    );
    return { type: 'rows', job: req.job, outputs, failures, elapsedMs: now() - t0 };
  } catch (e) {
    return { type: 'error', job: req.job, message: e instanceof Error ? e.message : String(e) };
  }
}
