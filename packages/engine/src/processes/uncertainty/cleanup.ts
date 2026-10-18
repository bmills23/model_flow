import type { Warning } from '../../registry/index.js';
import { solveSourceLevel, type SolveInput } from '../cleanup/solve.js';
import {
  buildSampleMatrix,
  FAILED_FRACTION_LIMIT,
  DEFAULT_CHUNK,
  UncertaintyError,
  type CorrelationReport,
  type IterationFailure,
  type UncertainModel,
  type UncertaintySpec,
} from './runner.js';
import type { Matrix } from './samplers.js';

/**
 * Probabilistic cleanup levels (docs/methods/uncertainty.md, "Probabilistic cleanup levels"). The M5
 * solver is called once per sampled parameter set and gives that iteration's source concentration C*_i.
 * M5 guarantees the receptor metric is monotone increasing in the source concentration, so a source
 * concentration C protects exactly the iterations with C <= C*_i, and the level that protects a fraction
 * p of the sampled population is the (1 - p) quantile of the C*_i (Hyndman and Fan definition 7).
 * An iteration whose target is not reachable below the cap is kept as censored at the cap (infinity when
 * there is no cap) and counted; a quantile that lands on a censored value is reported as not reachable.
 */

export const DEFAULT_PROTECTION = 0.95;
/** Protection fractions always reported next to the chosen one. */
export const REPORTED_PROTECTIONS = [0.5, 0.9, 0.95] as const;

/** What one iteration's solve gives back; `solveSourceLevel` results satisfy it. */
export interface IterationSolve {
  /** The source concentration meeting the target, SI; null when not reachable below the cap. */
  level: number | null;
  reachable: boolean;
  /** Forward runs used by this solve. */
  evaluations: number;
}

export interface CleanupSpec<I> extends Omit<UncertaintySpec<I, unknown>, 'model' | 'output'> {
  model: Pick<UncertainModel<I, unknown>, 'uncertainInputs'> &
    Partial<Pick<UncertainModel<I, unknown>, 'run'>>;
  /** The M5 root-finding problem for one sampled input (metric, target, reference, cap). */
  problem?: (input: I) => SolveInput;
  /** Alternative to `problem`: any solver returning an iteration level (for example a chemical of `solveModeled`). */
  solve?: (input: I) => IterationSolve;
  /** The cap the unreachable iterations are censored at; defaults to the cap of the `problem`. */
  cap?: number;
  /** Chosen protection fraction, default 0.95; 0.5, 0.9 and 0.95 are always reported too. */
  protection?: number;
}

export interface ProtectionLevel {
  /** Fraction of the sampled population protected. */
  p: number;
  /** The (1 - p) quantile of the per-iteration levels, SI; null when it lands on the cap. */
  level: number | null;
  reachable: boolean;
}

export interface CleanupResult {
  n: number;
  seed: string;
  ids: string[];
  samples: Matrix;
  /** C*_i per row: the solved level, the cap (or Infinity) for a censored row, NaN for a failed row. */
  iterationLevels: number[];
  censoredRows: number[];
  succeeded: number;
  /** Forward runs made across all iterations. */
  forwardRuns: number;
  cap: number | null;
  censored: { count: number; fraction: number };
  failures: {
    count: number;
    fraction: number;
    first: IterationFailure[];
    codes: Record<string, number>;
  };
  /** The chosen protection level. */
  protection: ProtectionLevel;
  /** Chosen plus 0.5, 0.9 and 0.95, ascending in p. */
  levels: ProtectionLevel[];
  correlation?: CorrelationReport;
  warnings: Warning[];
}

/** Adapter: solve a `SolveInput` with the M5 solver. */
export function sourceLevelSolve(problem: SolveInput): IterationSolve & { cap?: number } {
  const r = solveSourceLevel(problem);
  return {
    level: r.level,
    reachable: r.reachable,
    evaluations: r.evaluations,
    ...(problem.cap !== undefined ? { cap: problem.cap } : {}),
  };
}

function errorCode(e: unknown): string {
  if (e !== null && typeof e === 'object' && 'code' in e && typeof e.code === 'string') {
    return e.code;
  }
  return e instanceof Error ? e.name : 'Error';
}

interface RowOutcome {
  /** NaN when failed. */
  level: number;
  censored: boolean;
  evaluations: number;
  cap: number | undefined;
}

/**
 * Solve a slice of sample rows: apply the sampled values through the declared setters to a copy of the
 * base input and call the M5 solver. A throw marks the row failed. Pure over its arguments, so a worker
 * can run any slice of the rows.
 */
export function solveCleanupRows<I>(
  model: Pick<UncertainModel<I, unknown>, 'uncertainInputs'>,
  base: I,
  ids: readonly string[],
  rows: Matrix,
  solve: (input: I) => IterationSolve & { cap?: number },
): { outcomes: RowOutcome[]; failures: IterationFailure[] } {
  const declared = new Map((model.uncertainInputs ?? []).map((u) => [u.id, u]));
  const setters = ids.map((id) => {
    const u = declared.get(id);
    if (!u) {
      throw new UncertaintyError(
        'uncertainty.unknown-input',
        `the method declares no input "${id}"`,
      );
    }
    return u;
  });
  const outcomes: RowOutcome[] = [];
  const failures: IterationFailure[] = [];
  rows.forEach((row, i) => {
    try {
      let input = base;
      setters.forEach((u, j) => {
        input = u.set(input, row[j] as number);
      });
      const r = solve(input);
      if (r.reachable && r.level !== null && Number.isFinite(r.level) && r.level > 0) {
        outcomes.push({ level: r.level, censored: false, evaluations: r.evaluations, cap: r.cap });
      } else if (!r.reachable) {
        outcomes.push({
          level: Number.NaN,
          censored: true,
          evaluations: r.evaluations,
          cap: r.cap,
        });
      } else {
        throw new RangeError('the solver returned a level that is not a positive finite number');
      }
    } catch (e) {
      failures.push({
        row: i,
        code: errorCode(e),
        message: e instanceof Error ? e.message : String(e),
      });
      outcomes.push({ level: Number.NaN, censored: false, evaluations: 0, cap: undefined });
    }
  });
  return { outcomes, failures };
}

