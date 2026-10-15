import { describe, expect, it } from 'vitest';
import { integrate, integrateSemiInfinite, integrateTanhSinh } from '../src/numerics/quadrature.js';
import { erfc } from '../src/numerics/special.js';

describe('integrate (adaptive Gauss-Kronrod)', () => {
  it('integrates a polynomial exactly', () => {
    const r = integrate((x) => x * x, 0, 1);
    expect(r.value).toBeCloseTo(1 / 3, 12);
    expect(r.converged).toBe(true);
  });

  it('integrates sin over [0, pi]', () => {
    expect(integrate(Math.sin, 0, Math.PI).value).toBeCloseTo(2, 10);
  });

  it('integrates a Gaussian against erf', () => {
    const r = integrate((x) => Math.exp(-x * x), -1, 1);
    expect(r.value).toBeCloseTo(Math.sqrt(Math.PI) * 0.842700792949715, 10);
  });

  it('returns zero for equal limits and flips sign for reversed limits', () => {
    expect(integrate((x) => x, 2, 2).value).toBe(0);
    expect(integrate((x) => x, 1, 0).value).toBeCloseTo(-0.5, 12);
  });

  it('reports non-convergence when the depth budget is exhausted', () => {
    const r = integrate((x) => 1 / Math.sqrt(x), 1e-12, 1, { maxDepth: 2, relTol: 1e-12 });
    expect(r.converged).toBe(false);
  });
});

describe('integrateTanhSinh (endpoint singularities)', () => {
  it('handles an inverse square-root singularity at the lower limit', () => {
    expect(integrateTanhSinh((x) => 1 / Math.sqrt(x), 0, 1).value).toBeCloseTo(2, 8);
  });

  it('handles a logarithmic singularity', () => {
    expect(integrateTanhSinh(Math.log, 0, 1).value).toBeCloseTo(-1, 8);
  });
});

describe('integrateSemiInfinite', () => {
  it('integrates exp(-x) over [0, inf)', () => {
    expect(integrateSemiInfinite((x) => Math.exp(-x), 0).value).toBeCloseTo(1, 8);
  });

  it('integrates a Gaussian tail over [0, inf)', () => {
    expect(integrateSemiInfinite((x) => Math.exp(-x * x), 0).value).toBeCloseTo(
      Math.sqrt(Math.PI) / 2,
      8,
    );
  });
});

describe('Green-function style integrand', () => {
  it('agrees between Gauss-Kronrod and tanh-sinh for exp(-lambda t) erfc(c / sqrt(t))', () => {
    const f = (t: number) => (t <= 0 ? 0 : Math.exp(-0.01 * t) * erfc(2 / Math.sqrt(t)));
    const a = integrate(f, 0, 50).value;
    const b = integrateTanhSinh(f, 0, 50).value;
    expect(a).toBeCloseTo(b, 8);
    expect(a).toBeGreaterThan(0);
  });
});
