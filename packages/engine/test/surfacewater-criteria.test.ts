import { describe, expect, it } from 'vitest';
import {
  compareToCriteria,
  hardnessCriterion,
  type HardnessEquation,
  withUserValue,
  type Criterion,
} from '../src/index.js';
import aquaticJson from '../../data/generated/nrwqc-2026-10-16/aquatic.json' with { type: 'json' };
import hardnessJson from '../../data/generated/nrwqc-2026-10-16/hardness.json' with { type: 'json' };

type PrintedCriterion = { status: string; value?: number };
const aquatic = aquaticJson as unknown as {
  rows: {
    id: string;
    hardnessDependent: boolean;
    freshwater: { cmc: PrintedCriterion; ccc: PrintedCriterion };
  }[];
};
const hardness = hardnessJson as unknown as {
  metals: {
    id: string;
    name: string;
    freshwater: { acute?: HardnessEquation; chronic?: HardnessEquation };
  }[];
};

const water = (over: Partial<Criterion> & Pick<Criterion, 'id'>): Criterion => ({
  chemicalId: '7440-66-6',
  medium: 'surfaceWater',
  endpoint: 'aquatic-freshwater-chronic',
  value: 10,
  unit: 'ug/L',
  source: 'database',
  ...over,
});
const codes = (r: { warnings: { code: string }[] }): string[] => r.warnings.map((w) => w.code);

describe('ratios and the exceedance flag (fixture 6b)', () => {
  it('a ratio of exactly 1 is not flagged, above 1 is', () => {
    const crit = [water({ id: 'a' })];
    const at = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '7440-66-6',
      series: [1e-5],
      criteria: crit,
    });
    expect(at.results[0]!.ratio).toBeCloseTo(1, 12);
    expect(at.results[0]!.exceeds).toBe(false);
    const over = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '7440-66-6',
      series: [1.01e-5],
      criteria: crit,
    });
    expect(over.results[0]!.exceeds).toBe(true);
    expect(over.results[0]!.ratio).toBeCloseTo(1.01, 12);
  });

  it('compares the peak of the series, never a mean or the last value', () => {
    const r = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '7440-66-6',
      series: [0, 4e-5, 1e-6],
      criteria: [water({ id: 'a' })],
    });
    expect(r.concentration).toBe(4e-5);
    expect(r.results[0]!.ratio).toBeCloseTo(4, 12);
  });

  it('never sums ratios, one result per criterion, and converts ug/L, mg/L', () => {
    const r = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '7440-66-6',
      series: [2e-5],
      criteria: [water({ id: 'a' }), water({ id: 'b', value: 0.04, unit: 'mg/L' })],
    });
    expect(r.results.map((x) => x.ratio)).toEqual([2, 0.5].map((x) => expect.closeTo(x, 12)));
  });

  it('filters aquatic criteria by water type, leaves human health alone', () => {
    const crit = [
      water({ id: 'f', waterType: 'fresh' }),
      water({ id: 's', waterType: 'salt', value: 5 }),
      water({ id: 'hh', endpoint: 'human-health-organism', waterType: undefined, value: 100 }),
    ];
    const r = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '7440-66-6',
      series: [1e-5],
      criteria: crit,
      waterType: 'salt',
    });
    expect(r.results.map((x) => x.criterion?.id)).toEqual(['s', 'hh']);
  });
});

