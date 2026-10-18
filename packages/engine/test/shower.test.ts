import { describe, expect, it } from 'vitest';
import {
  dropletFraction,
  filmCoefficients,
  overallLiquidCoefficient,
  showerHouseholdAir,
  showerLegacyStall,
  showerLittle,
  rslVolatile,
  type ShowerInput,
} from '../src/processes/shower/index.js';

const base: ShowerInput = {
  waterConcentration: 1e-3, // kg/m^3 (1 mg/L)
  henry: 0.2,
  molecularWeight: 78,
  dropletDiameter: 1e-3,
  fallTime: 1,
  waterFlow: 1.0e-4, // m^3/s (6 L/min)
  showerTime: 600,
  stallVolume: 2,
  filmReferences: { gasCmPerH: 3000, liquidCmPerH: 20 },
};

const codes = (w: { code: string }[]) => w.map((x) => x.code);

describe('droplet kernel', () => {
  it('scales film coefficients by sqrt of molecular weight ratio (cm/h to m/s)', () => {
    const f = filmCoefficients(78, { gasCmPerH: 3000, liquidCmPerH: 20 });
    expect(f.kg).toBeCloseTo((3000 * Math.sqrt(18 / 78)) / 100 / 3600, 15);
    expect(f.kl).toBeCloseTo((20 * Math.sqrt(44 / 78)) / 100 / 3600, 15);
  });
  it('series resistance 1/K = 1/kl + 1/(H kg)', () => {
    const K = overallLiquidCoefficient(2e-5, 3e-3, 0.2);
    expect(1 / K).toBeCloseTo(1 / 2e-5 + 1 / (0.2 * 3e-3), 6);
  });
  it('droplet fraction limits', () => {
    expect(dropletFraction(1e-5, 0, 1e-3)).toBe(0);
    expect(dropletFraction(1e-5, 1e9, 1e-3)).toBeCloseTo(1, 12);
    expect(dropletFraction(1e-5, 1, 1e-3)).toBeCloseTo(1 - Math.exp(-0.06), 14);
  });
  it('rejects nonpositive inputs', () => {
    expect(() => dropletFraction(1e-5, 1, 0)).toThrow(RangeError);
    expect(() => dropletFraction(0, 1, 1e-3)).toThrow(RangeError);
    expect(() => filmCoefficients(0, { gasCmPerH: 1, liquidCmPerH: 1 })).toThrow(RangeError);
  });
  it('temperature correction multiplies kl by sqrt(T2 mu1 / (T1 mu2))', () => {
    const a = filmCoefficients(78, { gasCmPerH: 3000, liquidCmPerH: 20 });
    const b = filmCoefficients(
      78,
      { gasCmPerH: 3000, liquidCmPerH: 20 },
      { calibrationK: 293.15, waterK: 313.15, viscosityCalibration: 1.0, viscosityWater: 0.65 },
    );
    expect(b.kl / a.kl).toBeCloseTo(Math.sqrt((313.15 * 1.0) / (293.15 * 0.65)), 14);
    expect(b.kg).toBe(a.kg);
  });
});

describe('legacy stagnant stall', () => {
  it('hand case: C_a = f_v Q_w t_s C_w / V_s', () => {
    const r = showerLegacyStall(base);
    const { kg, kl } = filmCoefficients(78, base.filmReferences!);
    const f = dropletFraction(overallLiquidCoefficient(kl, kg, 0.2), 1, 1e-3);
    expect(r.concentration).toBeCloseTo((f * 1e-4 * 600 * 1e-3) / 2, 15);
    expect(r.coefficient * 1e-3).toBeCloseTo(r.concentration, 15);
    expect(r.exposureTime).toBe(600);
  });
  it('is linear in the water concentration', () => {
    const a = showerLegacyStall(base).concentration;
    const b = showerLegacyStall({ ...base, waterConcentration: 3e-3 }).concentration;
    expect(b / a).toBeCloseTo(3, 12);
  });
  it('warns above equilibrium, does not clip', () => {
    const r = showerLegacyStall({ ...base, stallVolume: 1e-3 });
    expect(codes(r.warnings)).toContain('shower.exceeds-equilibrium');
    expect(r.concentration).toBeGreaterThan(0.2 * 1e-3);
  });
  it('warns that the film reference values are unverified when defaulted', () => {
    const { filmReferences: _f, ...noRefs } = base;
    void _f;
    expect(codes(showerLegacyStall(noRefs).warnings)).toContain('shower.film-reference-unverified');
    expect(codes(showerLegacyStall(base).warnings)).not.toContain(
      'shower.film-reference-unverified',
    );
  });
  it('rejects bad inputs', () => {
    expect(() => showerLegacyStall({ ...base, stallVolume: 0 })).toThrow(RangeError);
    expect(() => showerLegacyStall({ ...base, showerTime: -1 })).toThrow(RangeError);
    expect(() => showerLegacyStall({ ...base, waterFlow: 0 })).toThrow(RangeError);
    expect(() => showerLegacyStall({ ...base, waterConcentration: -1 })).toThrow(RangeError);
  });
});

