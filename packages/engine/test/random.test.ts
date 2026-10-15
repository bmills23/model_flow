import { describe, expect, it } from 'vitest';
import { Xoshiro128ss, latinHypercube } from '../src/numerics/random.js';

describe('Xoshiro128ss', () => {
  it('is deterministic for the same seed', () => {
    const a = new Xoshiro128ss(42);
    const b = new Xoshiro128ss(42);
    const seqA = Array.from({ length: 5 }, () => a.nextFloat());
    const seqB = Array.from({ length: 5 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });

  it('differs for different seeds, including string seeds', () => {
    const a = new Xoshiro128ss('site-a').nextFloat();
    const b = new Xoshiro128ss('site-b').nextFloat();
    expect(a).not.toBe(b);
  });

  it('produces floats in [0, 1) with mean near one half', () => {
    const rng = new Xoshiro128ss(7);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
  });
});

describe('latinHypercube', () => {
  it('places exactly one sample in each stratum of every dimension', () => {
    const n = 20;
    const dims = 3;
    const samples = latinHypercube(n, dims, new Xoshiro128ss(3));
    expect(samples).toHaveLength(n);
    for (let d = 0; d < dims; d++) {
      const strata = samples.map((row) => Math.floor((row[d] as number) * n)).sort((x, y) => x - y);
      expect(strata).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });
});
