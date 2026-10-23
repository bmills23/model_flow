import { describe, expect, it } from 'vitest';
import {
  LEGACY_PRESETS,
  MODERN_RESIDENT_BOUNDARY,
  constantEpc,
  groundwaterBreakthrough,
  legacyReceptor,
  modernChemical,
  modernReceptor,
  modernResident,
  modernWorker,
  runLegacyScenario,
  runModernScenario,
  seriesEpc,
  windowAverage,
  type ModernScenarioReceptor,
  type PathwayId,
} from '../src/processes/exposure/index.js';
import { groundwaterAt123d } from '../src/processes/groundwater/index.js';
import {
  Y,
  bapBoundary,
  benzeneBoundary,
  decliningSeries,
  humpSeries,
  legacyBenzene,
} from './scenarioHelpers.js';

const benzene = modernChemical(benzeneBoundary);
const bap = modernChemical(bapBoundary);
const resident = modernResident();
type Spec = ReturnType<typeof constantEpc>;

const chem = (id: string, c: typeof benzene, epcs: Partial<Record<PathwayId, Spec>>) => ({
  id,
  chemical: c,
  epcs,
});
function rec(
  over: Partial<ModernScenarioReceptor> & Pick<ModernScenarioReceptor, 'pathways' | 'chemicals'>,
): ModernScenarioReceptor {
  return { label: 'A', receptor: resident, ...over };
}
const water = constantEpc('waterIngestion', 0.01);
const codes = (r: ReturnType<typeof runModernScenario>): string[] => r.warnings.map((w) => w.code);

