import { describe, expect, it } from 'vitest';
import { Xoshiro128ss } from '../src/numerics/random.js';
import {
  checkDistribution,
  convertDistributionUnits,
  distributionCdf,
  distributionMean,
  distributionQuantile,
  lognormalFromArithmetic,
  sampleDistribution,
  type Distribution,
} from '../src/processes/uncertainty/distributions.js';

const N = 10000;
function draws(d: Distribution, seed = 'ks'): number[] {
  const rng = new Xoshiro128ss(seed);
  return Array.from({ length: N }, () => sampleDistribution(d, rng.nextFloat()));
}
function ks(xs: number[], d: Distribution): number {
  const s = [...xs].sort((a, b) => a - b);
  let m = 0;
  s.forEach((x, i) => {
    const f = distributionCdf(d, x);
    m = Math.max(m, Math.abs(f - i / s.length), Math.abs(f - (i + 1) / s.length));
  });
  return m;
}
const crit = 1.63 / Math.sqrt(N);
const open: [number, number] = [-Infinity, Infinity];

const kinds: Record<string, Distribution> = {
  uniform: { kind: 'uniform', a: 2, b: 5 },
  loguniform: { kind: 'loguniform', a: 0.1, b: 100 },
  triangular: { kind: 'triangular', a: 1, mode: 2, b: 6 },
  normal: { kind: 'normal', mean: 70, sd: 12 },
  lognormal: { kind: 'lognormal', gm: 3, gsd: 1.8 },
  empirical: { kind: 'empirical', values: [1, 2, 4, 10], probs: [0, 0.3, 0.7, 1] },
};

