import { bracketRoot, brent, secant } from '../../numerics/roots.js';
import type { Warning } from '../../registry/index.js';

/**
 * Root finding for the modeled cleanup levels (`docs/methods/cleanup-levels.md`, "Root finding").
 *
 * Solve metric(C) = target for a metric that is nondecreasing in the source concentration C, in the log
 * variable u = ln C with g(u) = metric(e^u) / target - 1. A linear chain is solved by a verified
 * shortcut (two forward runs); any other chain is bracketed (`bracketRoot`, or the cap) and solved with
 * Brent's method (Brent 1973). The secant iteration of RISC5 is a parity diagnostic, run on request.
 */

export const SHORTCUT_TOLERANCE = 1e-9;
export const NUMERICAL_TOLERANCE = 1e-3;
export const BRENT_TOLERANCE = 1e-12;
export const BRENT_MAX_ITER = 200;
export const BRACKET_GROWTH = 10;
export const BRACKET_EXPANSIONS = 40;
export const SECANT_PARITY = 1e-8;

export interface SolveInput {
  /** Nondecreasing receptor metric of the source concentration C (SI, C > 0). */
  metric: (c: number) => number;
  /** Positive target of the metric, in the metric's own units. */
  target: number;
  /** Starting concentration C_ref (the entered one, or 1 mg/kg or 1 mg/L), SI, positive. */
  reference: number;
  /** Search ceiling (pure substance for soil, solubility for a dissolved source), SI. */
  cap?: number | undefined;
  /** The chain contains the layered finite-volume solver: accept |g| <= 1e-3 and warn. */
  numerical?: boolean | undefined;
  /** Also run the secant iteration and report its agreement with Brent (diagnostic only). */
  secantParity?: boolean | undefined;
  /** Brent iteration limit (default 200). */
  maxIter?: number | undefined;
  /** Test hook: skip the linear shortcut and go straight to the bracket and Brent. */
  skipShortcut?: boolean | undefined;
}

export interface SecantParity {
  level: number;
  iterations: number;
  converged: boolean;
}

export interface SolveResult {
  /** The concentration at which the metric meets the target; null when not reachable. */
  level: number | null;
  reachable: boolean;
  method: 'linear' | 'brent' | 'cap' | 'none';
  /** g at the returned level (NaN when not reachable). */
  residual: number;
  /** Forward runs used. */
  evaluations: number;
  /** Brent iterations (0 for the shortcut). */
  iterations: number;
  /** The largest metric seen; with the cap evaluated it is the metric at the cap. */
  maxMetric: number;
  secant?: SecantParity;
  warnings: Warning[];
}

function checkInput(i: SolveInput): void {
  if (!(Number.isFinite(i.target) && i.target > 0)) {
    throw new RangeError(`the metric target must be positive and finite, got ${i.target}`);
  }
  if (!(Number.isFinite(i.reference) && i.reference > 0)) {
    throw new RangeError(`the reference concentration must be positive and finite`);
  }
  if (i.cap !== undefined && !(Number.isFinite(i.cap) && i.cap > 0)) {
    throw new RangeError(`the search cap must be positive and finite`);
  }
}

