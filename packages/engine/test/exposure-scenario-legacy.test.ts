import { describe, expect, it } from 'vitest';
import {
  LEGACY_PRESETS,
  constantEpc,
  legacyReceptor,
  runLegacyScenario,
  seriesEpc,
  windowAverage,
  type LegacyScenarioReceptor,
  type PathwayId,
} from '../src/processes/exposure/index.js';
import { Y, decliningSeries, humpSeries, legacyBenzene } from './scenarioHelpers.js';

const adult = legacyReceptor({
  ...LEGACY_PRESETS.residentAdultOnly,
  etHoursPerDay: { indoorInhalation: 24, waterDermal: 0.2 },
});

function receptor(
  over: Partial<LegacyScenarioReceptor> & Pick<LegacyScenarioReceptor, 'pathways' | 'chemicals'>,
): LegacyScenarioReceptor {
  return { label: 'A', receptor: adult, ...over };
}
const benz = (epcs: Partial<Record<PathwayId, ReturnType<typeof constantEpc>>>) => ({
  id: 'benzene',
  chemical: legacyBenzene,
  epcs,
});
const water = constantEpc('waterIngestion', 0.01);

describe('legacy scenario: constants and identities', () => {
  it('(a) a constant series gives the same result as the constant EPC', () => {
    const c = water as Extract<typeof water, { kind: 'constant' }>;
    const series = seriesEpc({ times: [0, 60 * Y], values: [c.value, c.value] }, 'test');
    const k = runLegacyScenario({
      receptors: [
        receptor({ pathways: ['waterIngestion'], chemicals: [benz({ waterIngestion: water })] }),
      ],
    });
    const s = runLegacyScenario({
      receptors: [
        receptor({ pathways: ['waterIngestion'], chemicals: [benz({ waterIngestion: series })] }),
      ],
    });
    expect(s.receptors[0]!.totals.risk / k.receptors[0]!.totals.risk).toBeCloseTo(1, 12);
    expect(s.receptors[0]!.totals.hi / k.receptors[0]!.totals.hi).toBeCloseTo(1, 12);
  });

  it('(b) linear in the EPC: doubling doubles risk and HI, coefficients reproduce them', () => {
    const run = (m: number) =>
      runLegacyScenario({
        receptors: [
          receptor({
            pathways: ['waterIngestion', 'indoorInhalation'],
            chemicals: [
              benz({
                waterIngestion: constantEpc('waterIngestion', 0.01 * m),
                indoorInhalation: constantEpc('indoorInhalation', 0.001 * m),
              }),
            ],
          }),
        ],
      });
    const one = run(1);
    const two = run(2);
    expect(two.receptors[0]!.totals.risk / one.receptors[0]!.totals.risk).toBeCloseTo(2, 12);
    expect(two.receptors[0]!.totals.hi / one.receptors[0]!.totals.hi).toBeCloseTo(2, 12);
    for (const { cell } of one.receptors[0]!.cells) {
      const epc = cell.pathway === 'waterIngestion' ? 0.01 * 1e-3 : 0.001 * 1e-6;
      expect((cell.riskPerEpc! * epc) / cell.risk!).toBeCloseTo(1, 12);
      expect((cell.hqPerEpc! * epc) / cell.hq!).toBeCloseTo(1, 12);
    }
  });

  it('(e) the additive option is the sum of the cancer risks and leaves each HI unchanged', () => {
    const child = legacyReceptor({ ...LEGACY_PRESETS.residentChild, waterIngestionLPerDay: 1 });
    const chems = [benz({ waterIngestion: water })];
    const both = runLegacyScenario({
      receptors: [
        receptor({ pathways: ['waterIngestion'], chemicals: chems }),
        receptor({ label: 'B', receptor: child, pathways: ['waterIngestion'], chemicals: chems }),
      ],
      additive: true,
    });
    const [a, b] = both.receptors;
    expect(both.additiveCancerRisk).toBeCloseTo(a!.totals.risk + b!.totals.risk, 15);
    expect(both.summary.additiveCancerRisk).toBeCloseTo(both.additiveCancerRisk!, 15);
    const alone = runLegacyScenario({
      receptors: [receptor({ pathways: ['waterIngestion'], chemicals: chems })],
    });
    expect(a!.totals.hi).toBe(alone.receptors[0]!.totals.hi);
    expect(alone.additiveCancerRisk).toBeNull();
  });

  it('records each EPC with its origin', () => {
    const r = runLegacyScenario({
      receptors: [
        receptor({ pathways: ['waterIngestion'], chemicals: [benz({ waterIngestion: water })] }),
      ],
    });
    expect(r.epcs[0]![0]).toMatchObject({
      chemical: 'benzene',
      pathway: 'waterIngestion',
      origin: 'entered',
      kind: 'constant',
    });
  });
});

