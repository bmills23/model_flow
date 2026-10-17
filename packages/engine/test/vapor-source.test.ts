import { describe, expect, it } from 'vitest';
import {
  CAL_TO_J,
  atmToDimensionlessHenry,
  celsiusToKelvin,
  convertGcmsToPa,
  henryAtTemperature,
  vaporEnthalpyAtTemperature,
  watsonExponent,
  sourceVapor,
} from '../src/processes/vapor/index.js';
import { equilibriumPoreWater } from '../src/processes/vadose/index.js';

function rel(a: number, b: number): number {
  return Math.abs(a - b) / Math.abs(b);
}

describe('unit helpers', () => {
  it('converts the boundary units', () => {
    expect(convertGcmsToPa(10)).toBeCloseTo(1, 15);
    expect(celsiusToKelvin(10)).toBeCloseTo(283.15, 12);
    expect(CAL_TO_J).toBe(4.184);
  });
});

describe('Henry constant at the system temperature (EPA 2004 Appendix C benzene)', () => {
  const chem = { HR: 5.54e-3, dHvb: 7342, TB: 353.24, TC: 562.16 };
  const TS = celsiusToKelvin(10);

  it('picks the Watson exponent by T_B / T_C', () => {
    expect(watsonExponent(0.5)).toBe(0.3);
    expect(watsonExponent(0.6)).toBeCloseTo(0.74 * 0.6 - 0.116, 15);
    expect(watsonExponent(0.57)).toBeCloseTo(0.74 * 0.57 - 0.116, 15);
    expect(watsonExponent(0.71)).toBeCloseTo(0.74 * 0.71 - 0.116, 15);
    expect(watsonExponent(0.8)).toBe(0.41);
  });

  it('reproduces 8,122 cal/mol, 2.68e-3 atm m^3/mol and 0.115', () => {
    const dh = vaporEnthalpyAtTemperature(chem.dHvb, TS, chem.TB, chem.TC);
    expect(Math.round(dh)).toBe(8122);
    const r = henryAtTemperature({ ...chem, TS });
    expect(rel(r.dHvTS, 8121.965377387123)).toBeLessThan(1e-9);
    expect(Number(r.H.toPrecision(3))).toBe(2.68e-3);
    expect(Number(r.Hprime.toPrecision(3))).toBe(0.115);
    expect(rel(r.Hprime, 0.115342492618358)).toBeLessThan(1e-9);
  });

  it('leaves H unchanged at the reference temperature', () => {
    const r = henryAtTemperature({ ...chem, TS: 298.15 });
    expect(rel(r.H, chem.HR)).toBeLessThan(1e-12);
    expect(rel(r.Hprime, atmToDimensionlessHenry(chem.HR, 298.15))).toBeLessThan(1e-12);
  });

  it('rejects a system temperature at or above the critical temperature', () => {
    expect(() => henryAtTemperature({ ...chem, TS: 600 })).toThrow(RangeError);
  });
});

const soil = {
  F: 1e-3, // 1000 mg/kg
  rhoB: 1700,
  kd: 59e-3 * 0.01, // Koc 59 mL/g = 0.059 m^3/kg, foc 0.01
  theta: 0.15,
  thetaA: 0.2,
  H: 0.228,
  M: 0.078,
  S: 1.75,
};

describe('source vapor concentration', () => {
  it('soil below saturation: C_vs = H * equilibrium pore water', () => {
    const r = sourceVapor({ kind: 'soil', ...soil, F: 1e-5 });
    const cw = equilibriumPoreWater({ ...soil, F: 1e-5 });
    expect(rel(r.cvs, soil.H * cw)).toBeLessThan(1e-12);
    expect(r.residual).toBe(false);
    expect(r.warnings).toEqual([]);
    expect(r.poreWater).toBeCloseTo(cw, 15);
  });

  it('soil in the residual phase: C_vs = x S H and warns', () => {
    const r = sourceVapor({ kind: 'soil', ...soil, F: 3e-3 });
    expect(r.residual).toBe(true);
    expect(rel(r.cvs, 1 * soil.S * soil.H)).toBeLessThan(1e-12);
    expect(r.warnings.map((w) => w.code)).toContain('vapor.residual-phase');
  });

  it('soil with TPH: x < 1 scales the saturated source vapor (case B stays below)', () => {
    // 10 mg/kg benzene in 1000 mg/kg TPH (M_T 100 g/mol): x = (1e-5/0.078)/(1e-3/0.1) = 0.0128
    const below = sourceVapor({ kind: 'soil', ...soil, F: 1e-5, FT: 1e-3, MT: 0.1 });
    expect(below.residual).toBe(false);
    const sat = sourceVapor({ kind: 'soil', ...soil, F: 5e-4, FT: 1e-3, MT: 0.05 });
    expect(sat.residual).toBe(true);
    const x = 5e-4 / 0.078 / (1e-3 / 0.05);
    expect(rel(sat.x, x)).toBeLessThan(1e-12);
    expect(rel(sat.cvs, x * soil.S * soil.H)).toBeLessThan(1e-12);
  });

  it('reports the vapor pressure form for comparison only', () => {
    const r = sourceVapor({
      kind: 'soil',
      ...soil,
      F: 3e-3,
      vaporPressure: 12700,
      temperature: 298.15,
    });
    const R = 8.314462618;
    expect(rel(r.vaporPressureForm ?? 0, (1 * 12700 * 0.078) / (R * 298.15))).toBeLessThan(1e-9);
    // the reported source vapor is still the effective-solubility form
    expect(rel(r.cvs, soil.S * soil.H)).toBeLessThan(1e-12);
  });

  it('soil gas: C_vs is the measured concentration', () => {
    const r = sourceVapor({ kind: 'soilGas', csg: 3.2e-4 });
    expect(r.cvs).toBe(3.2e-4);
    expect(r.warnings).toEqual([]);
  });

  it('groundwater: C_vs = H C_gw', () => {
    const r = sourceVapor({ kind: 'groundwater', cgw: 1e-3, H: 0.228 });
    expect(rel(r.cvs, 0.228e-3)).toBeLessThan(1e-12);
    expect(r.warnings).toEqual([]);
  });

  it('groundwater above x S is warned, never clamped', () => {
    const r = sourceVapor({ kind: 'groundwater', cgw: 3, H: 0.228, S: 1.75 });
    expect(rel(r.cvs, 0.228 * 3)).toBeLessThan(1e-12);
    expect(r.warnings.map((w) => w.code)).toContain('vapor.source-above-solubility');
    const x = sourceVapor({ kind: 'groundwater', cgw: 1, H: 0.228, S: 1.75, x: 0.5 });
    expect(x.warnings.map((w) => w.code)).toContain('vapor.source-above-solubility');
  });

  it('is linear below saturation (identity 8h)', () => {
    const a = sourceVapor({ kind: 'soil', ...soil, F: 1e-6 }).cvs;
    const b = sourceVapor({ kind: 'soil', ...soil, F: 2e-6 }).cvs;
    expect(rel(b, 2 * a)).toBeLessThan(1e-12);
  });

  it('rejects negative concentrations', () => {
    expect(() => sourceVapor({ kind: 'soilGas', csg: -1 })).toThrow(RangeError);
    expect(() => sourceVapor({ kind: 'groundwater', cgw: -1, H: 0.2 })).toThrow(RangeError);
  });
});
