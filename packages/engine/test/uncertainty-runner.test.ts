import { describe, expect, it } from 'vitest';
import {
  LEGACY_PRESETS,
  checkUncertainInputs,
  constantEpc,
  exposureLegacy,
  legacyReceptor,
  lPerDayToM3PerS,
  registry,
  yearsToSeconds,
  uncertaintyLhsIc,
  uncertaintySrsExposure,
  runUncertainty,
  evaluateRows,
  buildSampleMatrix,
  normalQuantile,
  type Distribution,
  type LegacyScenarioInput,
  type UncertainInput,
  type UncertaintySpec,
} from '../src/index.js';
import { legacyBenzene } from './scenarioHelpers.js';
import tableR2 from './fixtures/uncertainty/table-r2.json' with { type: 'json' };

interface Toy {
  a: number;
  b: number;
  c: number;
}
const toyInput = (
  key: keyof Toy,
  category: UncertainInput<Toy>['category'] = 'exposure',
): UncertainInput<Toy> => ({
  id: `toy.${key}`,
  label: key,
  unit: '1',
  category,
  bounds: [0, Number.POSITIVE_INFINITY],
  get: (i) => i[key],
  set: (i, v) => ({ ...i, [key]: v }),
});
const toyModel = (cat: UncertainInput<Toy>['category'] = 'exposure') => ({
  uncertainInputs: [toyInput('a', cat), toyInput('b'), toyInput('c')],
  run: (i: Toy) => (i.a * i.b) / i.c,
});
const ln = (gm: number, gsd: number): Distribution => ({ kind: 'lognormal', gm, gsd });
const toySpec = (
  over: Partial<UncertaintySpec<Toy, number>> = {},
): UncertaintySpec<Toy, number> => ({
  model: toyModel(),
  base: { a: 1, b: 1, c: 1 },
  distributions: { 'toy.a': ln(2, 1.5), 'toy.b': ln(3, 1.8), 'toy.c': ln(4, 1.3) },
  output: (y) => y,
  ...over,
});
const run = (m: typeof uncertaintySrsExposure, s: UncertaintySpec<Toy, number>) =>
  m.run(s as unknown as UncertaintySpec<unknown, unknown>);

describe('uncertainty runner: reproducibility', () => {
  it('same seed gives bit-identical output; another seed differs', () => {
    const a = runUncertainty('srs', toySpec({ n: 200, seed: 's1' }));
    const b = runUncertainty('srs', toySpec({ n: 200, seed: 's1' }));
    const c = runUncertainty('srs', toySpec({ n: 200, seed: 's2' }));
    expect(a.outputs).toEqual(b.outputs);
    expect(c.outputs).not.toEqual(a.outputs);
  });
  it('one chunk and four chunks are bit-identical (SRS and LHS with correlation)', () => {
    const corr = {
      ids: ['toy.a', 'toy.b'],
      matrix: [
        [1, 0.6],
        [0.6, 1],
      ],
    };
    for (const kind of ['srs', 'lhs'] as const) {
      const spec = toySpec({
        n: 400,
        seed: 'chunk',
        ...(kind === 'lhs' ? { correlation: corr } : {}),
      });
      const one = runUncertainty(kind, { ...spec, chunkSize: 400 });
      const four = runUncertainty(kind, { ...spec, chunkSize: 100 });
      expect(four.outputs).toEqual(one.outputs);
      expect(four.samples).toEqual(one.samples);
    }
  });
  it('evaluateRows on a slice equals the same rows in a full run', () => {
    const spec = toySpec({ n: 50, seed: 'slice' });
    const full = runUncertainty('srs', spec);
    const ids = full.ids;
    const part = evaluateRows(spec.model, spec.base, ids, full.samples.slice(10, 20), spec.output);
    expect(part.outputs).toEqual(full.outputs.slice(10, 20));
    const m = buildSampleMatrix('srs', spec);
    expect(m.samples).toEqual(full.samples);
  });
});

describe('uncertainty runner: failure accounting', () => {
  const failing = {
    ...toyModel(),
    run: (i: Toy) => {
      if (i.a > 3.2) throw new RangeError('a too large');
      return i.a;
    },
  };
  it('records failed iterations, keeps percentiles over the successes and flags more than 1 percent', () => {
    const r = runUncertainty(
      'srs',
      toySpec({ model: failing, n: 500, seed: 'f', distributions: { 'toy.a': ln(2, 1.5) } }),
    );
    expect(r.failures.count).toBeGreaterThan(5);
    expect(r.succeeded + r.failures.count).toBe(500);
    expect(r.failures.first.length).toBeLessThanOrEqual(5);
    expect(r.failures.first[0]?.message).toMatch(/too large/);
    expect(r.summary?.n).toBe(r.succeeded);
    expect(r.summary?.max as number).toBeLessThanOrEqual(3.2);
    expect(r.warnings.map((w) => w.code)).toContain('uncertainty.failed-iterations');
    expect(r.outputs.filter((v) => Number.isNaN(v)).length).toBe(r.failures.count);
  });
  it('does not warn when failures are at most 1 percent, and treats non-finite output as failed', () => {
    const r = runUncertainty('srs', toySpec({ n: 100, seed: 'ok' }));
    expect(r.warnings).toEqual([]);
    const nan = runUncertainty('srs', toySpec({ n: 20, seed: 'nan', output: () => Number.NaN }));
    expect(nan.failures.count).toBe(20);
    expect(nan.summary).toBeNull();
    expect(nan.failures.first[0]?.code).toBe('uncertainty.non-finite-output');
  });
});

