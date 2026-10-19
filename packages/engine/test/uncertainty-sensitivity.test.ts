import { describe, expect, it } from 'vitest';
import {
  registry,
  runSobol,
  runTornado,
  spearmanWithOutput,
  uncertaintySobolSaltelli,
  uncertaintySpec,
  type Distribution,
  type SobolSpec,
  type UncertainInput,
  type UncertaintySpec,
} from '../src/index.js';

interface V {
  x: number[];
}
const vInput = (j: number): UncertainInput<V> => ({
  id: `m.x${j}`,
  label: `x${j}`,
  unit: '1',
  category: 'exposure',
  bounds: [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
  get: (i) => i.x[j] as number,
  set: (i, v) => {
    const x = [...i.x];
    x[j] = v;
    return { x };
  },
});
const model = (k: number, run: (x: number[]) => number) => ({
  uncertainInputs: Array.from({ length: k }, (_, j) => vInput(j)),
  run: (i: V) => run(i.x),
});
const spec = (
  k: number,
  run: (x: number[]) => number,
  dists: Distribution[],
  over: Partial<SobolSpec<V, number>> = {},
): SobolSpec<V, number> => ({
  model: model(k, run),
  base: { x: new Array<number>(k).fill(0) },
  distributions: Object.fromEntries(dists.map((d, j) => [`m.x${j}`, d])),
  output: (y) => y,
  scale: 'raw',
  ...over,
});

const A = 7;
const B = 0.1;
const ishigami = (x: number[]) =>
  Math.sin(x[0] as number) +
  A * Math.sin(x[1] as number) ** 2 +
  B * (x[2] as number) ** 4 * Math.sin(x[0] as number);
const pi = Math.PI;
const U: Distribution = { kind: 'uniform', a: -pi, b: pi };

describe('sobol: Ishigami (fixture 5)', () => {
  const V = (A * A) / 8 + (B * pi ** 4) / 5 + (B * B * pi ** 8) / 18 + 0.5;
  const V1 = 0.5 * (1 + (B * pi ** 4) / 5) ** 2;
  const V2 = (A * A) / 8;
  const V13 = (8 * B * B * pi ** 8) / 225;
  const S = [V1 / V, V2 / V, 0];
  const ST = [(V1 + V13) / V, V2 / V, V13 / V];
  it('N = 8192 matches the closed-form indices within 0.03', () => {
    const r = runSobol(spec(3, ishigami, [U, U, U], { n: 8192 }));
    expect(r.runs).toBe(8192 * 5);
    r.firstRaw.forEach((s, j) => expect(Math.abs(s - (S[j] as number))).toBeLessThan(0.03));
    r.total.forEach((s, j) => expect(Math.abs(s - (ST[j] as number))).toBeLessThan(0.03));
  }, 60000);
});

describe('sobol: linear additive model', () => {
  const a = [1, 2, 3];
  const s = [1, 0.5, 2];
  const dists: Distribution[] = s.map((sd) => ({ kind: 'normal', mean: 0, sd }));
  it('S_j = ST_j = a^2 s^2 / sum within 0.02', () => {
    const r = runSobol(
      spec(3, (x) => x.reduce((t, v, j) => t + (a[j] as number) * v, 0), dists, { n: 8192 }),
    );
    const w = a.map((aj, j) => (aj * (s[j] as number)) ** 2);
    const tot = w.reduce((p, q) => p + q, 0);
    w.forEach((wj, j) => {
      expect(Math.abs((r.firstRaw[j] as number) - wj / tot)).toBeLessThan(0.02);
      expect(Math.abs((r.total[j] as number) - wj / tot)).toBeLessThan(0.02);
    });
  }, 60000);
});

describe('sobol: bootstrap, flags and reproducibility', () => {
  const lin = (x: number[]) => (x[0] as number) + 3 * (x[1] as number);
  const dists: Distribution[] = [U, U];
  it('same seed is bit-identical, intervals bracket the estimates, chunk size is irrelevant', () => {
    const r1 = runSobol(spec(2, lin, dists, { n: 256, seed: 's1' }));
    const r2 = runSobol(spec(2, lin, dists, { n: 256, seed: 's1', chunkSize: 7 }));
    expect(r2.first).toEqual(r1.first);
    expect(r2.firstInterval).toEqual(r1.firstInterval);
    r1.firstRaw.forEach((s, j) => {
      const [lo, hi] = r1.firstInterval[j] as [number, number];
      expect(lo).toBeLessThanOrEqual(s);
      expect(hi).toBeGreaterThanOrEqual(s);
    });
    const r3 = runSobol(spec(2, lin, dists, { n: 256, seed: 's2' }));
    expect(r3.firstRaw).not.toEqual(r1.firstRaw);
  });
  it('a tiny N is flagged not converged', () => {
    const r = runSobol(spec(2, lin, dists, { n: 16 }));
    expect(r.warnings.map((w) => w.code)).toContain('uncertainty.sobol-not-converged');
  });
  it('log scale is the default and falls back to raw with a warning on nonpositive output', () => {
    const pos = spec(2, (x) => Math.exp(0.3 * (x[0] as number) + 0.1 * (x[1] as number)), dists, {
      n: 64,
    });
    delete (pos as { scale?: string }).scale;
    expect(runSobol(pos).scale).toBe('log10');
    const neg = spec(2, lin, dists, { n: 64 });
    delete (neg as { scale?: string }).scale;
    const r = runSobol(neg);
    expect(r.scale).toBe('raw');
    expect(r.warnings.map((w) => w.code)).toContain('uncertainty.sobol-log-nonpositive');
  });
  it('a correlation matrix is ignored with a warning', () => {
    const r = runSobol(
      spec(2, lin, dists, {
        n: 64,
        correlation: {
          ids: ['m.x0', 'm.x1'],
          matrix: [
            [1, 0.5],
            [0.5, 1],
          ],
        },
      }),
    );
    expect(r.warnings.map((w) => w.code)).toContain('uncertainty.sobol-correlated-inputs');
  });
  it('a negative first order estimate inside its interval of zero is shown as zero', () => {
    const r = runSobol(spec(3, (x) => x[0] as number, [U, U, U], { n: 128 }));
    r.firstRaw.forEach((raw, j) => {
      if (raw < 0) expect(r.first[j]).toBe(0);
      else expect(r.first[j]).toBe(raw);
    });
    expect(r.first.every((s) => s >= 0)).toBe(true);
  });
  it('failed rows are dropped from all designs together and counted', () => {
    const r = runSobol(
      spec(
        2,
        (x) => {
          if ((x[0] as number) > 3) throw new RangeError('boom');
          return lin(x);
        },
        dists,
        { n: 128 },
      ),
    );
    expect(r.failedRows).toBeGreaterThan(0);
    expect(r.used + r.failedRows).toBe(128);
  });
});

describe('registered sobol method', () => {
  it('is registered as a modern montecarlo method with used citations', () => {
    const m = registry.get('uncertainty.sobol-saltelli');
    expect(m.kind).toBe('modern');
    expect(m.process).toBe('montecarlo');
    expect(m.citations).toEqual(expect.arrayContaining(['saltelli2010', 'jansen1999']));
    const s = uncertaintySpec(
      spec(2, (x) => (x[0] as number) + (x[1] as number), [U, U], { n: 64 }) as UncertaintySpec<
        unknown,
        unknown
      >,
    );
    expect(uncertaintySobolSaltelli.run(s as never).used).toBe(64);
  });
});

describe('tornado', () => {
  const dists: Distribution[] = [
    { kind: 'uniform', a: 0, b: 10 },
    { kind: 'uniform', a: 0, b: 1 },
  ];
  const sp = spec(2, (x) => 2 * (x[0] as number) + 5 * (x[1] as number), dists);
  it('sets one input to its 5th and 95th percentiles, others at base, sorted by swing', () => {
    const base = { x: [5, 0.5] };
    const t = runTornado({ ...sp, base });
    expect(t.baseOutput).toBeCloseTo(12.5, 12);
    const x0 = t.entries.find((e) => e.id === 'm.x0');
    expect(x0?.lowInput).toBeCloseTo(0.5, 12);
    expect(x0?.highInput).toBeCloseTo(9.5, 12);
    expect(x0?.low).toBeCloseTo(2 * 0.5 + 2.5, 12);
    expect(x0?.high).toBeCloseTo(2 * 9.5 + 2.5, 12);
    expect(x0?.swing).toBeCloseTo(18, 12);
    expect(t.entries[0]?.id).toBe('m.x0');
    expect(t.entries[1]?.swing).toBeCloseTo(4.5, 12);
    expect(t.runs).toBe(5);
  });
});

describe('spearman against the output', () => {
  it('is 1 for a monotone increasing input and -1 for a decreasing one', () => {
    const samples = [1, 2, 3, 4, 5].map((v, i) => [v, 10 - v, [3, 1, 4, 1.5, 9][i] as number]);
    const outputs = samples.map((r) => (r[0] as number) ** 3);
    const rho = spearmanWithOutput(samples, outputs);
    expect(rho[0]).toBeCloseTo(1, 12);
    expect(rho[1]).toBeCloseTo(-1, 12);
    expect(Math.abs(rho[2] as number)).toBeLessThan(1);
  });
  it('skips failed (NaN) rows', () => {
    const samples = [[1], [2], [3], [4]];
    const rho = spearmanWithOutput(samples, [1, Number.NaN, 3, 4]);
    expect(rho[0]).toBeCloseTo(1, 12);
  });
});

describe('sobol: invariance to an additive offset of the output', () => {
  const lin = (x: number[]) => (x[0] as number) + 2 * (x[1] as number) + 0.5 * (x[2] as number);
  const dists: Distribution[] = [U, U, U];
  const close = (a: readonly number[], b: readonly number[]) =>
    a.forEach((v, j) => expect(Math.abs(v - (b[j] as number))).toBeLessThan(1e-9));
  const closeIv = (a: readonly [number, number][], b: readonly [number, number][]) =>
    a.forEach((iv, j) => close(iv, b[j] as [number, number]));
  it('adding 100 to a mean-zero model leaves the indices and intervals unchanged', () => {
    const r0 = runSobol(spec(3, lin, dists, { n: 512, seed: 'shift' }));
    const r1 = runSobol(spec(3, (x) => lin(x) + 100, dists, { n: 512, seed: 'shift' }));
    close(r1.firstRaw, r0.firstRaw);
    close(r1.total, r0.total);
    closeIv(r1.firstInterval, r0.firstInterval);
    closeIv(r1.totalInterval, r0.totalInterval);
  });
  it('with an offset of 100, doubling N twice clears the not converged flag', () => {
    const r = runSobol(spec(3, (x) => lin(x) + 100, dists, { n: 2048, seed: 'shift' }));
    expect(r.warnings.map((w) => w.code)).not.toContain('uncertainty.sobol-not-converged');
  });
  it('on the log10 scale a 1e-6 scale output gives the same indices as the unscaled one', () => {
    const LN: Distribution = { kind: 'lognormal', gm: 1, gsd: 2 };
    const prod = (x: number[]) => (x[0] as number) * (x[1] as number) ** 0.5 * (x[2] as number) ** 2;
    const log = { n: 512, seed: 'log', scale: 'log10' as const };
    const r0 = runSobol(spec(3, prod, [LN, LN, LN], log));
    const r1 = runSobol(spec(3, (x) => 1e-6 * prod(x), [LN, LN, LN], log));
    close(r1.firstRaw, r0.firstRaw);
    close(r1.total, r0.total);
    closeIv(r1.firstInterval, r0.firstInterval);
    closeIv(r1.totalInterval, r0.totalInterval);
    // log10 Y is additive in log10 X_j with weights 1, 0.5 and 2 on equal variances.
    const w = [1, 0.25, 4];
    const tot = w.reduce((p, q) => p + q, 0);
    r1.firstInterval.forEach(([lo, hi], j) => {
      expect(lo).toBeLessThanOrEqual((w[j] as number) / tot);
      expect(hi).toBeGreaterThanOrEqual((w[j] as number) / tot);
      expect(hi - lo).toBeLessThan(0.25);
    });
  });
});