describe('modern scenario: identities', () => {
  it('(a) a constant series gives the constant result, for a mutagen and an ordinary chemical', () => {
    const c = water as Extract<Spec, { kind: 'constant' }>;
    const series = seriesEpc({ times: [0, 60 * Y], values: [c.value, c.value] }, 'x');
    for (const [pathway, ch] of [
      ['waterIngestion', benzene],
      ['waterDermal', bap],
    ] as const) {
      const k = runModernScenario({
        receptors: [rec({ pathways: [pathway], chemicals: [chem('c', ch, { [pathway]: water })] })],
      });
      const s = runModernScenario({
        receptors: [
          rec({ pathways: [pathway], chemicals: [chem('c', ch, { [pathway]: series })] }),
        ],
      });
      expect(s.receptors[0]!.totals.risk / k.receptors[0]!.totals.risk).toBeCloseTo(1, 12);
      expect(s.receptors[0]!.totals.hi / k.receptors[0]!.totals.hi).toBeCloseTo(1, 12);
    }
  });

  it('(b) linear in the EPC, and the coefficients reproduce the result', () => {
    const run = (m: number) =>
      runModernScenario({
        receptors: [
          rec({
            pathways: ['waterIngestion', 'indoorInhalation', 'soilIngestion'],
            chemicals: [
              chem('benzene', benzene, {
                waterIngestion: constantEpc('waterIngestion', 0.01 * m),
                indoorInhalation: constantEpc('indoorInhalation', 0.001 * m),
                soilIngestion: constantEpc('soilIngestion', 1 * m),
              }),
            ],
          }),
        ],
      });
    const one = run(1);
    const two = run(2);
    expect(two.receptors[0]!.totals.risk / one.receptors[0]!.totals.risk).toBeCloseTo(2, 12);
    expect(two.receptors[0]!.totals.hi / one.receptors[0]!.totals.hi).toBeCloseTo(2, 12);
    const epc = { waterIngestion: 1e-5, indoorInhalation: 1e-9, soilIngestion: 1e-6 } as Record<
      string,
      number
    >;
    for (const { cell } of one.receptors[0]!.cells) {
      expect((cell.riskPerEpc! * epc[cell.pathway]!) / cell.risk!).toBeCloseTo(1, 12);
      expect((cell.hqPerEpc! * epc[cell.pathway]!) / cell.hq!).toBeCloseTo(1, 12);
    }
  });

  it('(c) with 20 m3/d and 70 kg the legacy and modern inhalation HQs agree', () => {
    const adult70 = modernReceptor({
      label: 'adult',
      stages: [
        {
          id: 'a',
          group: 'a',
          bwKg: 70,
          edYr: 30,
          efDaysPerYr: 350,
          etHoursPerDay: { indoorInhalation: 24 },
        },
      ],
    });
    const air = 0.001;
    const m = runModernScenario({
      receptors: [
        rec({
          receptor: adult70,
          pathways: ['indoorInhalation'],
          chemicals: [
            chem('b', benzene, { indoorInhalation: constantEpc('indoorInhalation', air) }),
          ],
        }),
      ],
    });
    const l = runLegacyScenario({
      receptors: [
        {
          label: 'A',
          receptor: legacyReceptor({
            ...LEGACY_PRESETS.residentAdultOnly,
            etHoursPerDay: { indoorInhalation: 24 },
          }),
          pathways: ['indoorInhalation'],
          chemicals: [
            {
              id: 'b',
              chemical: legacyBenzene,
              epcs: { indoorInhalation: constantEpc('indoorInhalation', air) },
            },
          ],
        },
      ],
    });
    expect(m.receptors[0]!.totals.hi / l.receptors[0]!.totals.hi).toBeCloseTo(1, 12);
  });

  it('(d) mutagenic over ordinary soil ingestion risk is the ADAF-weighted over the plain factor', () => {
    const plain = modernChemical({ ...bapBoundary, mutagen: false });
    const run = (c: typeof bap) =>
      runModernScenario({
        receptors: [
          rec({
            pathways: ['soilIngestion'],
            chemicals: [chem('c', c, { soilIngestion: constantEpc('soilIngestion', 1) })],
          }),
        ],
      }).receptors[0]!.totals.risk;
    expect(run(bap) / run(plain)).toBeCloseTo(166833.33333333334 / 36750, 10);
  });

  it('(e) the additive option is the cancer sum and leaves each HI unchanged (non-segmented receptors)', () => {
    const worker = modernWorker();
    const adultOnly = modernReceptor({
      label: 'adult',
      stages: [
        { id: 'a', group: 'a', bwKg: 80, edYr: 26, efDaysPerYr: 350, soilIngestionMgPerDay: 100 },
      ],
    });
    const chems = [chem('b', benzene, { soilIngestion: constantEpc('soilIngestion', 5) })];
    const both = runModernScenario({
      receptors: [
        rec({ receptor: worker, pathways: ['soilIngestion'], chemicals: chems }),
        rec({ label: 'B', receptor: adultOnly, pathways: ['soilIngestion'], chemicals: chems }),
      ],
      additive: true,
    });
    const [a, b] = both.receptors;
    expect(both.additiveCancerRisk).toBeCloseTo(a!.totals.risk + b!.totals.risk, 15);
    const alone = runModernScenario({
      receptors: [rec({ receptor: worker, pathways: ['soilIngestion'], chemicals: chems })],
    });
    expect(a!.totals.hi).toBe(alone.receptors[0]!.totals.hi);
  });

  it('the additive option with the age-segmented resident is refused with a clear error', () => {
    const chems = [chem('b', benzene, { soilIngestion: constantEpc('soilIngestion', 5) })];
    expect(() =>
      runModernScenario({
        receptors: [
          rec({ pathways: ['soilIngestion'], chemicals: chems }),
          rec({
            label: 'B',
            receptor: modernWorker(),
            pathways: ['soilIngestion'],
            chemicals: chems,
          }),
        ],
        additive: true,
      }),
    ).toThrow(/age-segmented receptor \(it would count the child twice\)/);
  });

  it('a child-only receptor with two mutagen age segments is not age-segmented, so child plus worker may be added', () => {
    const child = modernReceptor({
      label: 'Child resident',
      stages: MODERN_RESIDENT_BOUNDARY.stages.slice(0, 1),
      mutagenStages: MODERN_RESIDENT_BOUNDARY.mutagenStages!.slice(0, 2),
    });
    const chems = [chem('b', benzene, { soilIngestion: constantEpc('soilIngestion', 5) })];
    const r = runModernScenario({
      receptors: [
        rec({ receptor: child, pathways: ['soilIngestion'], chemicals: chems }),
        rec({
          label: 'B',
          receptor: modernWorker(),
          pathways: ['soilIngestion'],
          chemicals: chems,
        }),
      ],
      additive: true,
    });
    expect(r.additiveCancerRisk).toBeGreaterThan(0);
  });

  it('the headline HI is the larger of child and adult, both shown, never added', () => {
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['waterIngestion'],
          chemicals: [chem('b', benzene, { waterIngestion: water })],
        }),
      ],
    });
    const s = r.summary.receptors[0]!;
    expect(Object.keys(s.hiByGroup).sort()).toEqual(['adult', 'child']);
    expect(s.hi).toBe(Math.max(s.hiByGroup.child!, s.hiByGroup.adult!));
    expect(s.headlineGroup).toBe('child');
    expect(s.hi).toBeLessThan(s.hiByGroup.child! + s.hiByGroup.adult!);
  });
});