/**
 * The (1 - p) quantile of levels where censored entries sit above every solved level (definition 7).
 * Returns null when the interpolation touches a censored entry.
 */
export function protectionQuantile(
  solved: readonly number[],
  censoredCount: number,
  p: number,
): number | null {
  const n = solved.length + censoredCount;
  if (n === 0) return null;
  const sorted = [...solved].sort((a, b) => a - b);
  const h = (n - 1) * (1 - p);
  const lo = Math.floor(h);
  const frac = h - lo;
  const at = (i: number): number | null => (i < sorted.length ? (sorted[i] as number) : null);
  const a = at(lo);
  if (a === null) return null;
  if (frac === 0) return a;
  const b = at(Math.min(n - 1, lo + 1));
  if (b === null) return null;
  return a + frac * (b - a);
}

function checkProtection(p: number): void {
  if (!(p > 0 && p < 1)) {
    throw new UncertaintyError(
      'uncertainty.bad-specification',
      'the protection fraction must be strictly between 0 and 1',
    );
  }
}

/** Sample the parameters (Latin hypercube, optional Iman-Conover), solve per iteration, summarise. */
export function runProbabilisticCleanup<I>(spec: CleanupSpec<I>): CleanupResult {
  const { problem, solve } = spec;
  if ((problem === undefined) === (solve === undefined)) {
    throw new UncertaintyError(
      'uncertainty.bad-specification',
      'give exactly one of problem and solve',
    );
  }
  const protection = spec.protection ?? DEFAULT_PROTECTION;
  checkProtection(protection);
  const solver = (input: I): IterationSolve & { cap?: number } =>
    problem !== undefined
      ? sourceLevelSolve(problem(input))
      : (solve as (i: I) => IterationSolve)(input);

  const built = buildSampleMatrix('lhs', {
    ...spec,
    model: { uncertainInputs: spec.model.uncertainInputs, run: () => undefined },
    output: () => 0,
  } as UncertaintySpec<I, unknown>);
  const chunk = Math.max(1, Math.floor(spec.chunkSize ?? DEFAULT_CHUNK));
  const iterationLevels = new Array<number>(built.n).fill(Number.NaN);
  const censoredRows: number[] = [];
  const failed: IterationFailure[] = [];
  let forwardRuns = 0;
  let cap: number | undefined = spec.cap;
  for (let start = 0; start < built.n; start += chunk) {
    const part = solveCleanupRows(
      spec.model,
      spec.base,
      built.ids,
      built.samples.slice(start, start + chunk),
      solver,
    );
    part.outcomes.forEach((o, i) => {
      forwardRuns += o.evaluations;
      if (o.cap !== undefined && cap === undefined) cap = o.cap;
      if (o.censored) censoredRows.push(start + i);
      else iterationLevels[start + i] = o.level;
    });
    for (const f of part.failures) failed.push({ ...f, row: f.row + start });
  }
  const censoredLevel = cap ?? Number.POSITIVE_INFINITY;
  for (const r of censoredRows) iterationLevels[r] = censoredLevel;

  const censoredSet = new Set(censoredRows);
  const solved = iterationLevels.filter((v, i) => Number.isFinite(v) && !censoredSet.has(i));
  const censoredCount = censoredRows.length;
  const succeeded = solved.length + censoredCount;
  const codes: Record<string, number> = {};
  for (const f of failed) codes[f.code] = (codes[f.code] ?? 0) + 1;
  const failFraction = failed.length / built.n;

  const ps = [...new Set<number>([...REPORTED_PROTECTIONS, protection])].sort((a, b) => a - b);
  const levels: ProtectionLevel[] = ps.map((p) => {
    const level = protectionQuantile(solved, censoredCount, p);
    return { p, level, reachable: level !== null };
  });
  const chosen = levels.find((l) => l.p === protection) as ProtectionLevel;

  const warnings = [...built.warnings];
  if (failFraction > FAILED_FRACTION_LIMIT) {
    warnings.push({
      code: 'uncertainty.failed-iterations',
      message: `${failed.length} of ${built.n} iterations (${(failFraction * 100).toFixed(1)} percent) were refused by the deterministic checks; levels use the ${succeeded} that ran.`,
    });
  }
  if (censoredCount > 0) {
    const capText = cap === undefined ? 'no cap' : `the cap ${cap}`;
    const onCap = levels.filter((l) => !l.reachable).map((l) => l.p);
    warnings.push({
      code: 'uncertainty.cleanup-censored',
      message: `${censoredCount} of ${built.n} iterations could not reach the target below ${capText} and are kept censored there${
        onCap.length > 0
          ? `; the level protecting ${onCap.join(', ')} of the population is not reachable below the cap`
          : ''
      }.`,
    });
  }

  return {
    n: built.n,
    seed: built.seed,
    ids: built.ids,
    samples: built.samples,
    iterationLevels,
    censoredRows,
    succeeded,
    forwardRuns,
    cap: cap ?? null,
    censored: { count: censoredCount, fraction: censoredCount / built.n },
    failures: { count: failed.length, fraction: failFraction, first: failed.slice(0, 5), codes },
    protection: chosen,
    levels,
    ...(built.correlation ? { correlation: built.correlation } : {}),
    warnings,
  };
}
