import { describe, expect, it } from 'vitest';
import {
  at123dBankPlane,
  bankPlaneDischarge,
  bankScreenAverage,
  at123dConcentration,
  createAt123dMemo,
  constantEpc,
  groundwaterAt123d,
  modernChemical,
  modernReceptor,
  MODERN_RESIDENT_BOUNDARY,
  runLegacySurfaceWater,
  runModernSurfaceWater,
  runModernScenario,
  surfaceWaterEpc,
  type LegacySurfaceWaterInput,
  type ModernSurfaceWaterInput,
} from '../src/index.js';
import { DAY_S, mgPerLToKgPerM3 } from '../src/processes/surfaceWater/units.js';
import { Y, benzeneBoundary } from './scenarioHelpers.js';

const d = (x: number): number => x / DAY_S;

// R-8 river, SI: Q_gw 250 m3/d, Q_u 180 m3/d, A 5 m2, L_r 100 m, no decay.
const riverBody = { type: 'river', crossSection: 5 } as const;
const legacyBase = (over: Partial<LegacySurfaceWaterInput> = {}): LegacySurfaceWaterInput => ({
  body: riverBody,
  upstreamFlow: d(180),
  background: 0,
  mixingFraction: 1,
  decay: 0,
  reach: { kind: 'entered', length: 100 },
  discharge: { kind: 'darcy', bedConductivity: d(10), thickness: 5, gradient: 0.05 },
  times: [0, 10 * Y, 20 * Y],
  groundwaterConcentrations: [0, mgPerLToKgPerM3(5), mgPerLToKgPerM3(2)],
  sediment: { fractionOrganicCarbon: 0.01, koc: 59e-3 },
  ...over,
});

describe('M1 bank screen average (legacy edge series)', () => {
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
  const times = Array.from({ length: 11 }, (_, i) => i * 4 * Y);
  const run = (time: number) => groundwaterAt123d.run({ ...input, time, points });

  it('is the trapezoid rule over the equally spaced screen points at every sample time', () => {
    const s = bankScreenAverage(run, times);
    expect(s.times).toEqual(times);
    times.forEach((t, i) => {
      const c = run(t).concentrations;
      const trap = (0.5 * c[0]! + c[1]! + 0.5 * c[2]!) / 2;
      expect(s.values[i]).toBeCloseTo(trap, 22);
    });
    expect(Math.max(...s.values)).toBeGreaterThan(0);
  });

  it('gives a plume confined to the top of five points 0.125 of the top value, not 0.2', () => {
    const s = bankScreenAverage(() => ({ concentrations: [1, 0, 0, 0, 0] }), [1]);
    expect(s.values[0]).toBeCloseTo(0.125, 15);
    const one = bankScreenAverage(() => ({ concentrations: [3] }), [1]);
    expect(one.values[0]).toBe(3);
  });

  it('feeds the legacy box: C_sw = Q_gw C_gw / Q_mix at each time', () => {
    const s = bankScreenAverage(run, times);
    const r = runLegacySurfaceWater(
      legacyBase({ times: s.times, groundwaterConcentrations: s.values }),
    );
    const qgw = d(250);
    r.surfaceWater.forEach((c, i) => {
      expect(c).toBeCloseTo((qgw * s.values[i]!) / (d(180) + qgw), 22);
    });
    expect(r.peakSurfaceWater).toBe(Math.max(...r.surfaceWater));
  });

  it('maps the bank plane onto AT123D coordinates (depth below the water table)', () => {
    const plane = at123dBankPlane(input, 60, 0);
    const t = 20 * Y;
    expect(plane(0, 2, t)).toBe(
      groundwaterAt123d.run({ ...input, time: t, points: [{ x: 60, y: 0, z: -2 }] })
        .concentrations[0],
    );
  });
});