describe('modern scenario: the maximizing exposure start', () => {
  const spec = seriesEpc(humpSeries, 'groundwater.at123d');
  const base = (start?: number) =>
    runModernScenario({
      receptors: [
        rec({
          pathways: ['waterIngestion'],
          chemicals: [chem('b', benzene, { waterIngestion: spec })],
        }),
      ],
      ...(start === undefined ? {} : { exposureStart: start }),
    });

  it('(f) the chosen start gives a risk no smaller than any start on a fine grid', () => {
    const best = base();
    expect(best.startTimes[0]).not.toBeNull();
    for (let s = 0; s <= 34 * Y; s += Y / 20) {
      expect(best.receptors[0]!.totals.risk).toBeGreaterThanOrEqual(
        base(s).receptors[0]!.totals.risk * (1 - 1e-12),
      );
    }
    // and it is a genuine optimum, not the first grid point
    expect(best.startTimes[0]!).toBeGreaterThan(0);
    expect(best.startTimes[0]!).toBeLessThan(34 * Y);
  });

  it('(f) holds for a mutagen with four stages and for two series in one receptor', () => {
    const second = seriesEpc(
      { times: [0, 30 * Y, 60 * Y], values: [0, 5e-6, 5e-5] },
      'groundwater.at123d',
    );
    const run = (start?: number) =>
      runModernScenario({
        receptors: [
          rec({
            pathways: ['waterIngestion'],
            chemicals: [
              chem('bap', bap, { waterIngestion: spec }),
              chem('benzene', benzene, { waterIngestion: second }),
            ],
          }),
        ],
        ...(start === undefined ? {} : { exposureStart: start }),
      });
    const best = run().receptors[0]!.totals.risk;
    for (let s = 0; s <= 34 * Y; s += Y / 10) {
      expect(best).toBeGreaterThanOrEqual(run(s).receptors[0]!.totals.risk * (1 - 1e-12));
    }
  });

  it('a declining plume reaches the child first: the start is the series start', () => {
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['waterIngestion'],
          chemicals: [chem('b', benzene, { waterIngestion: seriesEpc(decliningSeries, 'x') })],
        }),
      ],
    });
    expect(r.startTimes[0]).toBe(0);
    const [child, adult] = r.epcs[0]![0]!.cancer as number[];
    expect(child!).toBeGreaterThan(adult!);
    expect(child!).toBeCloseTo(windowAverage(decliningSeries, 0, 6 * Y).average, 12);
    expect(adult!).toBeCloseTo(windowAverage(decliningSeries, 6 * Y, 26 * Y).average, 12);
  });

  it('each noncancer group uses the largest average over its own duration', () => {
    const r = base();
    const e = r.epcs[0]![0]!.noncancer as Record<string, number>;
    let best6 = 0;
    let best20 = 0;
    for (let s = 0; s <= 54 * Y; s += Y / 40) {
      best6 = Math.max(best6, windowAverage(humpSeries, s, s + 6 * Y).average);
      if (s <= 40 * Y) best20 = Math.max(best20, windowAverage(humpSeries, s, s + 20 * Y).average);
    }
    expect(e.child!).toBeGreaterThanOrEqual(best6 * (1 - 1e-12));
    expect(e.child!).toBeLessThan(best6 * 1.001);
    expect(e.adult!).toBeGreaterThanOrEqual(best20 * (1 - 1e-12));
    expect(e.adult!).toBeLessThan(best20 * 1.001);
  });

  it('a constant EPC has no start time', () => {
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['waterIngestion'],
          chemicals: [chem('b', benzene, { waterIngestion: water })],
        }),
      ],
    });
    expect(r.startTimes).toEqual([null]);
  });

  it('warns when the series is shorter than the exposure (series-shorter-than-window)', () => {
    const short = seriesEpc({ times: [0, 10 * Y], values: [2e-5, 1e-5] }, 'x');
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['waterIngestion'],
          chemicals: [chem('b', benzene, { waterIngestion: short })],
        }),
      ],
    });
    expect(codes(r)).toContain('exposure.series-shorter-than-window');
    expect(r.epcs[0]![0]!.shorter).toBe(true);
  });

  it('rejects a bad start option', () => {
    for (const bad of [-1, Infinity, NaN]) {
      expect(() =>
        runModernScenario({
          receptors: [
            rec({
              pathways: ['waterIngestion'],
              chemicals: [chem('b', benzene, { waterIngestion: water })],
            }),
          ],
          exposureStart: bad,
        }),
      ).toThrow(RangeError);
    }
  });
});