describe('legacy scenario: series windows', () => {
  const spec = seriesEpc(humpSeries, 'groundwater.at123d');
  const run = (r: LegacyScenarioReceptor) =>
    runLegacyScenario({ receptors: [{ ...r }] }).epcs[0]![0]!;

  it('reduces a series to the largest 7-year and exposure-duration averages', () => {
    const rec = run(
      receptor({ pathways: ['waterIngestion'], chemicals: [benz({ waterIngestion: spec })] }),
    );
    expect(rec.kind).toBe('series');
    expect(rec.origin).toBe('groundwater.at123d');
    let best7 = 0;
    let best30 = 0;
    for (let s = 0; s <= 30 * Y; s += Y / 40) {
      best7 = Math.max(best7, windowAverage(humpSeries, s, s + 7 * Y).average);
      best30 = Math.max(best30, windowAverage(humpSeries, s, s + 30 * Y).average);
    }
    expect(rec.noncancer as number).toBeGreaterThanOrEqual(best7 * (1 - 1e-12));
    expect(rec.cancer as number).toBeGreaterThanOrEqual(best30 * (1 - 1e-12));
    expect(rec.noncancer as number).toBeLessThan(best7 * 1.001);
    expect(rec.cancer as number).toBeLessThan(best30 * 1.001);
    expect(rec.noncancer as number).toBeGreaterThan(rec.cancer as number);
    expect(rec.shorter).toBe(false);
  });

  it('uses the exposure duration when it is shorter than 7 years (child)', () => {
    const child = legacyReceptor({ ...LEGACY_PRESETS.residentChild, waterIngestionLPerDay: 1 });
    const rec = run(
      receptor({
        receptor: child,
        pathways: ['waterIngestion'],
        chemicals: [benz({ waterIngestion: spec })],
      }),
    );
    expect(rec.noncancer).toBeCloseTo(rec.cancer as number, 12);
  });

  it('feeds the cancer risk from the exposure-duration average and the HQ from the 7-year one', () => {
    const r = runLegacyScenario({
      receptors: [
        receptor({ pathways: ['waterIngestion'], chemicals: [benz({ waterIngestion: spec })] }),
      ],
    });
    const rec = r.epcs[0]![0]!;
    const cell = r.receptors[0]!.cells[0]!.cell;
    expect(cell.risk! / (cell.riskPerEpc! * (rec.cancer as number))).toBeCloseTo(1, 12);
    expect(cell.hq! / (cell.hqPerEpc! * (rec.noncancer as number))).toBeCloseTo(1, 12);
  });

  it('refuses a soil series, a duplicate chemical and a bad series', () => {
    expect(() =>
      runLegacyScenario({
        receptors: [
          receptor({
            pathways: ['soilIngestion'],
            chemicals: [benz({ soilIngestion: spec })],
          }),
        ],
      }),
    ).toThrow(/soil/);
    expect(() =>
      runLegacyScenario({
        receptors: [
          receptor({
            pathways: ['waterIngestion'],
            chemicals: [benz({ waterIngestion: water }), benz({ waterIngestion: water })],
          }),
        ],
      }),
    ).toThrow(/twice/);
    expect(() =>
      runLegacyScenario({
        receptors: [
          receptor({
            pathways: ['waterIngestion'],
            chemicals: [
              benz({
                waterIngestion: {
                  kind: 'series',
                  origin: 'x',
                  series: { times: [5, 1], values: [1, 1] },
                },
              }),
            ],
          }),
        ],
      }),
    ).toThrow(RangeError);
  });

  it('a pathway on with no EPC, more than two receptors, a lone additive receptor', () => {
    const chems = [benz({ waterIngestion: water })];
    expect(() =>
      runLegacyScenario({
        receptors: [receptor({ pathways: ['soilIngestion'], chemicals: chems })],
      }),
    ).toThrow(/no chemical has an EPC/);
    const one = receptor({ pathways: ['waterIngestion'], chemicals: chems });
    expect(() => runLegacyScenario({ receptors: [one, one, one] })).toThrow(/one or two/);
    expect(() => runLegacyScenario({ receptors: [one], additive: true })).toThrow(/two receptors/);
    expect(() => runLegacyScenario({ receptors: [] })).toThrow(RangeError);
  });
});