describe('uncertainty runner: refusals', () => {
  it('the legacy method accepts exposure inputs only', () => {
    const spec = toySpec({ model: toyModel('transport') });
    expect(() => run(uncertaintySrsExposure, spec)).toThrow(/category-not-allowed/);
    expect(() => run(uncertaintyLhsIc, spec)).not.toThrow();
  });
  it('refuses a support outside the bounds and bad parameters', () => {
    expect(() =>
      runUncertainty(
        'lhs',
        toySpec({ distributions: { 'toy.a': { kind: 'normal', mean: 1, sd: 1 } } }),
      ),
    ).toThrow(/support-outside-bounds/);
    expect(() =>
      runUncertainty(
        'lhs',
        toySpec({ distributions: { 'toy.a': { kind: 'uniform', a: 2, b: 1 } } }),
      ),
    ).toThrow(/bad-distribution/);
  });
  it('refuses an unknown input id and a correlation that is not positive definite', () => {
    expect(() =>
      runUncertainty('lhs', toySpec({ distributions: { 'toy.zzz': ln(1, 1.2) } })),
    ).toThrow(/toy.zzz/);
    expect(() =>
      runUncertainty(
        'lhs',
        toySpec({
          correlation: {
            ids: ['toy.a', 'toy.b'],
            matrix: [
              [1, 1.2],
              [1.2, 1],
            ],
          },
        }),
      ),
    ).toThrow(/correlation-not-positive-definite/);
  });
  it('refuses a correlation id that is not sampled, and correlation on the legacy method', () => {
    const corr = {
      ids: ['toy.a', 'toy.b'],
      matrix: [
        [1, 0.3],
        [0.3, 1],
      ],
    };
    expect(() =>
      runUncertainty('lhs', toySpec({ distributions: { 'toy.a': ln(2, 1.5) }, correlation: corr })),
    ).toThrow(/toy.b/);
    expect(() => runUncertainty('srs', toySpec({ correlation: corr }))).toThrow(/independent/);
  });
});

describe('modern method: rank correlation', () => {
  it('achieves the target Spearman within 0.05 and reports target and achieved', () => {
    const target = [
      [1, 0.7, -0.3],
      [0.7, 1, 0],
      [-0.3, 0, 1],
    ];
    const r = runUncertainty(
      'lhs',
      toySpec({
        n: 1000,
        seed: 'corr',
        correlation: { ids: ['toy.a', 'toy.b', 'toy.c'], matrix: target },
      }),
    );
    const got = r.correlation?.achieved as number[][];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) expect(Math.abs(got[i]![j]! - target[i]![j]!)).toBeLessThan(0.05);
    expect(r.correlation?.target).toEqual(target);
  });
  it('warns when n is below 5 times the correlated inputs; leaves uncorrelated columns alone', () => {
    const r = runUncertainty(
      'lhs',
      toySpec({
        n: 12,
        seed: 'small',
        correlation: {
          ids: ['toy.a', 'toy.b', 'toy.c'],
          matrix: [
            [1, 0.5, 0],
            [0.5, 1, 0],
            [0, 0, 1],
          ],
        },
      }),
    );
    expect(r.warnings.map((w) => w.code)).toContain('uncertainty.small-sample-correlation');
  });
  it('a partial correlation keeps the uncorrelated column exactly as sampled', () => {
    const base = runUncertainty('lhs', toySpec({ n: 300, seed: 'part' }));
    const corr = runUncertainty(
      'lhs',
      toySpec({
        n: 300,
        seed: 'part',
        correlation: {
          ids: ['toy.a', 'toy.b'],
          matrix: [
            [1, 0.8],
            [0.8, 1],
          ],
        },
      }),
    );
    const col = (m: number[][], j: number) => m.map((r) => r[j] as number);
    expect(col(corr.samples, 2)).toEqual(col(base.samples, 2));
    expect(
      col(corr.samples, 0)
        .slice()
        .sort((x, y) => x - y),
    ).toEqual(
      col(base.samples, 0)
        .slice()
        .sort((x, y) => x - y),
    );
  });
});

