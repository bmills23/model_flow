import { describe, expect, it } from 'vitest';
import { normalCdf, normalQuantile } from '../src/numerics/special.js';

describe('AS 241 inverse normal (Wichura 1988)', () => {
  it('matches known normal quantiles', () => {
    expect(normalQuantile(0.5)).toBe(0);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 13);
    expect(normalQuantile(0.025)).toBeCloseTo(-1.959963984540054, 13);
    expect(normalQuantile(0.99)).toBeCloseTo(2.326347874040841, 13);
    expect(normalQuantile(0.9)).toBeCloseTo(1.2815515655446004, 13);
    expect(normalQuantile(0.95)).toBeCloseTo(1.6448536269514722, 13);
    expect(normalQuantile(0.999)).toBeCloseTo(3.090232306167813, 12);
  });

  it('is antisymmetric and handles the ends', () => {
    expect(normalQuantile(0.001)).toBeCloseTo(-normalQuantile(0.999), 12);
    expect(normalQuantile(0)).toBe(-Infinity);
    expect(normalQuantile(1)).toBe(Infinity);
    expect(Number.isNaN(normalQuantile(-0.1))).toBe(true);
    expect(Number.isNaN(normalQuantile(1.1))).toBe(true);
  });

  it('round trips Phi^-1(Phi(z)) = z for z in [-8, 8] across all three branches', () => {
    for (let z = -8; z <= 8; z += 0.05) {
      const back = normalQuantile(normalCdf(z));
      // Lower half and centre: the 1e-14 target. Upper tail: Phi(z) near 1 is stored with an
      // absolute error of about 1e-16, which moves z by 1e-16 / phi(z), so the bound follows that.
      const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
      const tol = z <= 0.5 ? 1e-14 : 1e-14 + 4e-16 / phi;
      expect(Math.abs(back - z)).toBeLessThan(tol);
    }
  });
});