describe('modern scenario: warning codes', () => {
  it('exposure.not-quantified', () => {
    const noAbsd = modernChemical({ ...benzeneBoundary, absd: undefined });
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['soilDermal'],
          chemicals: [chem('x', noAbsd, { soilDermal: constantEpc('soilDermal', 1) })],
        }),
      ],
    });
    expect(codes(r)).toContain('exposure.not-quantified');
  });

  it('exposure.dermal-outside-epd', () => {
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['waterDermal'],
          chemicals: [chem('bap', bap, { waterDermal: constantEpc('waterDermal', 0.001) })],
        }),
      ],
    });
    expect(codes(r)).toContain('exposure.dermal-outside-epd');
  });

  it('exposure.giabs-adjusted', () => {
    const low = modernChemical({ ...benzeneBoundary, giabs: 0.3 });
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['soilDermal'],
          chemicals: [chem('x', low, { soilDermal: constantEpc('soilDermal', 1) })],
        }),
      ],
    });
    expect(codes(r)).toContain('exposure.giabs-adjusted');
  });

  it('exposure.special-case-not-modelled (a receptor with no early-life segments)', () => {
    const vc = modernChemical({ ...benzeneBoundary, id: '75-01-4', special: 'vinyl-chloride' });
    const r = runModernScenario({
      receptors: [
        rec({
          receptor: modernWorker(),
          pathways: ['waterIngestion'],
          chemicals: [chem('vc', vc, { waterIngestion: water })],
        }),
      ],
    });
    expect(codes(r)).toContain('exposure.special-case-not-modelled');
  });

  it('exposure.special-case-override (an entered cancer value on a special case)', () => {
    const vc = modernChemical({
      ...benzeneBoundary,
      id: '75-01-4',
      special: 'vinyl-chloride',
      cancerOverridden: true,
    });
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['waterIngestion'],
          chemicals: [chem('vc', vc, { waterIngestion: water })],
        }),
      ],
    });
    expect(codes(r)).toContain('exposure.special-case-override');
    expect(codes(r)).not.toContain('exposure.special-case-not-modelled');
  });

  it('exposure.site-specific-required (swimming needs a frequency and event time)', () => {
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['swimIngestion'],
          chemicals: [chem('b', benzene, { swimIngestion: constantEpc('swimIngestion', 0.01) })],
        }),
      ],
    });
    expect(codes(r)).toContain('exposure.site-specific-required');
    expect(r.receptors[0]!.totals.risk).toBe(0);
    expect(r.summary.receptors[0]!.notQuantified[0]!.what).toEqual(['inputs']);
  });

  it('exposure.csat-exceeded and exposure.soil-ceiling', () => {
    const withCsat = modernChemical({ ...benzeneBoundary, csat: 100 });
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['soilIngestion'],
          chemicals: [chem('b', withCsat, { soilIngestion: constantEpc('soilIngestion', 2e5) })],
        }),
      ],
    });
    expect(codes(r)).toContain('exposure.csat-exceeded');
    expect(codes(r)).toContain('exposure.soil-ceiling');
  });

  it('risk.linear-above-0.01 and risk.hi-above-1-unsegregated', () => {
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['waterIngestion'],
          chemicals: [chem('b', benzene, { waterIngestion: constantEpc('waterIngestion', 500) })],
        }),
      ],
    });
    expect(codes(r)).toContain('risk.linear-above-0.01');
    expect(codes(r)).toContain('risk.hi-above-1-unsegregated');
  });

  it('is quiet for an ordinary constant case', () => {
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['waterIngestion'],
          chemicals: [chem('b', benzene, { waterIngestion: water })],
        }),
      ],
    });
    expect(r.warnings).toEqual([]);
  });
});