describe('bank plane tail tolerance', () => {
  const input = {
    aquifer: {
      velocity: 1e-6,
      porosity: 0.3,
      retardation: 2,
      decayRate: 0,
      dx: 1e-5,
      dy: 4e-6,
      dz: 5e-8,
    },
    source: { x1: -15, x2: 0, y1: -10, y2: 10, z1: -3, z2: 0 },
    loading: [{ start: 0, end: Infinity, rate: 1e-9 }],
  };
  const t = 5 * Y;

  it('an absolute tolerance on the point concentration keeps a tail point within it', () => {
    const p = { x: 50, y: 150, z: -1 };
    const strict = at123dConcentration({ ...input, time: t }, p);
    const centre = at123dConcentration({ ...input, time: t }, { x: 50, y: 0, z: -1 });
    const absTol = 1e-9 * centre;
    const loose = at123dConcentration({ ...input, time: t }, p, { absTol });
    expect(Math.abs(loose - strict)).toBeLessThanOrEqual(absTol);
    // the default is unchanged
    expect(at123dConcentration({ ...input, time: t }, p, {})).toBe(strict);
  });

  it('a plane with a tail tolerance gives the strict discharge to far better than the plane tolerance', () => {
    const strict = at123dBankPlane(input, 50, 0);
    const tail = at123dBankPlane(input, 50, 0, { tailTolerance: 1e-9 });
    const plane = { reachLength: 600, thickness: 3, darcyFlux: 3e-7 };
    const times = [5 * Y];
    const q = { relTol: 1e-3, panels: 1 };
    const a = bankPlaneDischarge(strict, plane, times, q).discharge;
    const b = bankPlaneDischarge(tail, plane, times, q).discharge;
    a.forEach((w, i) => {
      expect(w).toBeGreaterThan(0);
      expect(Math.abs(b[i]! - w) / w).toBeLessThan(1e-6);
    });
  }, 60000);

  it('remembered axis factors give exactly the numbers of the plain kernel, over a sweep of points', () => {
    const memo = createAt123dMemo();
    const pts = [
      { x: 50, y: 0, z: -1 },
      { x: 50, y: 0, z: -2.5 },
      { x: 50, y: 12, z: -1 },
      { x: 50, y: 12, z: -2.5 },
      { x: 50, y: -30, z: -1 },
      { x: 50, y: 0, z: -1 },
    ];
    for (const time of [2 * Y, 5 * Y]) {
      for (const p of pts) {
        const plain = at123dConcentration({ ...input, time }, p);
        expect(at123dConcentration({ ...input, time }, p, { memo })).toBe(plain);
      }
    }
  });

  it('rejects a non-positive or non-finite tail tolerance', () => {
    expect(() => at123dBankPlane(input, 50, 0, { tailTolerance: 0 })).toThrow(RangeError);
    expect(() => at123dBankPlane(input, 50, 0, { tailTolerance: Infinity })).toThrow(RangeError);
  });
});

