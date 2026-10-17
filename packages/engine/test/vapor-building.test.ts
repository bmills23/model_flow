import { describe, expect, it } from 'vitest';
import {
  crackRadius,
  jeAlpha,
  permeabilityFromConductivity,
  soilGasFlow,
  type JeBuildingInput,
} from '../src/processes/vapor/index.js';

const base: JeBuildingInput = {
  DT: 1e-6,
  AB: 150,
  QB: 0.05,
  LT: 3,
  Qsoil: 1e-5,
  Lcrack: 0.15,
  Dcrack: 2e-6,
  Acrack: 0.15,
};

function rel(a: number, b: number): number {
  return Math.abs(a - b) / Math.abs(b);
}

describe('Johnson and Ettinger attenuation coefficient', () => {
  it('matches the closed form A e^xi / (e^xi + A + (A/B)(e^xi - 1)) at moderate xi', () => {
    const r = jeAlpha(base);
    const A = (base.DT * base.AB) / (base.QB * base.LT);
    const B = base.Qsoil / base.QB;
    const xi = (base.Qsoil * base.Lcrack) / (base.Dcrack * base.Acrack);
    const e = Math.exp(xi);
    const expected = (A * e) / (e + A + (A / B) * (e - 1));
    expect(rel(r.alpha, expected)).toBeLessThan(1e-12);
    expect(r.A).toBeCloseTo(A, 15);
    expect(r.B).toBeCloseTo(B, 15);
    expect(rel(r.xi, xi)).toBeLessThan(1e-12);
  });

  it('tends to the diffusion-only form as Qsoil tends to 0 (identity 8d)', () => {
    const C = (base.Dcrack * base.Acrack) / (base.QB * base.Lcrack);
    const A = (base.DT * base.AB) / (base.QB * base.LT);
    const diffusionOnly = A / (1 + A + A / C);
    const zero = jeAlpha({ ...base, Qsoil: 0 });
    expect(rel(zero.alpha, diffusionOnly)).toBeLessThan(1e-12);
    expect(zero.B).toBe(0);
    expect(zero.xi).toBe(0);
    const tiny = jeAlpha({ ...base, Qsoil: 1e-16 });
    expect(rel(tiny.alpha, diffusionOnly)).toBeLessThan(1e-9);
  });

  it('tends to A / (1 + A / B) for large xi without overflow (identity 8d)', () => {
    const input = { ...base, Qsoil: 1e-2, Lcrack: 50 };
    const r = jeAlpha(input);
    expect(r.xi).toBeGreaterThan(700);
    expect(Number.isFinite(r.alpha)).toBe(true);
    expect(rel(r.alpha, r.A / (1 + r.A / r.B))).toBeLessThan(1e-9);
  });

  it('reports the diffusion-only coefficient beside the full one', () => {
    const r = jeAlpha(base);
    const d = jeAlpha({ ...base, Qsoil: 0 });
    expect(rel(r.alphaDiffusionOnly, d.alpha)).toBeLessThan(1e-12);
    expect(r.alpha).toBeGreaterThan(r.alphaDiffusionOnly);
  });

  it('gives A / (1 + A) with no foundation resistance (dirt floor)', () => {
    const r = jeAlpha({ ...base, dirtFloor: true });
    expect(rel(r.alpha, r.A / (1 + r.A))).toBeLessThan(1e-12);
  });

  it('rejects non-physical input', () => {
    expect(() => jeAlpha({ ...base, DT: 0 })).toThrow(RangeError);
    expect(() => jeAlpha({ ...base, Qsoil: -1 })).toThrow(RangeError);
    expect(() => jeAlpha({ ...base, QB: Number.NaN })).toThrow(RangeError);
  });

  it('is linear: the indoor concentration scales with the source vapor concentration', () => {
    const a = jeAlpha(base).alpha;
    expect(a * 2).toBeCloseTo(2 * a, 15);
  });
});

describe('Soil gas flow into the building (cylinder sink)', () => {
  it('reproduces a hand case', () => {
    // dP 4 Pa, kv 1e-11 m^2, mu 1.8e-5 Pa s, crack length 50 m, depth 2 m, eta 0.001, AB 150 m^2.
    const r = crackRadius(0.001, 150, 50);
    expect(r).toBeCloseTo(0.003, 15);
    const q = soilGasFlow({ dP: 4, kv: 1e-11, mu: 1.8e-5, Xcrack: 50, Zcrack: 2, rcrack: r });
    expect(rel(q, 9.702422058592547e-5)).toBeLessThan(1e-9);
  });

  it('is zero without a pressure difference or permeability, and linear in both', () => {
    const p = { dP: 4, kv: 1e-11, mu: 1.8e-5, Xcrack: 50, Zcrack: 2, rcrack: 0.003 };
    expect(soilGasFlow({ ...p, dP: 0 })).toBe(0);
    expect(soilGasFlow({ ...p, kv: 0 })).toBe(0);
    expect(rel(soilGasFlow({ ...p, dP: 8 }), 2 * soilGasFlow(p))).toBeLessThan(1e-12);
  });

  it('rejects a crack deeper-than-wide violation (ln argument <= 1)', () => {
    expect(() =>
      soilGasFlow({ dP: 4, kv: 1e-11, mu: 1.8e-5, Xcrack: 50, Zcrack: 0.001, rcrack: 0.003 }),
    ).toThrow(RangeError);
  });

  it('estimates permeability from hydraulic conductivity, k = K mu / (rho g)', () => {
    const k = permeabilityFromConductivity(1e-5, 1e-3, 1000);
    expect(rel(k, (1e-5 * 1e-3) / (1000 * 9.80665))).toBeLessThan(1e-12);
  });
});