describe('distribution library', () => {
  for (const [name, d] of Object.entries(kinds)) {
    it(`${name}: KS distance to the analytic CDF is below the 1 percent critical value`, () => {
      expect(ks(draws(d), d)).toBeLessThan(crit);
    });
    it(`${name}: cdf inverts quantile`, () => {
      for (const u of [0.05, 0.3, 0.5, 0.8, 0.95]) {
        expect(distributionCdf(d, distributionQuantile(d, u))).toBeCloseTo(u, 9);
      }
    });
  }

  it('constant always returns its value', () => {
    expect(sampleDistribution({ kind: 'constant', value: 4.2 }, 0.37)).toBe(4.2);
  });

  it('has analytic quantiles and means', () => {
    expect(distributionQuantile({ kind: 'uniform', a: 2, b: 6 }, 0.25)).toBe(3);
    expect(distributionQuantile({ kind: 'loguniform', a: 1, b: 100 }, 0.5)).toBeCloseTo(10, 12);
    expect(distributionQuantile({ kind: 'normal', mean: 10, sd: 2 }, 0.975)).toBeCloseTo(
      10 + 2 * 1.959963984540054,
      12,
    );
    expect(distributionQuantile({ kind: 'lognormal', gm: 5, gsd: 2 }, 0.5)).toBeCloseTo(5, 12);
    const tri: Distribution = { kind: 'triangular', a: 0, mode: 1, b: 4 };
    expect(distributionQuantile(tri, 0.25)).toBeCloseTo(1, 12);
    expect(distributionMean(tri)).toBeCloseTo(5 / 3, 12);
    expect(distributionMean({ kind: 'lognormal', gm: 3, gsd: 1.8 })).toBeCloseTo(
      3 * Math.exp(Math.log(1.8) ** 2 / 2),
      12,
    );
  });

  it('empirical interpolates the inverse piecewise linearly', () => {
    const d = kinds.empirical as Distribution;
    expect(distributionQuantile(d, 0.15)).toBeCloseTo(1.5, 12);
    expect(distributionQuantile(d, 0.5)).toBeCloseTo(3, 12);
  });

  it('converts arithmetic lognormal moments by sigma2 = ln(1 + s2/m2)', () => {
    const d = lognormalFromArithmetic(10, 5);
    const sigma2 = Math.log(1 + 0.25);
    expect(Math.log(d.gsd) ** 2).toBeCloseTo(sigma2, 12);
    expect(d.gm).toBeCloseTo(Math.exp(Math.log(10) - sigma2 / 2), 12);
    expect(distributionMean(d)).toBeCloseTo(10, 10);
  });

  describe('truncation', () => {
    it('maps u into [F(lo), F(hi)] and never rejects', () => {
      const d: Distribution = { kind: 'normal', mean: 0, sd: 1, lo: -1, hi: 2 };
      expect(sampleDistribution(d, 0)).toBeCloseTo(-1, 9);
      expect(sampleDistribution(d, 1 - 1e-15)).toBeCloseTo(2, 6);
      const xs = draws(d);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1);
      expect(Math.max(...xs)).toBeLessThanOrEqual(2);
      expect(ks(xs, d)).toBeLessThan(crit);
    });
    it('keeps a one-sided lognormal truncation exact and monotone in u', () => {
      const d: Distribution = { kind: 'lognormal', gm: 3, gsd: 1.8, hi: 6 };
      const xs = draws(d);
      expect(Math.max(...xs)).toBeLessThanOrEqual(6);
      let prev = -Infinity;
      for (let i = 0; i < 100; i++) {
        const x = sampleDistribution(d, (i + 0.5) / 100);
        expect(x).toBeGreaterThan(prev);
        prev = x;
      }
    });
    it('truncates uniform, triangular, log-uniform and empirical exactly', () => {
      for (const k of ['uniform', 'triangular', 'loguniform', 'empirical']) {
        const d = { ...(kinds[k] as Distribution), lo: 2.5, hi: 3.5 } as Distribution;
        const xs = draws(d);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(2.5 - 1e-12);
        expect(Math.max(...xs)).toBeLessThanOrEqual(3.5 + 1e-12);
      }
    });
  });

  describe('unit conversion', () => {
    it('scales location and spread, and a lognormal stays lognormal', () => {
      expect(convertDistributionUnits({ kind: 'normal', mean: 2, sd: 0.5, lo: 0 }, 1000)).toEqual({
        kind: 'normal',
        mean: 2000,
        sd: 500,
        lo: 0,
      });
      expect(convertDistributionUnits({ kind: 'lognormal', gm: 2, gsd: 1.5, hi: 10 }, 3)).toEqual({
        kind: 'lognormal',
        gm: 6,
        gsd: 1.5,
        hi: 30,
      });
      expect(convertDistributionUnits({ kind: 'uniform', a: 1, b: 2 }, 5)).toEqual({
        kind: 'uniform',
        a: 5,
        b: 10,
      });
    });
  });

  describe('checks', () => {
    it('refuses invalid parameters with uncertainty.bad-distribution', () => {
      const bad: Distribution[] = [
        { kind: 'uniform', a: 3, b: 3 },
        { kind: 'loguniform', a: 0, b: 2 },
        { kind: 'triangular', a: 0, mode: 5, b: 4 },
        { kind: 'normal', mean: 0, sd: 0 },
        { kind: 'lognormal', gm: 1, gsd: 1 },
        { kind: 'empirical', values: [1, 3, 2], probs: [0, 0.5, 1] },
        { kind: 'normal', mean: 0, sd: 1, lo: 2, hi: 1 },
      ];
      for (const d of bad) {
        expect(checkDistribution(d, open).map((w) => w.code)).toContain(
          'uncertainty.bad-distribution',
        );
      }
      expect(checkDistribution(kinds.normal as Distribution, open)).toEqual([]);
    });
    it('refuses support outside the declared bounds unless truncated into them', () => {
      const n: Distribution = { kind: 'normal', mean: 70, sd: 12 };
      expect(checkDistribution(n, [0, Infinity]).map((w) => w.code)).toContain(
        'uncertainty.support-outside-bounds',
      );
      expect(checkDistribution({ ...n, lo: 1 }, [0, Infinity])).toEqual([]);
      expect(checkDistribution({ kind: 'lognormal', gm: 1, gsd: 2 }, [0, Infinity])).toEqual([]);
      expect(
        checkDistribution({ kind: 'uniform', a: 0, b: 2 }, [0, 1]).map((w) => w.code),
      ).toContain('uncertainty.support-outside-bounds');
    });
  });
});