describe('legacy run (surfaceWater.well-mixed)', () => {
  it('reproduces R-8 river: 2.91 mg/L and 2.95 mg/kg at the steady groundwater concentration', () => {
    const r = runLegacySurfaceWater(
      legacyBase({
        times: [0, Y],
        groundwaterConcentrations: [mgPerLToKgPerM3(5), mgPerLToKgPerM3(5)],
      }),
    );
    expect(r.surfaceWater[1]! * 1e3).toBeCloseTo(2.906977, 6);
    expect(r.groundwaterFlow * DAY_S).toBeCloseTo(250, 9);
    expect(r.sediment.quantified).toBe(true);
    expect(r.sediment.concentrations![1]! * 1e6).toBeCloseTo(2.95, 9);
  });

  it('a zero sediment pore water gives zero, a chemical without Koc or Kd is not quantified', () => {
    const r = runLegacySurfaceWater(legacyBase());
    expect(r.sediment.concentrations![0]).toBe(0);
    const n = runLegacySurfaceWater(legacyBase({ sediment: { fractionOrganicCarbon: 0.01 } }));
    expect(n.sediment.quantified).toBe(false);
    expect(n.sediment.concentrations).toBeUndefined();
    expect(n.warnings.map((w) => w.code)).toContain('surfaceWater.sediment-not-quantified');
  });

  it('uses the Domenico width as the reach length and warns', () => {
    const r = runLegacySurfaceWater(
      legacyBase({ reach: { kind: 'domenico', sourceWidth: 10, distance: 100 } }),
    );
    expect(r.reachLength).toBeCloseTo(127.188644, 5);
    expect(r.groundwaterFlow * DAY_S).toBeCloseTo(10 * 5 * 127.188644 * 0.05, 5);
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('surfaceWater.domenico-reach');
  });

  it('attaches the M1 Domenico validity warnings the caller passes', () => {
    const r = runLegacySurfaceWater(
      legacyBase({
        reach: { kind: 'domenico', sourceWidth: 10, distance: 100 },
        link: { domenicoWarnings: [{ code: 'domenico.near-source', message: 'near the source' }] },
      }),
    );
    expect(r.warnings.map((w) => w.code)).toContain('domenico.near-source');
  });

  it('warns when the loading exceeds the source release, and when K_b i_b is far from the Darcy flux', () => {
    const r = runLegacySurfaceWater(
      legacyBase({
        link: { sourceReleaseRates: [1e-12, 1e-12, 1e-12], darcyFlux: d(10 * 0.05) * 5 },
      }),
    );
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('surfaceWater.loading-exceeds-source');
    expect(codes).toContain('surfaceWater.discharge-flux-mismatch');
    const ok = runLegacySurfaceWater(
      legacyBase({ link: { sourceReleaseRates: [1, 1, 1], darcyFlux: d(10 * 0.05) } }),
    );
    expect(ok.warnings.map((w) => w.code)).not.toContain('surfaceWater.loading-exceeds-source');
    expect(ok.warnings.map((w) => w.code)).not.toContain('surfaceWater.discharge-flux-mismatch');
  });

  it('warns of plume underflow from a supplied depth fraction, and of low dilution', () => {
    const r = runLegacySurfaceWater(
      legacyBase({ upstreamFlow: d(10), link: { plumeDepthFraction: 0.5 } }),
    );
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('surfaceWater.plume-underflow');
    expect(codes).toContain('surfaceWater.low-dilution');
  });

  it('rejects a lake without a volume, a river without a cross-section and a losing reach', () => {
    expect(() => runLegacySurfaceWater(legacyBase({ body: { type: 'lake' } as never }))).toThrow(
      RangeError,
    );
    expect(() => runLegacySurfaceWater(legacyBase({ body: { type: 'river' } as never }))).toThrow(
      RangeError,
    );
    expect(() =>
      runLegacySurfaceWater(
        legacyBase({
          discharge: { kind: 'darcy', bedConductivity: d(10), thickness: 5, gradient: -0.1 },
        }),
      ),
    ).toThrow(RangeError);
    expect(() => runLegacySurfaceWater(legacyBase({ groundwaterConcentrations: [0, 1] }))).toThrow(
      RangeError,
    );
  });

  it('5d: doubling C_gw doubles C_sw and C_sed with no background', () => {
    const a = runLegacySurfaceWater(legacyBase());
    const b = runLegacySurfaceWater(
      legacyBase({
        groundwaterConcentrations: legacyBase().groundwaterConcentrations.map((c) => 2 * c),
      }),
    );
    a.surfaceWater.forEach((c, i) => expect(b.surfaceWater[i]! / 2).toBeCloseTo(c, 18));
    a.sediment.concentrations!.forEach((c, i) =>
      expect(b.sediment.concentrations![i]! / 2).toBeCloseTo(c, 18),
    );
  });
});