describe('analytic lognormal output (fixture 3)', () => {
  // Y = a b / c with lognormal factors is lognormal: ln Y has mean sum of signed ln gm and variance
  // the sum of the squared ln gsd.
  const mu = Math.log(2) + Math.log(3) - Math.log(4);
  const sigma = Math.sqrt(Math.log(1.5) ** 2 + Math.log(1.8) ** 2 + Math.log(1.3) ** 2);
  const exact = (p: number) => Math.exp(mu + sigma * normalQuantile(p));
  for (const [kind, tol] of [
    ['lhs', 0.02],
    ['srs', 0.05],
  ] as const) {
    it(`${kind} at n = 10000: p5, p50 and p95 within ${tol * 100} percent`, () => {
      const r = runUncertainty(kind, toySpec({ n: 10000, seed: 'analytic' }));
      const s = r.summary!;
      expect(Math.abs(s.p5 / exact(0.05) - 1)).toBeLessThan(tol);
      expect(Math.abs(s.p50 / exact(0.5) - 1)).toBeLessThan(tol);
      expect(Math.abs(s.p95 / exact(0.95) - 1)).toBeLessThan(tol);
    });
  }
});

describe('registered methods', () => {
  it('are registered under the planned ids with the planned kinds and defaults', () => {
    expect(registry.get('uncertainty.srs-exposure').kind).toBe('legacy');
    expect(registry.get('uncertainty.lhs-ic').kind).toBe('modern');
    expect(registry.get('uncertainty.srs-exposure').process).toBe('montecarlo');
    const s = run(uncertaintySrsExposure, toySpec({ seed: 'd' }));
    const l = run(uncertaintyLhsIc, toySpec({ seed: 'd' }));
    expect(s.n).toBe(500);
    expect(l.n).toBe(1000);
    expect(s.seed).toBe('d');
    expect(run(uncertaintySrsExposure, toySpec()).seed).toBe('model-flow');
  });
  it('validate reports the small-sample warning without running', () => {
    const w = uncertaintyLhsIc.validate?.({
      ...(toySpec({
        n: 8,
        correlation: {
          ids: ['toy.a', 'toy.b'],
          matrix: [
            [1, 0.2],
            [0.2, 1],
          ],
        },
      }) as unknown as UncertaintySpec<unknown, unknown>),
    });
    expect(w?.map((x) => x.code)).toContain('uncertainty.small-sample-correlation');
  });
});

describe('legacy exposure declarations used by the runner', () => {
  const receptor = legacyReceptor({ ...LEGACY_PRESETS.residentAdultOnly });
  const adult = {
    label: 'adult',
    receptor,
    pathways: ['waterIngestion'],
    chemicals: [
      {
        id: 'benzene',
        chemical: legacyBenzene,
        epcs: { waterIngestion: constantEpc('waterIngestion', tableR2.concentrationMgPerL) },
      },
    ],
  } as const;
  const base: LegacyScenarioInput = { receptors: [adult] };
  // The registry contract probes every declared receptor, so it needs the two-receptor shape.
  const twoReceptors: LegacyScenarioInput = { receptors: [adult, { ...adult, label: 'second' }] };
  it('declares water ingestion and exposure frequency and passes the registry contract', () => {
    const inputs = exposureLegacy.uncertainInputs ?? [];
    const ids = inputs.map((u) => u.id);
    expect(ids).toContain('exposure.receptor0.waterIngestionRate');
    expect(ids).toContain('exposure.receptor0.ef');
    expect(() => checkUncertainInputs(inputs, twoReceptors, 0.5)).not.toThrow();
  });

  // Table R-2 case (ruling 12), smoke test only. The review gives no input distributions, so no
  // comparison with its printed percentiles is made. The spreads below are scaffolding to make the three
  // factors vary, not sourced data (see fixtures/uncertainty/README.md); they carry no claim about RISC.
  it('Table R-2 case runs the legacy method over three sampled receptor factors (smoke test)', () => {
    const bw = { kind: 'normal', mean: 70, sd: 14, lo: 30, hi: 150 } as const;
    const ed = {
      kind: 'lognormal',
      gm: yearsToSeconds(9),
      gsd: 2.2,
      lo: yearsToSeconds(1),
      hi: yearsToSeconds(30),
    } as const;
    const ir = {
      kind: 'lognormal',
      gm: lPerDayToM3PerS(1),
      gsd: 2,
      lo: lPerDayToM3PerS(0.1),
      hi: lPerDayToM3PerS(4),
    } as const;
    const spec = {
      model: exposureLegacy,
      base,
      distributions: {
        'exposure.receptor0.bw': bw,
        'exposure.receptor0.ed': ed,
        'exposure.receptor0.waterIngestionRate': ir,
      },
      output: (o: { receptors: { totals: { risk: number } }[] }) => o.receptors[0]!.totals.risk,
      n: tableR2.iterations,
      seed: 'table-r2',
    };
    const r = run(uncertaintySrsExposure, spec as unknown as UncertaintySpec<Toy, number>);
    expect(r.ids).toEqual([
      'exposure.receptor0.bw',
      'exposure.receptor0.ed',
      'exposure.receptor0.waterIngestionRate',
    ]);
    expect(r.failures.count).toBe(0);
    expect(r.succeeded).toBe(tableR2.iterations);
    const s = r.summary!;
    const seq = [s.min, s.p5, s.p25, s.p50, s.p75, s.p90, s.p95, s.max];
    for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeGreaterThanOrEqual(seq[i - 1]!);
    expect(s.p95).toBeGreaterThan(s.p5);
  });
});