describe('legacy scenario: warning codes', () => {
  const codes = (r: ReturnType<typeof runLegacyScenario>): string[] =>
    r.warnings.map((w) => w.code);

  it('exposure.series-shorter-than-window', () => {
    const short = seriesEpc({ times: [0, 20 * Y], values: [1e-5, 2e-5] }, 'x');
    const r = runLegacyScenario({
      receptors: [
        receptor({ pathways: ['waterIngestion'], chemicals: [benz({ waterIngestion: short })] }),
      ],
    });
    expect(codes(r)).toContain('exposure.series-shorter-than-window');
    expect(r.epcs[0]![0]!.shorter).toBe(true);
    expect(r.receptors[0]!.warnings.map((w) => w.code)).toContain(
      'exposure.series-shorter-than-window',
    );
    // the span is averaged: the mean of a linear 1e-5 to 2e-5 rise
    expect(r.epcs[0]![0]!.cancer).toBeCloseTo(1.5e-5, 12);
  });

  it('exposure.not-quantified', () => {
    const r = runLegacyScenario({
      receptors: [
        receptor({
          pathways: ['waterIngestion'],
          chemicals: [{ id: 'x', chemical: {}, epcs: { waterIngestion: water } }],
        }),
      ],
    });
    expect(codes(r)).toContain('exposure.not-quantified');
    expect(r.summary.receptors[0]!.notQuantified[0]).toMatchObject({
      chemical: 'x',
      what: ['cancer', 'noncancer'],
    });
    expect(r.receptors[0]!.cells[0]!.cell.risk).toBeNull();
  });

  it('exposure.route-extrapolated', () => {
    const oralOnly = { sfo: legacyBenzene.sfo, rfdo: legacyBenzene.rfdo };
    const r = runLegacyScenario({
      receptors: [
        receptor({
          pathways: ['indoorInhalation'],
          routeExtrapolation: true,
          chemicals: [
            {
              id: 'x',
              chemical: oralOnly,
              epcs: { indoorInhalation: constantEpc('indoorInhalation', 1e-3) },
            },
          ],
        }),
      ],
    });
    expect(codes(r)).toContain('exposure.route-extrapolated');
  });

  it('exposure.site-specific-required', () => {
    const noTimes = legacyReceptor(LEGACY_PRESETS.residentAdult);
    const r = runLegacyScenario({
      receptors: [
        receptor({
          receptor: noTimes,
          pathways: ['waterDermal', 'swimIngestion'],
          chemicals: [
            benz({
              waterDermal: constantEpc('waterDermal', 0.01),
              swimIngestion: constantEpc('swimIngestion', 0.01),
            }),
          ],
        }),
      ],
    });
    expect(codes(r).filter((c) => c === 'exposure.site-specific-required').length).toBe(2);
  });

  it('exposure.csat-exceeded and exposure.soil-ceiling', () => {
    const r = runLegacyScenario({
      receptors: [
        receptor({
          pathways: ['soilIngestion'],
          chemicals: [
            {
              id: 'x',
              chemical: { ...legacyBenzene, csat: 1e-4 },
              epcs: { soilIngestion: constantEpc('soilIngestion', 2e5) },
            },
          ],
        }),
      ],
    });
    expect(codes(r)).toContain('exposure.csat-exceeded');
    expect(codes(r)).toContain('exposure.soil-ceiling');
  });

  it('risk.linear-above-0.01 and risk.hi-above-1-unsegregated', () => {
    const r = runLegacyScenario({
      receptors: [
        receptor({
          pathways: ['waterIngestion'],
          chemicals: [benz({ waterIngestion: constantEpc('waterIngestion', 500) })],
        }),
      ],
    });
    expect(codes(r)).toContain('risk.linear-above-0.01');
    expect(codes(r)).toContain('risk.hi-above-1-unsegregated');
  });

  it('is quiet for an ordinary constant case', () => {
    const r = runLegacyScenario({
      receptors: [
        receptor({ pathways: ['waterIngestion'], chemicals: [benz({ waterIngestion: water })] }),
      ],
    });
    expect(r.warnings).toEqual([]);
  });
});

describe('declining series', () => {
  it('the cancer window of a declining series starts at the series start', () => {
    const r = runLegacyScenario({
      receptors: [
        receptor({
          pathways: ['waterIngestion'],
          chemicals: [benz({ waterIngestion: seriesEpc(decliningSeries, 'x') })],
        }),
      ],
    });
    expect(r.epcs[0]![0]!.cancer).toBeCloseTo(
      windowAverage(decliningSeries, 0, 30 * Y).average,
      12,
    );
  });
});
