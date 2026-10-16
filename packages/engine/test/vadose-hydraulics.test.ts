import { describe, expect, it } from 'vitest';
import {
  brooksCoreyKr,
  brooksCoreySe,
  lenhardLambda,
  mualemVanGenuchtenKr,
  mualemVanGenuchtenSe,
  unitGradientMoisture,
} from '../src/processes/vadose/hydraulics.js';
import {
  effectiveSolubility,
  equilibriumPoreWater,
  residualPhaseTest,
} from '../src/processes/vadose/partitioning.js';
import { millingtonQuirkDeff, seriesDeff } from '../src/processes/vadose/diffusion.js';
import { integrateTanhSinh } from '../src/numerics/quadrature.js';

const NS = [1.2, 2, 2.68, 5];
const SES = [0.05, 0.2, 0.5, 0.8, 0.95];

describe('Lenhard pore-size index', () => {
  it('is 0.75 at n = 2', () => {
    expect(lenhardLambda(2)).toBeCloseTo(0.75, 14);
  });
  it('rejects n <= 1 and non-finite n', () => {
    expect(() => lenhardLambda(1)).toThrow(RangeError);
    expect(() => lenhardLambda(0.5)).toThrow(RangeError);
    expect(() => lenhardLambda(NaN)).toThrow(RangeError);
  });
});

describe('relative conductivity and inverses', () => {
  it('Brooks-Corey round trips', () => {
    for (const lam of [0.2, 0.75, 1.5]) {
      for (const se of SES) {
        expect(Math.abs(brooksCoreySe(brooksCoreyKr(se, lam), lam) - se)).toBeLessThan(1e-12);
      }
    }
  });
  it('Mualem-van Genuchten round trips for several n', () => {
    for (const n of NS) {
      for (const se of SES) {
        const kr = mualemVanGenuchtenKr(se, n);
        expect(Math.abs(mualemVanGenuchtenSe(kr, n) - se)).toBeLessThan(1e-12);
      }
    }
  });
  it('end points', () => {
    expect(mualemVanGenuchtenKr(0, 2)).toBe(0);
    expect(mualemVanGenuchtenKr(1, 2)).toBe(1);
    expect(mualemVanGenuchtenSe(0, 2)).toBe(0);
    expect(mualemVanGenuchtenSe(1, 2)).toBe(1);
    expect(brooksCoreyKr(1, 0.75)).toBe(1);
    expect(brooksCoreySe(1, 0.75)).toBe(1);
  });
  it('is monotonic', () => {
    for (const n of NS) {
      let prev = -1;
      for (let i = 0; i <= 100; i++) {
        const kr = mualemVanGenuchtenKr(i / 100, n);
        expect(kr).toBeGreaterThanOrEqual(prev);
        prev = kr;
      }
    }
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const kr = brooksCoreyKr(i / 100, 0.75);
      expect(kr).toBeGreaterThanOrEqual(prev);
      prev = kr;
    }
  });
  it('Mualem closed form matches the numerical Mualem integral', () => {
    for (const n of [1.5, 2, 2.68]) {
      const m = 1 - 1 / n;
      // Mualem (1976) with tortuosity 1/2: kr = Se^0.5 (I(Se)/I(1))^2, I(s) = int_0^s dx / h(x),
      // 1/h = (x^(-1/m) - 1)^(-1/n) up to a constant.
      const inv = (x: number) => Math.pow(Math.pow(x, -1 / m) - 1, -1 / n);
      const total = integrateTanhSinh(inv, 0, 1, { relTol: 1e-12 }).value;
      for (const se of [0.3, 0.5, 0.8]) {
        const part = integrateTanhSinh(inv, 0, se, { relTol: 1e-12 }).value;
        const numeric = Math.sqrt(se) * (part / total) ** 2;
        const closed = mualemVanGenuchtenKr(se, n);
        expect(Math.abs(numeric - closed) / closed).toBeLessThan(1e-4);
      }
    }
  });
  it('rejects out-of-range arguments', () => {
    expect(() => brooksCoreyKr(1.1, 0.75)).toThrow(RangeError);
    expect(() => brooksCoreyKr(0.5, 0)).toThrow(RangeError);
    expect(() => brooksCoreySe(-0.1, 0.75)).toThrow(RangeError);
    expect(() => mualemVanGenuchtenKr(0.5, 1)).toThrow(RangeError);
    expect(() => mualemVanGenuchtenSe(2, 2)).toThrow(RangeError);
  });
});