describe('hardness-dependent criteria from a parameter record', () => {
  // zinc, Appendix B form: exp(m ln(h) + b) times a conversion factor; zinc computes to 117.2 / 118.1 ug/L
  const zinc = {
    acute: { slope: 0.8473, intercept: 0.884, conversionFactor: { constant: 0.978 } },
    chronic: { slope: 0.8473, intercept: 0.884, conversionFactor: { constant: 0.986 } },
  };

  // published-reproduction: nrwqc-zinc-hardness
  it('reproduces the published zinc values at 100 mg/L to two significant figures', () => {
    expect(hardnessCriterion(zinc.acute, 100)).toBeCloseTo(117.2, 0);
    expect(hardnessCriterion(zinc.chronic, 100)).toBeCloseTo(118.1, 0);
    expect(Number(hardnessCriterion(zinc.acute, 100).toPrecision(2))).toBe(120);
  });

  // published-reproduction: nrwqc-hardness-metals
  it('reproduces the printed criteria of all six hardness-dependent metals at 100 mg/L', () => {
    const rows = new Map(aquatic.rows.map((r) => [r.id, r]));
    let compared = 0;
    for (const metal of hardness.metals) {
      const row = rows.get(metal.id)!;
      expect(row.hardnessDependent, metal.name).toBe(true);
      for (const [duration, printed] of [
        ['acute', row.freshwater.cmc],
        ['chronic', row.freshwater.ccc],
      ] as const) {
        const eq = metal.freshwater[duration];
        if (printed.status !== 'value' || printed.value === undefined) {
          // cadmium chronic is vacated and silver has no chronic criterion: nothing printed to compare
          expect(eq === undefined || printed.status !== 'value', `${metal.name} ${duration}`).toBe(
            true,
          );
          continue;
        }
        expect(eq, `${metal.name} ${duration}`).toBeDefined();
        const sl = hardnessCriterion(eq!, 100);
        // half a unit of the second significant figure of the printed value, as the RSL sweep
        const unit = 10 ** (Math.floor(Math.log10(printed.value)) - 1);
        expect(
          Math.abs(sl - printed.value),
          `${metal.name} ${duration}: ${sl} vs ${printed.value}`,
        ).toBeLessThanOrEqual(0.5 * unit * (1 + 1e-9));
        compared += 1;
      }
    }
    expect(compared).toBe(10);
  });

  it('a conversion factor may depend on hardness (intercept + slope ln h)', () => {
    const p = { slope: 1, intercept: 0, conversionFactor: { intercept: 1.1, slope: -0.04 } };
    expect(hardnessCriterion(p, Math.E)).toBeCloseTo(Math.E * (1.1 - 0.04), 12);
  });

  it('rejects a non-positive hardness', () => {
    expect(() => hardnessCriterion(zinc.acute, 0)).toThrow(RangeError);
  });

  it('compareToCriteria computes the value at the user hardness and warns outside 25 to 400', () => {
    const crit = [water({ id: 'z', value: undefined, hardness: zinc.chronic, dissolved: true })];
    const at100 = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '7440-66-6',
      series: [1.181e-4],
      criteria: crit,
    });
    expect(at100.results[0]!.criterionValue).toBeCloseTo(118.1e-6, 7);
    expect(at100.results[0]!.ratio).toBeCloseTo(1, 3);
    expect(codes(at100)).toContain('criteria.dissolved-assumed');
    expect(codes(at100)).not.toContain('criteria.hardness-range');
    const soft = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '7440-66-6',
      series: [1e-5],
      criteria: crit,
      hardness: 10,
    });
    expect(codes(soft)).toContain('criteria.hardness-range');
    expect(soft.results[0]!.criterionValue!).toBeLessThan(at100.results[0]!.criterionValue!);
    const hard = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '7440-66-6',
      series: [1e-5],
      criteria: crit,
      hardness: 500,
    });
    expect(codes(hard)).toContain('criteria.hardness-range');
  });
});

describe('pH-dependent criteria', () => {
  it('compares at the printed value and warns that the criterion depends on pH', () => {
    const r = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '87-86-5',
      series: [1e-5],
      criteria: [
        water({
          id: 'pcp',
          value: 19,
          chemicalId: '87-86-5',
          printedAtPh: 7.8,
          waterType: 'fresh',
        }),
      ],
    });
    expect(r.results[0]!.status).toBe('compared');
    const w = r.warnings.find((x) => x.code === 'criteria.ph-dependent');
    expect(w).toBeDefined();
    expect(w!.message).toContain('7.8');
  });
  it('does not warn for a criterion with no pH dependence', () => {
    const r = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '7440-66-6',
      series: [1e-5],
      criteria: [water({ id: 'zn', value: 19, chemicalId: '7440-66-6' })],
    });
    expect(r.warnings.map((x) => x.code)).not.toContain('criteria.ph-dependent');
  });
});

