import { describe, expect, it } from 'vitest';
import {
  darcyDischarge,
  legacyBox,
  legacyBoxSeries,
  riverVolume,
} from '../src/processes/surfaceWater/legacy.js';
import { domenicoReachLength } from '../src/processes/surfaceWater/reach.js';
import { sedimentConcentration } from '../src/processes/surfaceWater/sediment.js';
import {
  DAY_S,
  kgPerKgToMgPerKg,
  lPerKgToM3PerKg,
  mgPerLToKgPerM3,
} from '../src/processes/surfaceWater/units.js';

const d = (x: number): number => x / DAY_S;
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

const base = {
  upstreamFlow: d(180),
  background: 0,
  mixingFraction: 1,
  groundwaterFlow: d(250),
  groundwaterConcentration: mgPerLToKgPerM3(5),
  decay: 0,
  bodyVolume: 500,
};

describe('Darcy discharge', () => {
  it('Q_gw = K_b d L_r i_b', () => {
    const q = darcyDischarge({
      bedConductivity: d(10),
      thickness: 5,
      reachLength: 100,
      gradient: 0.05,
    });
    expect(rel(q, d(250))).toBeLessThan(1e-12);
  });
  it('rejects a losing reach and non-positive geometry', () => {
    const ok = { bedConductivity: d(10), thickness: 5, reachLength: 100, gradient: 0.05 };
    expect(() => darcyDischarge({ ...ok, gradient: 0 })).toThrow(RangeError);
    expect(() => darcyDischarge({ ...ok, gradient: -0.1 })).toThrow(RangeError);
    expect(() => darcyDischarge({ ...ok, thickness: 0 })).toThrow(RangeError);
    expect(() => darcyDischarge({ ...ok, reachLength: NaN })).toThrow(RangeError);
  });
});

describe('legacy box', () => {
  it('matches C = W / (Q_mix + k V) by hand', () => {
    const r = legacyBox({ ...base, mixingFraction: 0.1, decay: 0.005 / DAY_S, bodyVolume: 1e5 });
    expect(rel(r.concentration, mgPerLToKgPerM3(1.25e6 / 318 / 1000))).toBeLessThan(1e-12);
    expect(rel(r.residenceTime, (10000 / (268 + 50)) * DAY_S)).toBeLessThan(1e-12);
  });
  it('scales the background with the mixing fraction', () => {
    const r = legacyBox({
      ...base,
      groundwaterConcentration: 0,
      background: 2,
      mixingFraction: 0.5,
    });
    const expected = (0.5 * d(180) * 2) / (0.5 * d(180) + d(250));
    expect(rel(r.concentration, expected)).toBeLessThan(1e-12);
  });
  it('is affine in the groundwater concentration and linear without background', () => {
    const a = legacyBox(base).concentration;
    const b = legacyBox({
      ...base,
      groundwaterConcentration: 2 * base.groundwaterConcentration,
    }).concentration;
    expect(rel(b, 2 * a)).toBeLessThan(1e-12);
  });
  it('rejects invalid inputs', () => {
    expect(() => legacyBox({ ...base, mixingFraction: 0 })).toThrow(RangeError);
    expect(() => legacyBox({ ...base, mixingFraction: 1.01 })).toThrow(RangeError);
    expect(() => legacyBox({ ...base, upstreamFlow: -1 })).toThrow(RangeError);
    expect(() => legacyBox({ ...base, decay: -1 })).toThrow(RangeError);
    expect(() => legacyBox({ ...base, background: Infinity })).toThrow(RangeError);
    expect(() => legacyBox({ ...base, groundwaterFlow: 0, upstreamFlow: 0 })).toThrow(RangeError);
    expect(() => legacyBox({ ...base, bodyVolume: 0, decay: 1e-6 })).toThrow(RangeError);
    expect(() => riverVolume(0, 100)).toThrow(RangeError);
  });
  it('warns on low dilution, solubility and a long residence time', () => {
    const r = legacyBox({
      ...base,
      upstreamFlow: d(10),
      bodyVolume: 1e7,
      solubility: mgPerLToKgPerM3(1),
    });
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('surfaceWater.low-dilution');
    expect(codes).toContain('surfaceWater.above-solubility');
    expect(codes).toContain('surfaceWater.quasi-steady');
    expect(legacyBox({ ...base, upstreamFlow: d(1000) }).warnings).toEqual([]);
  });
  it('evaluates a series quasi-steadily at each time', () => {
    const s = legacyBoxSeries({
      ...base,
      times: [0, 1, 2],
      groundwaterConcentrations: [1, 2, 3].map(mgPerLToKgPerM3),
    });
    const single = (c: number): number =>
      legacyBox({ ...base, groundwaterConcentration: mgPerLToKgPerM3(c) }).concentration;
    expect(s.concentrations).toEqual([single(1), single(2), single(3)]);
    expect(() =>
      legacyBoxSeries({ ...base, times: [0, 0], groundwaterConcentrations: [1, 1] }),
    ).toThrow(RangeError);
    expect(() =>
      legacyBoxSeries({ ...base, times: [0, 1], groundwaterConcentrations: [1] }),
    ).toThrow(RangeError);
  });
});

