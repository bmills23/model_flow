import { describe, expect, it } from 'vitest';
import {
  normalQuantile,
  registry,
  runProbabilisticCleanup,
  solveSourceLevel,
  uncertaintyCleanupProbabilistic,
  uncertaintySpec,
  type CleanupSpec,
  type Distribution,
  type UncertainInput,
} from '../src/index.js';

interface P {
  /** Source-to-metric gain factors: metric(C) = C * a * x / w. */
  x: number;
  w: number;
}
const input = (id: string, key: keyof P): UncertainInput<P> => ({
  id,
  label: id,
  unit: '1',
  category: 'exposure',
  bounds: [0, Number.POSITIVE_INFINITY],
  get: (i) => i[key],
  set: (i, v) => ({ ...i, [key]: v }),
});
const model = {
  uncertainInputs: [input('m.x', 'x'), input('m.w', 'w')],
  run: (i: P) => i,
};

const A = 2e-3;
const TARGET = 1e-6;
const gx = { gm: 3, gsd: 1.8 };
const gw = { gm: 70, gsd: 1.25 };
const dists: Record<string, Distribution> = {
  'm.x': { kind: 'lognormal', ...gx },
  'm.w': { kind: 'lognormal', ...gw },
};
const metricOf =
  (p: P) =>
  (c: number): number =>
    (c * A * p.x) / p.w;
const spec = (over: Partial<CleanupSpec<P>> = {}): CleanupSpec<P> => ({
  model,
  base: { x: 3, w: 70 },
  distributions: dists,
  problem: (p) => ({ metric: metricOf(p), target: TARGET, reference: 1 }),
  n: 4000,
  ...over,
});

// C* = T w / (A x) is lognormal: ln C* = ln(T/A) + ln w - ln x
const mu = Math.log(TARGET / A) + Math.log(gw.gm) - Math.log(gx.gm);
const sigma = Math.sqrt(Math.log(gx.gsd) ** 2 + Math.log(gw.gsd) ** 2);
const analytic = (p: number): number => Math.exp(mu + sigma * normalQuantile(1 - p));

describe('probabilistic cleanup identity (fixture 6)', () => {
  const r = runProbabilisticCleanup(spec());
  it('reports the (1 - p) quantile of the per-iteration levels within 2 percent of the analytic one', () => {
    for (const p of [0.5, 0.9, 0.95]) {
      const got = r.levels.find((l) => l.p === p)?.level as number;
      expect(Math.abs(got / analytic(p) - 1)).toBeLessThan(0.02);
    }
    expect(r.protection.p).toBe(0.95);
  });
  it('each per-iteration level meets its own target', () => {
    r.samples.slice(0, 20).forEach((row, i) => {
      const p = { x: row[0] as number, w: row[1] as number };
      expect(metricOf(p)(r.iterationLevels[i] as number) / TARGET).toBeCloseTo(1, 8);
    });
  });
  it('a forward run at the reported level leaves the exceedance fraction inside the binomial 99 percent band', () => {
    for (const p of [0.9, 0.95]) {
      const level = r.levels.find((l) => l.p === p)?.level as number;
      let exceed = 0;
      for (const row of r.samples) {
        if (metricOf({ x: row[0] as number, w: row[1] as number })(level) > TARGET) exceed++;
      }
      const n = r.n;
      const q = 1 - p;
      const half = 2.576 * Math.sqrt(n * q * (1 - q));
      expect(Math.abs(exceed - n * q)).toBeLessThanOrEqual(half);
    }
  });
  it('counts forward runs, not iterations', () => {
    expect(r.forwardRuns).toBeGreaterThanOrEqual(2 * r.n);
    expect(r.succeeded).toBe(r.n);
    expect(r.censored.count).toBe(0);
  });
});

