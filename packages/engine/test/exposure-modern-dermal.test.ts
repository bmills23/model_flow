import { describe, expect, it } from 'vitest';
import {
  dermalToxicity,
  dermalWaterEventPerEpc,
  type DermalWaterParams,
} from '../src/processes/exposure/dermal.js';
import {
  cmPerHourToMPerS,
  hoursToSeconds,
  sfFromPerMgKgDay,
  rfdFromMgPerKgDay,
} from '../src/processes/exposure/units.js';

const CM = 0.01;
// Benzene, November 2024 RSL: Kp 0.0149 cm/h, tau 0.287934 h, B 0.0506501, t* 0.691041 h, FA 1.
const benzene: DermalWaterParams = {
  organic: true,
  kp: cmPerHourToMPerS(0.0149),
  tauEvent: hoursToSeconds(0.28793386679266),
  tStar: hoursToSeconds(0.69104128030237),
  b: 0.05065008038978,
  fa: 1,
};

describe('dermal water event model (RAGS Part E)', () => {
  it('organic, event no longer than t*: short-time form (hand case M1, 0.6708 h)', () => {
    const r = dermalWaterEventPerEpc(benzene, hoursToSeconds(0.6708));
    expect(r?.regime).toBe('short');
    // 2 FA Kp sqrt(6 tau t / pi), in cm
    expect(r!.perEpc / CM).toBeCloseTo(0.01809922, 8);
  });

  it('organic, event longer than t*: steady-state form', () => {
    const t = hoursToSeconds(1.5);
    const r = dermalWaterEventPerEpc(benzene, t);
    expect(r?.regime).toBe('long');
    const kp = benzene.kp!;
    const tau = benzene.tauEvent!;
    const b = benzene.b!;
    const expected = kp * (t / (1 + b) + (2 * tau * (1 + 3 * b + 3 * b * b)) / (1 + b) ** 2);
    expect(r!.perEpc / expected).toBeCloseTo(1, 12);
  });

  it('has no large jump across t* (the two forms are fitted close to each other)', () => {
    const tStar = benzene.tStar!;
    const lo = dermalWaterEventPerEpc(benzene, tStar * 0.999999)!;
    const hi = dermalWaterEventPerEpc(benzene, tStar * 1.000001)!;
    expect(lo.regime).toBe('short');
    expect(hi.regime).toBe('long');
    expect(Math.abs(hi.perEpc / lo.perEpc - 1)).toBeLessThan(0.05);
  });

  it('inorganic: Kp times the event time, ignoring tau, B and t*', () => {
    const r = dermalWaterEventPerEpc(
      { organic: false, kp: cmPerHourToMPerS(0.001), tauEvent: 1, tStar: 1, b: 1, fa: 0.5 },
      hoursToSeconds(0.6708),
    );
    expect(r?.regime).toBe('inorganic');
    expect(r!.perEpc / CM).toBeCloseTo(0.001 * 0.6708, 14);
  });

  it('FA scales both organic forms linearly', () => {
    const half = { ...benzene, fa: 0.5 };
    for (const h of [0.5, 1.5]) {
      const a = dermalWaterEventPerEpc(benzene, hoursToSeconds(h))!;
      const b = dermalWaterEventPerEpc(half, hoursToSeconds(h))!;
      expect(b.perEpc / a.perEpc).toBeCloseTo(0.5, 12);
    }
  });

  it('returns null when an organic chemical lacks lag-time parameters or Kp is absent', () => {
    expect(dermalWaterEventPerEpc({ organic: true, kp: 1e-6 }, 100)).toBeNull();
    expect(dermalWaterEventPerEpc({ organic: false }, 100)).toBeNull();
  });

  it('rejects out-of-range inputs', () => {
    expect(() => dermalWaterEventPerEpc({ ...benzene, fa: 1.2 }, 100)).toThrow(RangeError);
    expect(() => dermalWaterEventPerEpc({ ...benzene, kp: -1 }, 100)).toThrow(RangeError);
    expect(() => dermalWaterEventPerEpc(benzene, -1)).toThrow(RangeError);
    expect(() => dermalWaterEventPerEpc(benzene, Number.NaN)).toThrow(RangeError);
  });
});

describe('dermal toxicity values (RAGS Part E chapter 4)', () => {
  const sfo = sfFromPerMgKgDay(1.5);
  const rfdo = rfdFromMgPerKgDay(0.003);

  it('uses the oral values unchanged when GIABS is at least 0.5 or absent', () => {
    for (const giabs of [0.5, 0.8, 1, undefined]) {
      const d = dermalToxicity({ sfo, rfdo, giabs });
      expect(d.sf).toBe(sfo);
      expect(d.rfd).toBe(rfdo);
      expect(d.adjusted).toBe(false);
    }
  });

  it('divides the slope factor and multiplies the reference dose by GIABS below 0.5', () => {
    const d = dermalToxicity({ sfo, rfdo, giabs: 0.25 });
    expect(d.sf! / (sfo / 0.25)).toBeCloseTo(1, 14);
    expect(d.rfd! / (rfdo * 0.25)).toBeCloseTo(1, 14);
    expect(d.adjusted).toBe(true);
  });

  it('leaves absent values absent and reports no adjustment when nothing was changed', () => {
    const d = dermalToxicity({ giabs: 0.1 });
    expect(d.sf).toBeUndefined();
    expect(d.rfd).toBeUndefined();
    expect(d.adjusted).toBe(false);
  });
});