export function solveSourceLevel(input: SolveInput): SolveResult {
  checkInput(input);
  const { target, cap } = input;
  // a start above the ceiling is moved onto it
  const reference = cap === undefined ? input.reference : Math.min(input.reference, cap);
  const maxIter = input.maxIter ?? BRENT_MAX_ITER;
  const warnings: Warning[] = [];
  let evaluations = 0;
  let maxMetric = 0;
  const g = (u: number): number => {
    const m = input.metric(Math.exp(u));
    if (!Number.isFinite(m) || m < 0) {
      throw new Error(`the receptor metric returned ${m} at C = ${Math.exp(u)}`);
    }
    evaluations++;
    if (m > maxMetric) maxMetric = m;
    return m / target - 1;
  };
  const base = (): Pick<SolveResult, 'evaluations' | 'maxMetric' | 'warnings'> => ({
    evaluations,
    maxMetric,
    warnings,
  });
  const unreachable = (): SolveResult => {
    warnings.push({
      code: 'cleanup.target-not-reachable',
      message: `the metric reaches ${maxMetric} at most, below the target ${target}${
        cap === undefined ? '' : ` (search cap ${cap})`
      }; no cleanup level exists below the cap`,
    });
    return {
      level: null,
      reachable: false,
      method: 'none',
      residual: Number.NaN,
      iterations: 0,
      ...base(),
    };
  };

  const uRef = Math.log(reference);
  const gRef = g(uRef);
  const tol = input.numerical === true ? NUMERICAL_TOLERANCE : SHORTCUT_TOLERANCE;
  if (input.numerical === true) {
    warnings.push({
      code: 'cleanup.numerical-chain',
      message:
        'the chain contains the layered finite-volume solver; the level meets the target to 1e-3',
    });
  }

  let level: number | undefined;
  let method: SolveResult['method'] = 'brent';
  let iterations = 0;
  let residual = Number.NaN;
  let uLo = uRef;
  let uHi = uRef + Math.LN10;

  // verified linear shortcut
  const mRef = (gRef + 1) * target;
  if (input.skipShortcut !== true && mRef > 0 && Number.isFinite(mRef)) {
    const cStar = (reference * target) / mRef;
    if (Number.isFinite(cStar) && cStar > 0 && (cap === undefined || cStar <= cap)) {
      const gStar = g(Math.log(cStar));
      if (Math.abs(gStar) <= SHORTCUT_TOLERANCE) {
        level = cStar;
        method = 'linear';
        residual = gStar;
        uLo = Math.log(cStar);
        uHi = uLo + Math.LN10;
      }
    }
  }

  if (level === undefined) {
    let a: number;
    let b: number;
    if (gRef === 0) {
      a = b = uRef;
    } else if (gRef < 0) {
      if (cap !== undefined) {
        const uCap = Math.log(cap);
        const gCap = g(uCap);
        // a metric at the cap that meets the target to the acceptance level means the cap is the level
        if (gCap < -SHORTCUT_TOLERANCE) return unreachable();
        a = uRef;
        b = uCap;
        if (gCap <= 0) a = b;
      } else {
        try {
          const [lo, hi] = bracketRoot((c) => g(Math.log(c)), reference, {
            growth: BRACKET_GROWTH,
            maxExpansions: BRACKET_EXPANSIONS,
          });
          a = Math.log(lo);
          b = Math.log(hi);
        } catch (e) {
          if (e instanceof RangeError) return unreachable();
          throw e;
        }
      }
    } else {
      try {
        const [lo, hi] = bracketRoot((w) => g(-Math.log(w)), 1 / reference, {
          growth: BRACKET_GROWTH,
          maxExpansions: BRACKET_EXPANSIONS,
        });
        a = -Math.log(hi);
        b = -Math.log(lo);
      } catch (e) {
        if (e instanceof RangeError) {
          throw new Error(
            `no downward bracket within ${BRACKET_EXPANSIONS} decades: the metric does not fall to the target as the source concentration goes to zero`,
            { cause: e },
          );
        }
        throw e;
      }
    }
    uLo = a;
    uHi = b;
    if (a === b) {
      level = Math.exp(a);
      iterations = 0;
      method = cap !== undefined && Math.abs(Math.exp(a) - cap) <= 1e-12 * cap ? 'cap' : 'brent';
      residual = g(a);
    } else {
      const r = brent(g, a, b, { tol: BRENT_TOLERANCE, maxIter });
      if (!r.converged) {
        throw new Error(
          `Brent's method did not converge in ${maxIter} iterations on [${Math.exp(a)}, ${Math.exp(b)}]`,
        );
      }
      iterations = r.iterations;
      level = Math.exp(r.root);
      residual = g(r.root);
      if (cap !== undefined && level >= cap * (1 - 1e-12)) method = 'cap';
    }
  }

  if (Math.abs(residual) > tol) {
    warnings.push({
      code: 'cleanup.round-trip-tolerance',
      message: `the level misses the target: relative residual ${Math.abs(residual)} against the acceptance ${tol}`,
    });
  }

  const result: SolveResult = { level, reachable: true, method, residual, iterations, ...base() };

  if (input.secantParity === true) {
    const s = secant(g, uLo, uHi === uLo ? uLo + Math.LN10 : uHi, { tol: 1e-12 });
    const sLevel = Math.exp(s.root);
    result.secant = { level: sLevel, iterations: s.iterations, converged: s.converged };
    if (!s.converged) {
      warnings.push({
        code: 'cleanup.secant-not-converged',
        message: `the secant iteration did not converge in ${s.iterations} iterations`,
      });
    } else if (Math.abs(sLevel - level) / level > SECANT_PARITY) {
      warnings.push({
        code: 'cleanup.secant-disagrees',
        message: `the secant iteration gives ${sLevel} against Brent's ${level}`,
      });
    }
    result.evaluations = evaluations;
    result.maxMetric = maxMetric;
  }
  return result;
}