describe('censoring at the cap', () => {
  // cap at 0.4 mg/L-equivalent chosen near the middle of the distribution
  const cap = analytic(0.7);
  const capped = (over: Partial<CleanupSpec<P>> = {}) =>
    runProbabilisticCleanup(
      spec({
        problem: (p) => ({ metric: metricOf(p), target: TARGET, reference: 1, cap }),
        n: 1000,
        ...over,
      }),
    );
  it('keeps unreachable iterations as censored, counts them and warns', () => {
    const r = capped();
    expect(r.censored.count).toBeGreaterThan(0);
    expect(r.censored.fraction).toBeCloseTo(r.censored.count / r.n, 12);
    expect(r.warnings.map((w) => w.code)).toContain('uncertainty.cleanup-censored');
    expect(r.cap).toBe(cap);
  });
  it('reports a quantile below the cap exactly and one that lands on the cap as not reachable', () => {
    const r = capped();
    const low = r.levels.find((l) => l.p === 0.95);
    expect(low?.reachable).toBe(true);
    expect(Math.abs((low?.level as number) / analytic(0.95) - 1)).toBeLessThan(0.05);
    const high = r.levels.find((l) => l.p === 0.5);
    expect(high?.reachable).toBe(false);
    expect(high?.level).toBeNull();
  });
  it('treats an unreachable iteration without a cap as censored at infinity', () => {
    const r = runProbabilisticCleanup(
      spec({
        n: 50,
        problem: (p) => ({
          metric: (c) => Math.min(metricOf(p)(c), TARGET * 0.5),
          target: TARGET,
          reference: 1,
        }),
      }),
    );
    expect(r.censored.count).toBe(50);
    expect(r.levels.every((l) => !l.reachable)).toBe(true);
  });
});

describe('failures, protection percentile and reproducibility', () => {
  it('counts a refused iteration as failed and flags above 1 percent', () => {
    const r = runProbabilisticCleanup(
      spec({
        n: 200,
        problem: (p) => {
          if (p.w > 70) throw new RangeError('sampled body weight refused');
          return { metric: metricOf(p), target: TARGET, reference: 1 };
        },
      }),
    );
    expect(r.failures.count).toBeGreaterThan(2);
    expect(r.succeeded + r.failures.count).toBe(200);
    expect(r.warnings.map((w) => w.code)).toContain('uncertainty.failed-iterations');
  });
  it('honours a custom protection percentile and always shows 0.5, 0.9 and 0.95', () => {
    const r = runProbabilisticCleanup(spec({ n: 500, protection: 0.8 }));
    expect(r.protection.p).toBe(0.8);
    expect(r.levels.map((l) => l.p)).toEqual(expect.arrayContaining([0.5, 0.8, 0.9, 0.95]));
    const lv = r.levels.map((l) => l.level as number);
    const sorted = [...r.levels].sort((a, b) => a.p - b.p);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]?.level as number).toBeLessThanOrEqual(sorted[i - 1]?.level as number);
    }
    expect(lv.every(Number.isFinite)).toBe(true);
  });
  it('rejects a protection percentile outside (0, 1)', () => {
    expect(() => runProbabilisticCleanup(spec({ protection: 1 }))).toThrow(
      /uncertainty\.bad-specification/,
    );
  });
  it('is bit-identical for one and four chunks', () => {
    const a = runProbabilisticCleanup(spec({ n: 300, chunkSize: 300, seed: 7 }));
    const b = runProbabilisticCleanup(spec({ n: 300, chunkSize: 75, seed: 7 }));
    expect(b.iterationLevels).toEqual(a.iterationLevels);
    expect(b.levels).toEqual(a.levels);
  });
  it('uses the existing solver result: a linear chain solves in the shortcut evaluations', () => {
    const p = { x: 3, w: 70 };
    const s = solveSourceLevel({ metric: metricOf(p), target: TARGET, reference: 1 });
    const r = runProbabilisticCleanup(
      spec({ n: 1, distributions: { 'm.x': { kind: 'constant', value: 3 } } }),
    );
    expect(r.forwardRuns).toBe(s.evaluations);
  });
});

describe('registered method', () => {
  it('is registered as a modern montecarlo method with used citations', () => {
    const m = registry.get('uncertainty.cleanup-probabilistic');
    expect(m.kind).toBe('modern');
    expect(m.process).toBe('montecarlo');
    expect(m.citations).toEqual(expect.arrayContaining(['brent1973', 'mckay1979']));
    const out = uncertaintyCleanupProbabilistic.run(
      uncertaintySpec(spec({ n: 40 }) as never) as never,
    );
    expect(out.succeeded).toBe(40);
  });
});
