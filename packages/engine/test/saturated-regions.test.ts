import { describe, expect, it } from 'vitest';
import { hand, handInput, relErr, DAY, YEAR, type HandCase } from './saturatedHelpers.js';
import {
  waterLevels,
  regionConcentrations,
  regionRates,
  type SaturatedSourceInput,
} from '../src/processes/saturatedSource/index.js';
import { massRateFromConcentration } from '../src/processes/groundwater/kernel.js';

describe('waterLevels', () => {
  const g = handInput('A').source;
  it('gives low and high saturated thickness and the unsaturated remainder', () => {
    expect(waterLevels(g)).toEqual({
      hLo: 0.5,
      hHi: 1.5,
      capped: false,
      unsatLo: 1.5,
      unsatHi: 0.5,
    });
  });
  it('caps the high-water thickness at the source thickness', () => {
    const w = waterLevels({ ...g, fluctuation: 3 });
    expect(w).toEqual({ hLo: 0.5, hHi: 2, capped: true, unsatLo: 1.5, unsatHi: 0 });
    expect(waterLevels({ ...g, fluctuation: 1.5 }).capped).toBe(false);
  });
  it('allows a wholly dry and a wholly submerged source', () => {
    expect(waterLevels({ ...g, minSaturatedThickness: 0, fluctuation: 0 }).hHi).toBe(0);
    const sub = waterLevels({ ...g, minSaturatedThickness: 2, fluctuation: 0 });
    expect(sub).toMatchObject({ hLo: 2, hHi: 2, unsatLo: 0, capped: false });
  });
  it('rejects bad geometry', () => {
    expect(() => waterLevels({ ...g, minSaturatedThickness: 2.5 })).toThrow(RangeError);
    expect(() => waterLevels({ ...g, minSaturatedThickness: -0.1 })).toThrow(RangeError);
    expect(() => waterLevels({ ...g, fluctuation: -1 })).toThrow(RangeError);
    expect(() => waterLevels({ ...g, fractionHigh: 1.1 })).toThrow(RangeError);
    expect(() => waterLevels({ ...g, fractionHigh: -0.1 })).toThrow(RangeError);
    expect(() => waterLevels({ ...g, length: 0 })).toThrow(RangeError);
    expect(() => waterLevels({ ...g, thickness: Number.NaN })).toThrow(RangeError);
  });
});

function regionsOf(which: HandCase, patch: Partial<SaturatedSourceInput> = {}) {
  const i = handInput(which, patch);
  const lv = waterLevels(i.source);
  return {
    i,
    lv,
    r: regionConcentrations({
      soil: i.soil,
      chemical: i.chemical,
      conductivity: i.aquifer.conductivity,
      infiltration: i.infiltration,
      unsaturatedExists: lv.unsatLo > 0,
      saturatedExists: lv.hHi > 0,
      onClamp: 'clamp',
    }),
  };
}