describe('H3: reach length from the 5 percent Domenico width', () => {
  it.each([
    [100, 10, 127.188644],
    [50, 20, 69.2042413],
    [200, 5, 252.900937],
  ])('x_s %f m, Y %f m gives %f m', (xs, y, expected) => {
    const lr = domenicoReachLength({ sourceWidth: y, distance: xs });
    expect(rel(lr, expected)).toBeLessThan(1e-8);
  });
  it('accepts an explicit transverse dispersivity and rejects bad input', () => {
    const wide = domenicoReachLength({
      sourceWidth: 10,
      distance: 100,
      transverseDispersivity: 10,
    });
    expect(wide).toBeGreaterThan(domenicoReachLength({ sourceWidth: 10, distance: 100 }));
    expect(() => domenicoReachLength({ sourceWidth: 10, distance: 0 })).toThrow(RangeError);
    expect(() => domenicoReachLength({ sourceWidth: 0, distance: 10 })).toThrow(RangeError);
  });
});

describe('H4 and sediment rules', () => {
  it('Koc 59 L/kg, f_oc 0.02, pore water 0.05 mg/L', () => {
    const r = sedimentConcentration({
      poreWaterConcentration: mgPerLToKgPerM3(0.05),
      fractionOrganicCarbon: 0.02,
      koc: lPerKgToM3PerKg(59),
    });
    expect(rel(kgPerKgToMgPerKg(r.concentration as number), 0.059)).toBeLessThan(1e-9);
    expect(rel(kgPerKgToMgPerKg(r.organicCarbonNormalized as number), 2.95)).toBeLessThan(1e-9);
  });
  it('uses Koc over Kd, falls back to Kd, and never returns zero when not quantified', () => {
    const pw = mgPerLToKgPerM3(1);
    const both = sedimentConcentration({
      poreWaterConcentration: pw,
      fractionOrganicCarbon: 0.01,
      koc: 100,
      kd: 500,
    });
    expect(both.kd).toBeCloseTo(1, 12);
    const kdOnly = sedimentConcentration({
      poreWaterConcentration: pw,
      fractionOrganicCarbon: 0.01,
      kd: 0.5,
    });
    expect(kdOnly.kd).toBe(0.5);
    expect(kdOnly.organicCarbonNormalized).toBeUndefined();
    const none = sedimentConcentration({ poreWaterConcentration: pw, fractionOrganicCarbon: 0.01 });
    expect(none.quantified).toBe(false);
    expect(none.concentration).toBeUndefined();
    expect(none.warnings[0]?.code).toBe('surfaceWater.sediment-not-quantified');
  });
  it('rejects bad f_oc and negative inputs', () => {
    expect(() =>
      sedimentConcentration({ poreWaterConcentration: 1, fractionOrganicCarbon: 1.5, koc: 1 }),
    ).toThrow(RangeError);
    expect(() =>
      sedimentConcentration({ poreWaterConcentration: -1, fractionOrganicCarbon: 0.1, koc: 1 }),
    ).toThrow(RangeError);
  });
});