describe('unit-gradient moisture', () => {
  const vadose = { thetaS: 0.35, thetaR: 0.05, n: 2.68, Ks: 10 / 86400 };
  const lens = { thetaS: 0.35, thetaR: 0.15, n: 2, Ks: 1 / 86400 };
  const q = 0.2 / 365 / 86400; // 20 cm/yr in m/s
  it('Table R-7 vadose soil gives theta = 0.0885', () => {
    const r = unitGradientMoisture(vadose, q, 'brooksCorey1964');
    expect(Math.abs(r.theta - 0.0885)).toBeLessThan(1e-4);
    expect(r.clamped).toBe(false);
    expect(r.v).toBeCloseTo(q / r.theta, 18);
  });
  it('Table R-7 lens gives theta = 0.2031', () => {
    const r = unitGradientMoisture(lens, q, 'brooksCorey1964');
    expect(Math.abs(r.theta - 0.2031)).toBeLessThan(1e-4);
  });
  it('Mualem model gives a different, valid moisture', () => {
    const r = unitGradientMoisture(vadose, q, 'vanGenuchten1980');
    expect(r.theta).toBeGreaterThan(0.05);
    expect(r.theta).toBeLessThan(0.35);
    expect(mualemVanGenuchtenKr(r.Se, 2.68)).toBeCloseTo(q / vadose.Ks, 12);
  });
  it('q >= Ks saturates and flags the clamp', () => {
    for (const model of ['brooksCorey1964', 'vanGenuchten1980'] as const) {
      const r = unitGradientMoisture(vadose, vadose.Ks * 2, model);
      expect(r.theta).toBe(0.35);
      expect(r.Se).toBe(1);
      expect(r.clamped).toBe(true);
      expect(r.v).toBeCloseTo(vadose.Ks / 0.35, 18);
    }
  });
  it('q = 0 gives residual water and zero velocity', () => {
    const r = unitGradientMoisture(vadose, 0, 'brooksCorey1964');
    expect(r.theta).toBe(0.05);
    expect(r.v).toBe(0);
  });
  it('validates the layer and flux', () => {
    const m = 'brooksCorey1964' as const;
    expect(() => unitGradientMoisture({ ...vadose, thetaS: 0 }, q, m)).toThrow(RangeError);
    expect(() => unitGradientMoisture({ ...vadose, thetaS: 1.2 }, q, m)).toThrow(RangeError);
    expect(() => unitGradientMoisture({ ...vadose, thetaR: 0.35 }, q, m)).toThrow(RangeError);
    expect(() => unitGradientMoisture({ ...vadose, thetaR: -0.1 }, q, m)).toThrow(RangeError);
    expect(() => unitGradientMoisture({ ...vadose, n: 1 }, q, m)).toThrow(RangeError);
    expect(() => unitGradientMoisture({ ...vadose, Ks: 0 }, q, m)).toThrow(RangeError);
    expect(() => unitGradientMoisture(vadose, -1, m)).toThrow(RangeError);
    expect(() => unitGradientMoisture(vadose, NaN, m)).toThrow(RangeError);
  });
});

