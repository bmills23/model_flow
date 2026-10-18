import { describe, expect, it } from 'vitest';
import {
  cholesky,
  imanConover,
  percentile,
  sampleLhsMatrix,
  sampleSrsMatrix,
  seedStream,
  spearmanMatrix,
  summarizeSample,
} from '../src/processes/uncertainty/samplers.js';
import {
  distributionQuantile,
  type Distribution,
} from '../src/processes/uncertainty/distributions.js';

const norm: Distribution = { kind: 'normal', mean: 0, sd: 1 };

describe('seed streams', () => {
  it('is deterministic per seed and purpose and independent across purposes', () => {
    const a = seedStream('model-flow', 'lhs');
    const b = seedStream('model-flow', 'lhs');
    const c = seedStream('model-flow', 'ic');
    const d = seedStream(42, 'lhs');
    const xs = [a.nextFloat(), a.nextFloat(), a.nextFloat()];
    expect([b.nextFloat(), b.nextFloat(), b.nextFloat()]).toEqual(xs);
    expect(c.nextFloat()).not.toBe(xs[0]);
    expect(d.nextFloat()).not.toBe(xs[0]);
  });
});

describe('percentile (Hyndman and Fan definition 7)', () => {
  it('interpolates between order statistics', () => {
    const y = [10, 20, 30, 40];
    expect(percentile(y, 0)).toBe(10);
    expect(percentile(y, 1)).toBe(40);
    expect(percentile(y, 0.5)).toBe(25);
    expect(percentile(y, 0.25)).toBeCloseTo(17.5, 12);
    expect(percentile([5], 0.9)).toBe(5);
  });
  it('does not require sorted input and does not mutate it', () => {
    const y = [40, 10, 30, 20];
    expect(percentile(y, 0.5)).toBe(25);
    expect(y).toEqual([40, 10, 30, 20]);
  });
  it('summarizes with the ruling 9 statistics', () => {
    const s = summarizeSample([1, 2, 3, 4, 5]);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.p50).toBe(3);
    expect(s.mean).toBe(3);
    expect(s.sd).toBeCloseTo(Math.sqrt(2.5), 12);
    expect(s.p5).toBeCloseTo(1.2, 12);
    expect(s.p95).toBeCloseTo(4.8, 12);
  });
});

describe('SRS and LHS matrices', () => {
  const dists: Distribution[] = [
    { kind: 'uniform', a: 2, b: 5 },
    norm,
    { kind: 'lognormal', gm: 3, gsd: 1.8 },
  ];
  it('SRS is reproducible from the seed', () => {
    const a = sampleSrsMatrix(dists, 50, seedStream('s', 'lhs'));
    const b = sampleSrsMatrix(dists, 50, seedStream('s', 'lhs'));
    expect(a).toEqual(b);
    expect(a).toHaveLength(50);
    expect(a[0]).toHaveLength(3);
  });
  it('LHS has exactly one value per stratum in every column (fixture 1)', () => {
    const n = 200;
    const m = sampleLhsMatrix(dists, n, seedStream('s', 'lhs'));
    dists.forEach((d, j) => {
      const strata = new Set<number>();
      for (let i = 0; i < n; i++) {
        const x = (m[i] as number[])[j] as number;
        // Invert through the CDF by bisection on the quantile function.
        let lo = 0;
        let hi = 1;
        for (let it = 0; it < 60; it++) {
          const mid = (lo + hi) / 2;
          if (distributionQuantile(d, mid) < x) lo = mid;
          else hi = mid;
        }
        strata.add(Math.min(n - 1, Math.floor(((lo + hi) / 2) * n)));
      }
      expect(strata.size).toBe(n);
    });
  });
  it('LHS beats SRS on the sample mean spread (variance reduction)', () => {
    const spread = (f: typeof sampleLhsMatrix): number => {
      const means: number[] = [];
      for (let r = 0; r < 60; r++) {
        const m = f([norm], 100, seedStream(`r${r}`, 'lhs'));
        means.push(m.reduce((s, row) => s + (row[0] as number), 0) / 100);
      }
      return summarizeSample(means).sd;
    };
    expect(spread(sampleLhsMatrix)).toBeLessThan(0.5 * spread(sampleSrsMatrix));
  });
  it('fixture 3: LHS and SRS reproduce analytic lognormal risk percentiles', () => {
    // Y = A B / W with lognormal factors is lognormal; sigma2 is the sum.
    const fac = [
      { kind: 'lognormal', gm: 2, gsd: 1.6 },
      { kind: 'lognormal', gm: 5, gsd: 2.1 },
      { kind: 'lognormal', gm: 70, gsd: 1.3 },
    ] as const satisfies readonly Distribution[];
    const mu = Math.log(2) + Math.log(5) - Math.log(70);
    const s2 = Math.log(1.6) ** 2 + Math.log(2.1) ** 2 + Math.log(1.3) ** 2;
    const z = { p5: -1.6448536269514722, p50: 0, p95: 1.6448536269514722 };
    const check = (m: number[][], tol: number): void => {
      const y = m.map((r) => ((r[0] as number) * (r[1] as number)) / (r[2] as number));
      const s = summarizeSample(y);
      for (const k of ['p5', 'p50', 'p95'] as const) {
        const exact = Math.exp(mu + Math.sqrt(s2) * z[k]);
        expect(Math.abs(s[k] / exact - 1)).toBeLessThan(tol);
      }
    };
    check(sampleLhsMatrix([...fac], 10000, seedStream('fx3', 'lhs')), 0.02);
    check(sampleSrsMatrix([...fac], 10000, seedStream('fx3', 'lhs')), 0.05);
  });
});

