export interface RootOptions {
  /** Absolute tolerance on the root location. */
  tol?: number;
  maxIter?: number;
}

export interface RootResult {
  root: number;
  iterations: number;
  converged: boolean;
}

type Fn = (x: number) => number;

/**
 * Brent's method (Brent 1973; the zeroin algorithm) for a root bracketed by [a, b].
 * Throws if f(a) and f(b) do not differ in sign.
 */
export function brent(f: Fn, a: number, b: number, opts: RootOptions = {}): RootResult {
  const tol = opts.tol ?? 1e-12;
  const maxIter = opts.maxIter ?? 200;
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return { root: a, iterations: 0, converged: true };
  if (fb === 0) return { root: b, iterations: 0, converged: true };
  if (Math.sign(fa) === Math.sign(fb)) {
    throw new RangeError(`brent: interval [${a}, ${b}] does not bracket a root`);
  }
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let iter = 1; iter <= maxIter; iter++) {
    if (Math.sign(fb) === Math.sign(fc)) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return { root: b, iterations: iter, converged: true };
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      const min1 = 3 * xm * q - Math.abs(tol1 * q);
      const min2 = Math.abs(e * q);
      if (2 * p < Math.min(min1, min2)) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : Math.sign(xm) * tol1;
    fb = f(b);
  }
  return { root: b, iterations: maxIter, converged: false };
}

/** Secant iteration from two starting points. Never throws; reports convergence. */
export function secant(f: Fn, x0: number, x1: number, opts: RootOptions = {}): RootResult {
  const tol = opts.tol ?? 1e-12;
  const maxIter = opts.maxIter ?? 100;
  let f0 = f(x0);
  let f1 = f(x1);
  for (let iter = 1; iter <= maxIter; iter++) {
    if (f1 === 0) return { root: x1, iterations: iter, converged: true };
    const denom = f1 - f0;
    if (denom === 0 || !Number.isFinite(denom)) {
      return { root: x1, iterations: iter, converged: false };
    }
    const x2 = x1 - (f1 * (x1 - x0)) / denom;
    if (!Number.isFinite(x2)) return { root: x1, iterations: iter, converged: false };
    if (Math.abs(x2 - x1) <= tol * Math.max(1, Math.abs(x2))) {
      return { root: x2, iterations: iter, converged: true };
    }
    x0 = x1;
    f0 = f1;
    x1 = x2;
    f1 = f(x1);
  }
  return { root: x1, iterations: maxIter, converged: false };
}

export interface BracketOptions {
  /** Multiplicative growth of the upper end per expansion (for positive start points). */
  growth?: number;
  maxExpansions?: number;
}

/**
 * Expands upward from a start point until f changes sign, returning [lower, upper].
 * Intended for positive quantities such as source concentrations in back-calculation.
 */
export function bracketRoot(f: Fn, x0: number, opts: BracketOptions = {}): [number, number] {
  const growth = opts.growth ?? 2;
  const maxExpansions = opts.maxExpansions ?? 60;
  let a = x0;
  let fa = f(a);
  if (fa === 0) return [a, a];
  let b = x0 > 0 ? x0 * growth : x0 + 1;
  for (let i = 0; i < maxExpansions; i++) {
    const fb = f(b);
    if (fb === 0 || Math.sign(fa) !== Math.sign(fb)) return [a, b];
    a = b;
    fa = fb;
    b = b > 0 ? b * growth : b + 1;
  }
  throw new RangeError(`bracketRoot: no sign change found after ${maxExpansions} expansions`);
}