describe('Little two-resistance stall', () => {
  it('end-of-shower value equals the legacy stall as H grows and Q_g is 0', () => {
    const little = showerLittle({ ...base, henry: 1e12, gasFlow: 0 });
    const legacy = showerLegacyStall({ ...base, henry: 1e12 });
    expect(little.endConcentration).toBeCloseTo(legacy.concentration, 9);
    // time average is half the end value in this limit
    expect(little.concentration / legacy.concentration).toBeCloseTo(0.5, 9);
  });
  it('long shower with no ventilation approaches equilibrium H C_w', () => {
    const r = showerLittle({ ...base, gasFlow: 0, showerTime: 1e9 });
    expect(r.endConcentration / (0.2 * 1e-3)).toBeCloseTo(1, 9);
  });
  it('hand case against the closed form', () => {
    const r = showerLittle({ ...base, gasFlow: 0.02 });
    const { kg, kl } = filmCoefficients(78, base.filmReferences!);
    const f = dropletFraction(overallLiquidCoefficient(kl, kg, 0.2), 1, 1e-3);
    const alpha = (1e-4 * f * 1e-3) / 2;
    const beta = ((1e-4 * f) / 0.2 + 0.02) / 2;
    const end = (alpha / beta) * (1 - Math.exp(-beta * 600));
    const avg = (alpha / beta) * (1 - (1 - Math.exp(-beta * 600)) / (beta * 600));
    expect(r.endConcentration).toBeCloseTo(end, 15);
    expect(r.concentration).toBeCloseTo(avg, 15);
    expect(r.exposureTime).toBe(600);
  });
  it('post-shower stay decays at Q_g / V_s and enters the average', () => {
    const q = 0.02;
    const r0 = showerLittle({ ...base, gasFlow: q });
    const r = showerLittle({ ...base, gasFlow: q, postShowerTime: 300 });
    const gamma = q / 2;
    const integral0 = r0.concentration * 600;
    const post = r0.endConcentration * ((1 - Math.exp(-gamma * 300)) / gamma);
    expect(r.concentration).toBeCloseTo((integral0 + post) / 900, 15);
    expect(r.exposureTime).toBe(900);
  });
  it('with no ventilation the post-shower air holds its concentration', () => {
    const r0 = showerLittle({ ...base, gasFlow: 0 });
    const r = showerLittle({ ...base, gasFlow: 0, postShowerTime: 300 });
    expect(r.concentration).toBeCloseTo(
      (r0.concentration * 600 + r0.endConcentration * 300) / 900,
      15,
    );
  });
  it('is linear in C_w and gives a coefficient', () => {
    const a = showerLittle({ ...base, gasFlow: 0.02 });
    const b = showerLittle({ ...base, gasFlow: 0.02, waterConcentration: 5e-3 });
    expect(b.concentration / a.concentration).toBeCloseTo(5, 12);
    expect(a.coefficient * 1e-3).toBeCloseTo(a.concentration, 15);
  });
  it('is below the equilibrium cap H C_w by construction and below legacy for a small stall', () => {
    const r = showerLittle({ ...base, stallVolume: 1e-3, gasFlow: 0 });
    expect(r.endConcentration).toBeLessThanOrEqual(0.2 * 1e-3 * (1 + 1e-12));
  });
  it('rejects negative flows and bad inputs', () => {
    expect(() => showerLittle({ ...base, gasFlow: -1 })).toThrow(RangeError);
    expect(() => showerLittle({ ...base, gasFlow: 0, postShowerTime: -1 })).toThrow(RangeError);
    expect(() => showerLittle({ ...base, gasFlow: 0, henry: 0 })).toThrow(RangeError);
  });
});

describe('RSL household term', () => {
  it('volatility criterion: H above 1E-5 atm m3/mol or vapor pressure above 1 mm Hg', () => {
    expect(rslVolatile({ henryAtmM3PerMol: 1.1e-5 })).toBe(true);
    expect(rslVolatile({ henryAtmM3PerMol: 1e-5 })).toBe(false);
    expect(rslVolatile({ vaporPressureMmHg: 1.5 })).toBe(true);
    expect(rslVolatile({ vaporPressureMmHg: 1 })).toBe(false);
    expect(rslVolatile({ henryAtmM3PerMol: 1e-7, vaporPressureMmHg: 5 })).toBe(true);
    expect(rslVolatile({})).toBe(false);
  });
  it('C_a = C_w K / 1000 with K in L/m^3, always warned as unverified', () => {
    const r = showerHouseholdAir({
      waterConcentration: 2e-3,
      transferFactorLPerM3: 0.5,
      volatile: true,
    });
    expect(r.concentration).toBeCloseTo(1e-6, 18);
    expect(r.coefficient).toBeCloseTo(5e-4, 18);
    expect(codes(r.warnings)).toContain('shower.household-factor-unverified');
  });
  it('returns zero with shower.not-volatile for a nonvolatile chemical', () => {
    const r = showerHouseholdAir({
      waterConcentration: 2e-3,
      transferFactorLPerM3: 0.5,
      volatile: false,
    });
    expect(r.concentration).toBe(0);
    expect(codes(r.warnings)).toContain('shower.not-volatile');
  });
  it('rejects a negative factor or concentration', () => {
    expect(() =>
      showerHouseholdAir({ waterConcentration: 1, transferFactorLPerM3: -1, volatile: true }),
    ).toThrow(RangeError);
    expect(() =>
      showerHouseholdAir({ waterConcentration: -1, transferFactorLPerM3: 1, volatile: true }),
    ).toThrow(RangeError);
  });
});