describe('Cholesky', () => {
  it('factors a positive definite matrix and rejects others', () => {
    const l = cholesky([
      [4, 2],
      [2, 3],
    ]);
    expect(l).not.toBeNull();
    const L = l as number[][];
    expect((L[0] as number[])[0]).toBeCloseTo(2, 12);
    expect((L[1] as number[])[0]).toBeCloseTo(1, 12);
    expect((L[1] as number[])[1]).toBeCloseTo(Math.sqrt(2), 12);
    expect(
      cholesky([
        [1, 2],
        [2, 1],
      ]),
    ).toBeNull();
  });
});

describe('Iman-Conover', () => {
  const n = 1000;
  const dists: Distribution[] = [
    { kind: 'lognormal', gm: 3, gsd: 1.8 },
    { kind: 'uniform', a: 0, b: 10 },
    norm,
  ];
  const C = [
    [1, 0.7, -0.3],
    [0.7, 1, 0],
    [-0.3, 0, 1],
  ];
  it('fixture 4: achieves the target Spearman within 0.05 and permutes each column (fixture 1)', () => {
    const base = sampleLhsMatrix(dists, n, seedStream('ic', 'lhs'));
    const r = imanConover(base, C, seedStream('ic', 'ic'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rho = spearmanMatrix(r.values);
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++)
        expect(Math.abs((rho[a] as number[])[b]! - (C[a] as number[])[b]!)).toBeLessThan(0.05);
    expect(r.achieved).toEqual(rho);
    for (let j = 0; j < 3; j++) {
      const before = base.map((row) => row[j] as number).sort((x, y) => x - y);
      const after = r.values.map((row) => row[j] as number).sort((x, y) => x - y);
      expect(after).toEqual(before);
    }
    expect(r.warnings).toEqual([]);
  });
  it('is reproducible from the seed', () => {
    const base = sampleLhsMatrix(dists, 100, seedStream('ic', 'lhs'));
    const a = imanConover(base, C, seedStream('ic', 'ic'));
    const b = imanConover(base, C, seedStream('ic', 'ic'));
    expect(a).toEqual(b);
  });
  it('does not mutate the input matrix', () => {
    const base = sampleLhsMatrix(dists, 100, seedStream('ic', 'lhs'));
    const copy = base.map((r) => [...r]);
    imanConover(base, C, seedStream('ic', 'ic'));
    expect(base).toEqual(copy);
  });
  it('refuses a non positive definite or malformed C', () => {
    const base = sampleLhsMatrix(dists, 100, seedStream('ic', 'lhs'));
    const bad = [
      [1, 0.9, -0.9],
      [0.9, 1, 0.9],
      [-0.9, 0.9, 1],
    ];
    const asym = [
      [1, 0.5, 0],
      [0.2, 1, 0],
      [0, 0, 1],
    ];
    const diag = [
      [2, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    for (const m of [bad, asym, diag]) {
      const r = imanConover(base, m, seedStream('ic', 'ic'));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issue.code).toBe('uncertainty.correlation-not-positive-definite');
    }
  });
  it('warns when n < 5k and refuses n <= k', () => {
    const small = sampleLhsMatrix(dists, 10, seedStream('ic', 'lhs'));
    const r = imanConover(small, C, seedStream('ic', 'ic'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings[0]?.code).toBe('uncertainty.small-sample-correlation');
    const tiny = sampleLhsMatrix(dists, 3, seedStream('ic', 'lhs'));
    expect(imanConover(tiny, C, seedStream('ic', 'ic')).ok).toBe(false);
  });
});