describe('partitioning', () => {
  const base = { F: 1e-3, rhoB: 1700, kd: 0.59e-3, theta: 0.0885, thetaA: 0.2615, H: 0.228 };
  it('equilibrium pore water matches the closed form', () => {
    const c = equilibriumPoreWater(base);
    const expected = (1e-3 * 1700) / (1700 * 0.59e-3 + 0.0885 + 0.2615 * 0.228);
    expect(c).toBeCloseTo(expected, 12);
  });
  it('validates inputs', () => {
    expect(() => equilibriumPoreWater({ ...base, F: -1 })).toThrow(RangeError);
    expect(() => equilibriumPoreWater({ ...base, rhoB: 0 })).toThrow(RangeError);
    expect(() => equilibriumPoreWater({ ...base, kd: -1 })).toThrow(RangeError);
    expect(() => equilibriumPoreWater({ ...base, H: -1 })).toThrow(RangeError);
    expect(() => equilibriumPoreWater({ ...base, theta: 0, kd: 0, H: 0 })).toThrow(RangeError);
    expect(() => equilibriumPoreWater({ ...base, F: NaN })).toThrow(RangeError);
  });
  it('Raoult effective solubility', () => {
    expect(effectiveSolubility(1.75, 0.128)).toBeCloseTo(0.224, 12);
    expect(() => effectiveSolubility(1.75, 1.5)).toThrow(RangeError);
    expect(() => effectiveSolubility(0, 0.5)).toThrow(RangeError);
  });
  it('residual-phase test without TPH uses x = 1', () => {
    const r = residualPhaseTest({ F: 1e-3, M: 0.078, S: 1.75, ceq: 5 });
    expect(r.x).toBe(1);
    expect(r.residual).toBe(true);
    expect(r.cs0).toBe(1.75);
    const d = residualPhaseTest({ F: 1e-3, M: 0.078, S: 1.75, ceq: 0.5 });
    expect(d.residual).toBe(false);
    expect(d.cs0).toBe(0.5);
  });
  it('residual-phase test with TPH uses the mole fraction', () => {
    const r = residualPhaseTest({ F: 1e-3, M: 0.078, S: 1.75, ceq: 10, FT: 1e-2, MT: 0.1 });
    expect(r.x).toBeCloseTo(1e-3 / 0.078 / (1e-2 / 0.1), 14);
    expect(r.effS).toBeCloseTo(r.x * 1.75, 14);
    expect(r.residual).toBe(true);
    expect(r.cs0).toBe(r.effS);
    expect(r.tphRatio).toBeCloseTo(0.1, 14);
  });
  it('a mole fraction above 1 (F/M above FT/MT) is a RangeError, never reported', () => {
    expect(() =>
      residualPhaseTest({ F: 5e-3, M: 0.078, S: 1.75, ceq: 10, FT: 5e-3, MT: 0.2 }),
    ).toThrow(RangeError);
    const edge = residualPhaseTest({ F: 5e-3, M: 0.2, S: 1.75, ceq: 10, FT: 5e-3, MT: 0.2 });
    expect(edge.x).toBeCloseTo(1, 12);
  });
  it('zero water content (q = 0 with thetaR = 0) is a RangeError, not NaN', () => {
    const dry = { thetaS: 0.4, thetaR: 0, n: 1.5, Ks: 1e-6 };
    expect(() => unitGradientMoisture(dry, 0, 'brooksCorey1964')).toThrow(RangeError);
    expect(() => unitGradientMoisture(dry, 0, 'vanGenuchten1980')).toThrow(RangeError);
  });
  it('F greater than FT is a RangeError', () => {
    expect(() =>
      residualPhaseTest({ F: 2e-2, M: 0.078, S: 1.75, ceq: 1, FT: 1e-2, MT: 0.1 }),
    ).toThrow(RangeError);
    expect(() => residualPhaseTest({ F: 1e-3, M: 0, S: 1.75, ceq: 1 })).toThrow(RangeError);
    expect(() => residualPhaseTest({ F: 1e-3, M: 0.078, S: 0, ceq: 1 })).toThrow(RangeError);
  });
});

describe('effective diffusion', () => {
  const chem = { Da: 8.8e-6, Dw: 9.8e-10, H: 0.228 };
  it('dry limit is Da thetaS^(4/3)', () => {
    const d = millingtonQuirkDeff({ thetaS: 0.35, theta: 0 }, chem);
    expect(d / (chem.Da * Math.pow(0.35, 4 / 3))).toBeCloseTo(1, 12);
  });
  it('saturated limit is (Dw/H) thetaS^(4/3)', () => {
    const d = millingtonQuirkDeff({ thetaS: 0.35, theta: 0.35 }, chem);
    expect(d / ((chem.Dw / chem.H) * Math.pow(0.35, 4 / 3))).toBeCloseTo(1, 12);
  });
  it('water term vanishes at theta = 0 even with H = 0 handled', () => {
    expect(millingtonQuirkDeff({ thetaS: 0.35, theta: 0 }, { ...chem, H: 0.5 })).toBeGreaterThan(0);
  });
  it('validates', () => {
    expect(() => millingtonQuirkDeff({ thetaS: 0.35, theta: 0.4 }, chem)).toThrow(RangeError);
    expect(() => millingtonQuirkDeff({ thetaS: 0.35, theta: -0.1 }, chem)).toThrow(RangeError);
    expect(() => millingtonQuirkDeff({ thetaS: 0.35, theta: 0.1 }, { ...chem, H: 0 })).toThrow(
      RangeError,
    );
    expect(() => millingtonQuirkDeff({ thetaS: 0.35, theta: 0.1 }, { ...chem, Da: -1 })).toThrow(
      RangeError,
    );
  });
  it('series of two identical layers equals one', () => {
    const one = seriesDeff([{ h: 4, deff: 3e-7 }]);
    const two = seriesDeff([
      { h: 1.5, deff: 3e-7 },
      { h: 2.5, deff: 3e-7 },
    ]);
    expect(one).toBeCloseTo(3e-7, 20);
    expect(Math.abs(two - one) / one).toBeLessThan(1e-14);
  });
  it('series is the harmonic thickness-weighted mean', () => {
    const d = seriesDeff([
      { h: 3.8, deff: 4e-7 },
      { h: 0.2, deff: 1e-7 },
    ]);
    expect(d).toBeCloseTo(4 / (3.8 / 4e-7 + 0.2 / 1e-7), 18);
  });
  it('validates layers', () => {
    expect(() => seriesDeff([])).toThrow(RangeError);
    expect(() => seriesDeff([{ h: 0, deff: 1 }])).toThrow(RangeError);
    expect(() => seriesDeff([{ h: 1, deff: 0 }])).toThrow(RangeError);
  });
});