describe('modern run (surfaceWater.mass-discharge)', () => {
  const steady = (n: number, w: number): { times: number[]; discharge: number[] } => ({
    times: Array.from({ length: n }, (_, i) => i * 20 * Y),
    discharge: Array.from({ length: n }, () => w),
  });
  const modernBase = (over: Partial<ModernSurfaceWaterInput> = {}): ModernSurfaceWaterInput => {
    const s = steady(4, d(250) * mgPerLToKgPerM3(5));
    return {
      body: { type: 'river', crossSection: 5, reachLength: 100 },
      upstreamFlow: d(180),
      background: 0,
      mixingFraction: 1,
      decay: 0,
      bank: { kind: 'discharge', times: s.times, discharge: s.discharge, groundwaterFlow: d(250) },
      sediment: { fractionOrganicCarbon: 0.01, koc: 59e-3 },
      ...over,
    };
  };

  it('5a: a constant loading tends to the legacy box; the flux-averaged concentration is W / Q_gw', () => {
    const r = runModernSurfaceWater(modernBase());
    expect(r.surfaceWater.at(-1)! * 1e3).toBeCloseTo(2.906977, 5);
    expect(r.fluxAveragedConcentration[0]).toBeCloseTo(mgPerLToKgPerM3(5), 18);
    expect(r.sediment.concentrations!.at(-1)! * 1e6).toBeCloseTo(2.95, 9);
    expect(r.residenceTime).toBeGreaterThan(0);
  });

  it('computes the discharge from a plane concentration function and surfaces its warnings', () => {
    const r = runModernSurfaceWater(
      modernBase({
        bank: {
          kind: 'plane',
          concentration: (y, depth) => (Math.abs(y) < 5 && depth < 2 ? 1e-3 : 0),
          plane: {
            reachLength: 100,
            thickness: 5,
            darcyFlux: 1e-7,
            fullHalfWidth: 100,
            fullDepth: 50,
          },
          times: [0, Y],
        },
      }),
    );
    // plume 10 m wide and 2 m deep carries q C * 20 m^2
    expect(r.discharge[1]).toBeCloseTo(1e-7 * 1e-3 * 20, 12);
    expect(r.groundwaterFlow).toBeCloseTo(1e-7 * 5 * 100, 15);
    expect(r.warnings.map((w) => w.code)).not.toContain('surfaceWater.reach-truncates-plume');
    const wide = runModernSurfaceWater(
      modernBase({
        bank: {
          kind: 'plane',
          concentration: (y) => (Math.abs(y) < 90 ? 1e-3 : 0),
          plane: { reachLength: 100, thickness: 5, darcyFlux: 1e-7, fullHalfWidth: 200 },
          times: [0, Y],
        },
      }),
    );
    expect(wide.warnings.map((w) => w.code)).toContain('surfaceWater.reach-truncates-plume');
  });

  it('adds the river receptor downstream (plug flow) and the pore water choice', () => {
    const r = runModernSurfaceWater(modernBase({ decay: d(0.1), downstream: { distance: 1000 } }));
    // H2: box 2.60416667 mg/L, receptor 0.814095196 mg/L (reach length 100 m, A 5 m2, f = 1)
    expect(r.surfaceWater.at(-1)! * 1e3).toBeCloseTo(2.60416667, 6);
    expect(r.downstream!.at(-1)! * 1e3).toBeCloseTo(0.814095196, 6);
    const sw = runModernSurfaceWater(
      modernBase({ sediment: { poreWater: 'surface', fractionOrganicCarbon: 0.01, koc: 59e-3 } }),
    );
    expect(sw.sediment.poreWater).toBe('surface');
    expect(sw.sediment.concentrations!.at(-1)! * 1e6).toBeCloseTo(2.906977 * 59 * 0.01, 5);
    expect(() =>
      runModernSurfaceWater(
        modernBase({
          sediment: { poreWater: 'centreline', fractionOrganicCarbon: 0.01, koc: 59e-3 },
        }),
      ),
    ).toThrow(RangeError);
  });

  it('refuses a downstream receptor on a lake, and a lake without a volume', () => {
    expect(() =>
      runModernSurfaceWater(
        modernBase({ body: { type: 'lake', volume: 1e5 }, downstream: { distance: 10 } }),
      ),
    ).toThrow(RangeError);
    expect(() => runModernSurfaceWater(modernBase({ body: { type: 'lake' } as never }))).toThrow(
      RangeError,
    );
  });

  it('5d: doubling the loading doubles C_sw, C_sed and C_down', () => {
    const base = modernBase({ decay: d(0.1), downstream: { distance: 1000 } });
    const bank = base.bank as Extract<ModernSurfaceWaterInput['bank'], { kind: 'discharge' }>;
    const a = runModernSurfaceWater(base);
    const b = runModernSurfaceWater({
      ...base,
      bank: { ...bank, discharge: bank.discharge.map((w) => 2 * w) },
    });
    a.surfaceWater.forEach((c, i) => expect(b.surfaceWater[i]! / 2).toBeCloseTo(c, 15));
    a.downstream!.forEach((c, i) => expect(b.downstream![i]! / 2).toBeCloseTo(c, 15));
    a.sediment.concentrations!.forEach((c, i) =>
      expect(b.sediment.concentrations![i]! / 2).toBeCloseTo(c, 15),
    );
  });
});

