import { describe, expect, it } from 'vitest';
import { bracketRoot, brent, secant } from '../src/numerics/roots.js';

describe('brent', () => {
  it('finds the root of x^3 - 2x - 5 on [2, 3]', () => {
    const r = brent((x) => x * x * x - 2 * x - 5, 2, 3);
    expect(r.root).toBeCloseTo(2.0945514815423265, 10);
    expect(r.converged).toBe(true);
  });

  it('finds the fixed point of cos', () => {
    expect(brent((x) => Math.cos(x) - x, 0, 1).root).toBeCloseTo(0.7390851332151607, 10);
  });

  it('returns an endpoint that is already a root', () => {
    expect(brent((x) => x - 1, 1, 3).root).toBe(1);
  });

  it('throws when the interval does not bracket a root', () => {
    expect(() => brent((x) => x * x + 1, -1, 1)).toThrow(/bracket/);
  });
});

describe('secant', () => {
  it('finds ln 2 as the root of exp(x) - 2', () => {
    const r = secant((x) => Math.exp(x) - 2, 0, 1);
    expect(r.root).toBeCloseTo(Math.LN2, 10);
    expect(r.converged).toBe(true);
  });

  it('reports non-convergence for a function without a real root', () => {
    const r = secant((x) => x * x + 1, 0, 1, { maxIter: 20 });
    expect(r.converged).toBe(false);
  });
});

describe('bracketRoot', () => {
  it('expands upward from a start point until the sign changes', () => {
    const [a, b] = bracketRoot((x) => x - 10, 1, { growth: 2 });
    expect(a).toBeLessThan(10);
    expect(b).toBeGreaterThanOrEqual(10);
  });

  it('throws when no sign change is found within the expansion budget', () => {
    expect(() => bracketRoot((x) => x * x + 1, 1, { maxExpansions: 5 })).toThrow(/sign change/);
  });
});