describe('regionConcentrations against the hand cases', () => {
  for (const which of ['A', 'B'] as const) {
    it(`case ${which}`, () => {
      const e = hand.cases[which].expected;
      const { r } = regionsOf(which);
      const u = r.unsaturated!;
      const s = r.saturated!;
      expect(relErr(u.theta, e.theta1)).toBeLessThan(1e-9);
      expect(relErr(u.thetaA, e.thetaA1)).toBeLessThan(1e-9);
      expect(relErr(u.x, e.moleFraction)).toBeLessThan(1e-9);
      expect(relErr(u.effS * 1e3, e.xSMgPerL)).toBeLessThan(1e-9);
      expect(relErr(u.ceq * 1e3, e.ceq1MgPerL)).toBeLessThan(1e-9);
      expect(relErr(s.ceq * 1e3, e.ceq2MgPerL)).toBeLessThan(1e-9);
      expect(relErr(u.c * 1e3, e.c1MgPerL)).toBeLessThan(1e-9);
      expect(relErr(s.c * 1e3, e.c2MgPerL)).toBeLessThan(1e-9);
      expect(u.residual).toBe(which === 'A');
      expect(s.residual).toBe(which === 'A');
      expect(s.theta).toBe(0.3);
      expect(s.thetaA).toBe(0);
    });
  }
  it('skips region 1 when there is no infiltration, and region 2 when never submerged', () => {
    expect(regionsOf('A', { infiltration: 0 }).r.unsaturated).toBeNull();
    const dry = regionsOf('A', {
      source: { ...handInput('A').source, minSaturatedThickness: 0, fluctuation: 0 },
    });
    expect(dry.r.saturated).toBeNull();
    expect(dry.r.unsaturated).not.toBeNull();
  });
  it('reduces infiltration above K on the legacy method and refuses it on the modern one', () => {
    const K = handInput('A').aquifer.conductivity;
    const { r } = regionsOf('A', { infiltration: 2 * K });
    expect(r.clamped).toBe(true);
    expect(r.infiltration).toBe(K);
    expect(r.unsaturated!.theta).toBe(0.3);
    const i = handInput('A', { infiltration: 2 * K });
    const lv = waterLevels(i.source);
    expect(() =>
      regionConcentrations({
        soil: i.soil,
        chemical: i.chemical,
        conductivity: K,
        infiltration: i.infiltration,
        unsaturatedExists: lv.unsatLo > 0,
        saturatedExists: true,
        onClamp: 'throw',
      }),
    ).toThrow(RangeError);
  });
  it('rejects invalid soil and chemical inputs', () => {
    const bad = (p: Partial<SaturatedSourceInput['soil']>) =>
      regionsOf('A', { soil: { ...handInput('A').soil, ...p } });
    expect(() => bad({ porosity: 0 })).toThrow(RangeError);
    expect(() => bad({ porosity: 1.2 })).toThrow(RangeError);
    expect(() => bad({ rhoB: 0 })).toThrow(RangeError);
    expect(() => bad({ foc: -1 })).toThrow(RangeError);
    expect(() => bad({ thetaR: 0.3 })).toThrow(RangeError);
    expect(() => bad({ n: 1 })).toThrow(RangeError);
    const chem = (p: Partial<SaturatedSourceInput['chemical']>) =>
      regionsOf('A', { chemical: { ...handInput('A').chemical, ...p } });
    expect(() => chem({ S: 0 })).toThrow(RangeError);
    expect(() => chem({ M: 0 })).toThrow(RangeError);
    expect(() => chem({ F: -1 })).toThrow(RangeError);
    expect(() => chem({ H: -1 })).toThrow(RangeError);
    expect(() => chem({ koc: -1 })).toThrow(RangeError);
    expect(() => chem({ F: 0.01 })).toThrow(RangeError);
    {
      const { FT: _omit, ...noFt } = handInput('A').chemical;
      void _omit;
      expect(() => regionsOf('A', { chemical: noFt })).toThrow(RangeError);
    }
    expect(() => chem({ MT: 10 })).toThrow(RangeError);
  });
});

describe('regionRates', () => {
  function ratesOf(which: HandCase, patch: Partial<SaturatedSourceInput> = {}) {
    const { i, lv, r } = regionsOf(which, patch);
    return {
      i,
      lv,
      r,
      rates: regionRates({
        levels: lv,
        regions: r,
        length: i.source.length,
        width: i.source.width,
        fractionHigh: i.source.fractionHigh,
        darcyFlux: i.aquifer.conductivity * i.aquifer.gradient,
      }),
    };
  }
  for (const which of ['A', 'B'] as const) {
    it(`matches the hand rates of case ${which} to 1e-9`, () => {
      const e = hand.cases[which].expected;
      const { rates } = ratesOf(which);
      expect(relErr(rates.low.q1 * DAY, e.q1LowKgPerDay)).toBeLessThan(1e-9);
      expect(relErr(rates.low.q2 * DAY, e.q2LowKgPerDay)).toBeLessThan(1e-9);
      expect(relErr(rates.high.q1 * DAY, e.q1HighKgPerDay)).toBeLessThan(1e-9);
      expect(relErr(rates.high.q2 * DAY, e.q2HighKgPerDay)).toBeLessThan(1e-9);
      expect(relErr(rates.mean * DAY, e.qMeanKgPerDay)).toBeLessThan(1e-9);
    });
  }
  it('gives Q1 = 0 when no unsaturated thickness is left, and Q2 bit for bit from M1', () => {
    const sub = ratesOf('A', {
      source: { ...handInput('A').source, minSaturatedThickness: 2, fluctuation: 0 },
    });
    expect(sub.rates.low.q1).toBe(0);
    expect(sub.rates.high.q1).toBe(0);
    const U = sub.i.aquifer.conductivity * sub.i.aquifer.gradient;
    expect(sub.rates.low.q2).toBe(
      massRateFromConcentration(sub.r.saturated!.c, U, sub.i.source.width * 2),
    );
    // high water submerges region 1 completely while low water still has it
    const hi = ratesOf('A', {
      source: { ...handInput('A').source, minSaturatedThickness: 1, fluctuation: 1 },
    });
    expect(hi.rates.low.q1).toBeGreaterThan(0);
    expect(hi.rates.high.q1).toBe(0);
  });
  it('is zero without infiltration on a dry source and without gradient', () => {
    const dry = ratesOf('A', {
      infiltration: 0,
      source: { ...handInput('A').source, minSaturatedThickness: 0, fluctuation: 0 },
    });
    expect(dry.rates.mean).toBe(0);
    expect(YEAR).toBeGreaterThan(0);
  });
});