describe('5e: the surface water series feeds the M4 swimming pathways', () => {
  const b = JSON.parse(JSON.stringify(MODERN_RESIDENT_BOUNDARY)) as typeof MODERN_RESIDENT_BOUNDARY;
  for (const s of [...b.stages, ...b.mutagenStages!]) {
    s.swimTimeHr = 2;
    s.swimEventsPerDay = 1;
    s.efDaysPerYrByPathway = { swimIngestion: 10, swimDermal: 10 };
  }
  const receptor = modernReceptor(b);
  const benzene = modernChemical(benzeneBoundary);
  const run = (epc: ReturnType<typeof constantEpc>) =>
    runModernScenario({
      receptors: [
        {
          label: 'swimmer',
          receptor,
          pathways: ['swimIngestion', 'swimDermal'],
          chemicals: [
            { id: 'b', chemical: benzene, epcs: { swimIngestion: epc, swimDermal: epc } },
          ],
        },
      ],
    });

  it('a constant series gives the same risk as the constant EPC, with origin surfaceWater.*', () => {
    const c = 0.01; // mg/L
    const times = [0, 30 * Y, 60 * Y];
    const spec = surfaceWaterEpc(
      times,
      times.map(() => mgPerLToKgPerM3(c)),
      'surfaceWater.well-mixed',
    );
    expect(spec.kind).toBe('series');
    const s = run(spec);
    const k = run(constantEpc('swimIngestion', c));
    expect(s.receptors[0]!.totals.risk).toBeGreaterThan(0);
    expect(s.receptors[0]!.totals.risk / k.receptors[0]!.totals.risk).toBeCloseTo(1, 10);
    expect(s.epcs[0]!.map((e) => e.origin)).toEqual([
      'surfaceWater.well-mixed',
      'surfaceWater.well-mixed',
    ]);
  });

  it('a one-time result becomes a constant EPC, and a run reports both origins', () => {
    const one = surfaceWaterEpc([0], [1e-5], 'surfaceWater.well-mixed');
    expect(one.kind).toBe('constant');
    const lr = runLegacySurfaceWater(legacyBase());
    expect(lr.epc.kind).toBe('series');
    expect(lr.epc.origin).toBe('surfaceWater.well-mixed');
    const mr = runModernSurfaceWater({
      body: { type: 'river', crossSection: 5, reachLength: 100 },
      upstreamFlow: d(180),
      background: 0,
      mixingFraction: 1,
      decay: 0,
      bank: { kind: 'discharge', times: [0, Y], discharge: [1e-9, 1e-9], groundwaterFlow: d(250) },
      downstream: { distance: 500 },
    });
    expect(mr.epc.origin).toBe('surfaceWater.mass-discharge');
    expect(mr.downstreamEpc?.origin).toBe('surfaceWater.mass-discharge');
    // the series drives a risk run
    expect(run(lr.epc).receptors[0]!.totals.risk).toBeGreaterThan(0);
  });
});