describe('modern scenario: validity', () => {
  const ok = rec({
    pathways: ['waterIngestion'],
    chemicals: [chem('b', benzene, { waterIngestion: water })],
  });
  it('one or two receptors; a pathway on needs an EPC; soil is constant; no duplicate chemicals', () => {
    expect(() => runModernScenario({ receptors: [] })).toThrow(/one or two/);
    expect(() => runModernScenario({ receptors: [ok, ok, ok] })).toThrow(/one or two/);
    expect(() => runModernScenario({ receptors: [ok], additive: true })).toThrow(/two receptors/);
    expect(() =>
      runModernScenario({ receptors: [{ ...ok, pathways: ['soilIngestion'] }] }),
    ).toThrow(/no chemical has an EPC/);
    expect(() =>
      runModernScenario({
        receptors: [
          rec({
            pathways: ['soilIngestion'],
            chemicals: [chem('b', benzene, { soilIngestion: seriesEpc(humpSeries, 'x') })],
          }),
        ],
      }),
    ).toThrow(/soil/);
    expect(() =>
      runModernScenario({
        receptors: [{ ...ok, chemicals: [ok.chemicals[0]!, ok.chemicals[0]!] }],
      }),
    ).toThrow(/twice/);
  });

  it('constantEpc converts the boundary unit and rejects negatives', () => {
    const v = (p: PathwayId, x: number): number => {
      const e = constantEpc(p, x);
      return e.kind === 'constant' ? e.value : NaN;
    };
    expect(v('soilIngestion', 5) / 5e-6).toBeCloseTo(1, 12);
    expect(v('waterIngestion', 1) / 1e-3).toBeCloseTo(1, 12);
    expect(v('indoorInhalation', 2) / 2e-6).toBeCloseTo(1, 12);
    expect(constantEpc('soilIngestion', 5).origin).toBe('entered');
    expect(() => constantEpc('waterIngestion', -1)).toThrow(RangeError);
  });
});

describe('M1 breakthrough adapter', () => {
  const input = {
    aquifer: {
      velocity: 1e-6,
      porosity: 0.3,
      retardation: 1,
      decayRate: 0,
      dx: 1e-5,
      dy: 1e-6,
      dz: 1e-7,
    },
    source: { x1: 0, x2: 10, y1: -5, y2: 5, z1: -3, z2: -1 },
    loading: [{ start: 0, end: Infinity, rate: 1e-9 }],
  };
  const points = [-3, -2, -1].map((z) => ({ x: 60, y: 0, z }));
  const times = Array.from({ length: 21 }, (_, i) => i * 2 * Y);
  const run = (time: number) => groundwaterAt123d.run({ ...input, time, points });

  it('builds a screen-average series from a groundwater run', () => {
    const spec = groundwaterBreakthrough(run, times, 'groundwater.at123d');
    expect(spec.kind).toBe('series');
    if (spec.kind !== 'series') return;
    expect(spec.origin).toBe('groundwater.at123d');
    expect(spec.series.times).toEqual(times);
    expect(spec.series.values[0]).toBe(0);
    expect(Math.max(...spec.series.values)).toBeGreaterThan(0);
    expect(spec.series.values.every((v) => v >= 0 && Number.isFinite(v))).toBe(true);
    const mid = run(20 * Y).concentrations;
    expect(spec.series.values[10]).toBeCloseTo(mid.reduce((a, c) => a + c, 0) / mid.length, 20);
  });

  it('feeds drinking water and bathing, and the result records the origin', () => {
    const spec = groundwaterBreakthrough(run, times, 'groundwater.at123d');
    const r = runModernScenario({
      receptors: [
        rec({
          pathways: ['waterIngestion', 'waterDermal'],
          chemicals: [chem('b', benzene, { waterIngestion: spec, waterDermal: spec })],
        }),
      ],
    });
    expect(r.receptors[0]!.totals.risk).toBeGreaterThan(0);
    expect(r.epcs[0]!.map((e) => e.origin)).toEqual(['groundwater.at123d', 'groundwater.at123d']);
    expect(r.startTimes[0]).not.toBeNull();
  });

  it('rejects a short time list and an empty run', () => {
    expect(() => groundwaterBreakthrough(run, [0], 'x')).toThrow(RangeError);
    expect(() => groundwaterBreakthrough(() => ({ concentrations: [] }), [0, 1], 'x')).toThrow(
      RangeError,
    );
  });
});
