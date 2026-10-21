import { describe, expect, it } from 'vitest';
import {
  PARTICULATE_DEFAULTS,
  pef,
  pef1996Default,
  pef2002Default,
  qOverC2002,
  QOVERC_2002_STATIONS,
  windErosionFlux,
  particulateBoxEmission,
  particulatePefDirect,
} from '../src/processes/particulate/index.js';
import { outdoorAirEpc } from '../src/processes/outdoorAir/index.js';

const box = { length: 22.5, width: 22.5, height: 2, windSpeed: 2.25 };

describe('particulate wind erosion and PEF', () => {
  // published-reproduction: ssg1996-default-pef
  it('reproduces the SSG 1996 default PEF 1.32E9 (printed 3 figures)', () => {
    const v = pef1996Default();
    expect(v / 1e9).toBeCloseTo(1.3162, 3);
    expect(Number(v.toPrecision(3))).toBe(1.32e9);
  });
  // published-reproduction: ssg2002-default-pef
  it('reproduces the SSG 2002 default PEF 1.36E9 with Q/C 93.77', () => {
    const v = pef2002Default();
    expect(Number(v.toPrecision(3))).toBe(1.36e9);
  });
  it('wind erosion flux in SI equals 0.036(1-V)(Um/Ut)^3 F g/(m2 h)', () => {
    const j = windErosionFlux(PARTICULATE_DEFAULTS);
    const gPerM2H = 0.036 * 0.5 * (4.69 / 11.32) ** 3 * 0.194;
    expect(j).toBeCloseTo(gPerM2H / 1000 / 3600, 18);
  });
  it('PEF = (Q/C)/J with Q/C in g/(m2 s) per kg/m3', () => {
    const j = windErosionFlux(PARTICULATE_DEFAULTS);
    expect(pef(90.8, j) / (90.8 / 1000 / j)).toBeCloseTo(1, 12);
  });
  it('rejects non-physical inputs', () => {
    expect(() => windErosionFlux({ ...PARTICULATE_DEFAULTS, vegetativeCover: 1 })).toThrow(
      RangeError,
    );
    expect(() => windErosionFlux({ ...PARTICULATE_DEFAULTS, thresholdWind: 0 })).toThrow(
      RangeError,
    );
    expect(() => pef(0, 1e-12)).toThrow(RangeError);
  });
});

describe('2002 Q/C regression (Exhibit D-2)', () => {
  it('Minneapolis at 0.5 acre gives 93.77', () => {
    expect(qOverC2002('Minneapolis, MN', 0.5)).toBeCloseTo(93.77, 2);
  });
  it('has 29 stations and rejects unknown ones and out-of-range areas', () => {
    expect(QOVERC_2002_STATIONS.length).toBe(29);
    expect(() => qOverC2002('Nowhere', 1)).toThrow(RangeError);
    expect(() => qOverC2002('Minneapolis, MN', 0.4)).toThrow(RangeError);
    expect(() => qOverC2002('Minneapolis, MN', 501)).toThrow(RangeError);
  });
});

describe('outdoor box interface', () => {
  it('box particulate emission matches J Cs L / (u delta)', () => {
    const cs = 1e-4;
    const j = windErosionFlux(PARTICULATE_DEFAULTS);
    const e = particulateBoxEmission('particulate.box-emission', j, cs);
    const r = outdoorAirEpc({ box, emissions: [e], direct: [] });
    const expected = (j * cs * box.length) / (box.windSpeed * box.height);
    expect(r.concentration(0) / expected).toBeCloseTo(1, 12);
  });
  it('PEF direct contribution is Cs/PEF and rides outdoorAirEpc direct', () => {
    const cs = 1e-4;
    const d = particulatePefDirect('particulate.ssg-pef-1996', cs, 1.32e9);
    const r = outdoorAirEpc({ emissions: [], direct: [d] });
    expect(r.concentration(5) / (cs / 1.32e9)).toBeCloseTo(1, 12);
    expect(r.contributions[0]!.via).toBe('direct');
  });
  it('PEF and box agree when Q/C equals the box equivalent u delta / L', () => {
    const cs = 2e-4;
    const j = windErosionFlux(PARTICULATE_DEFAULTS);
    const qcSi = (box.windSpeed * box.height) / box.length; // kg/(m2 s) per kg/m3
    const p = pef(qcSi * 1000, j);
    const viaPef = outdoorAirEpc({ emissions: [], direct: [particulatePefDirect('p', cs, p)] });
    const viaBox = outdoorAirEpc({
      box,
      emissions: [particulateBoxEmission('b', j, cs)],
      direct: [],
    });
    expect(viaPef.concentration(0) / viaBox.concentration(0)).toBeCloseTo(1, 12);
  });
});