describe('site-specific and missing criteria', () => {
  it('a site-chemistry criterion is not computed, never a pass', () => {
    const crit = [
      water({ id: 'cu', value: undefined, siteSpecific: true, chemicalId: '7440-50-8' }),
    ];
    const r = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '7440-50-8',
      series: [1e-5],
      criteria: crit,
    });
    expect(r.results[0]!.status).toBe('site-specific');
    expect(r.results[0]!.ratio).toBeUndefined();
    expect(r.results[0]!.exceeds).toBeUndefined();
    expect(codes(r)).toContain('criteria.site-specific');
  });

  it('a user value turns it into a comparison tagged user', () => {
    const base = water({ id: 'cu', value: undefined, siteSpecific: true, chemicalId: '7440-50-8' });
    const u = withUserValue(base, 5, 'ug/L');
    expect(u.source).toBe('user');
    const r = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '7440-50-8',
      series: [1e-5],
      criteria: [u],
    });
    expect(r.results[0]!.status).toBe('compared');
    expect(r.results[0]!.source).toBe('user');
    expect(r.results[0]!.ratio).toBeCloseTo(2, 12);
    expect(codes(r)).not.toContain('criteria.site-specific');
  });

  it('no criterion for the chemical and medium: not available, never a pass', () => {
    const r = compareToCriteria({
      medium: 'surfaceWater',
      chemicalId: '71-43-2',
      series: [1e-5],
      criteria: [water({ id: 'a' })],
    });
    expect(r.results).toHaveLength(1);
    expect(r.results[0]!.status).toBe('not-available');
    expect(r.results[0]!.exceeds).toBeUndefined();
    expect(codes(r)).toContain('criteria.not-available');
    const wrongMedium = compareToCriteria({
      medium: 'sediment',
      chemicalId: '7440-66-6',
      series: [1e-5],
      criteria: [water({ id: 'a' })],
      fractionOrganicCarbon: 0.01,
    });
    expect(wrongMedium.results[0]!.status).toBe('not-available');
  });

  it('rejects an empty or negative series', () => {
    expect(() =>
      compareToCriteria({ medium: 'surfaceWater', chemicalId: 'x', series: [], criteria: [] }),
    ).toThrow(RangeError);
    expect(() =>
      compareToCriteria({ medium: 'surfaceWater', chemicalId: 'x', series: [-1], criteria: [] }),
    ).toThrow(RangeError);
  });
});

describe('sediment benchmarks and organic carbon normalization (fixture 6c)', () => {
  const sed = (over: Partial<Criterion> = {}): Criterion => ({
    id: 'tec',
    chemicalId: '50-32-8',
    medium: 'sediment',
    endpoint: 'region4-freshwater-screening',
    value: 100,
    unit: 'ug/kg',
    source: 'database',
    ...over,
  });

  it('a dry-weight benchmark compares dry weight directly', () => {
    const r = compareToCriteria({
      medium: 'sediment',
      chemicalId: '50-32-8',
      series: [2e-7],
      criteria: [sed()],
    });
    expect(r.results[0]!.ratio).toBeCloseTo(2, 12);
    expect(codes(r)).not.toContain('criteria.oc-normalized');
  });

  it('a benchmark at 1 percent organic carbon with f_oc = 0.01 compares unchanged', () => {
    const r = compareToCriteria({
      medium: 'sediment',
      chemicalId: '50-32-8',
      series: [2e-7],
      criteria: [sed({ ocBasis: 0.01 })],
      fractionOrganicCarbon: 0.01,
    });
    expect(r.results[0]!.ratio).toBeCloseTo(2, 12);
    expect(codes(r)).toContain('criteria.oc-normalized');
  });

  it('scales C_sed by 0.01 / f_oc otherwise, and needs f_oc', () => {
    const r = compareToCriteria({
      medium: 'sediment',
      chemicalId: '50-32-8',
      series: [2e-7],
      criteria: [sed({ ocBasis: 0.01 })],
      fractionOrganicCarbon: 0.02,
    });
    expect(r.results[0]!.ratio).toBeCloseTo(1, 12);
    expect(() =>
      compareToCriteria({
        medium: 'sediment',
        chemicalId: '50-32-8',
        series: [2e-7],
        criteria: [sed({ ocBasis: 0.01 })],
      }),
    ).toThrow(RangeError);
  });
});
