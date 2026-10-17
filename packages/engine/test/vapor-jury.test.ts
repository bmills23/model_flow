import { describe, expect, it } from 'vitest';
import {
  juryAverageFlux,
  juryCumulativeEmission,
  juryFlux,
  juryProfile,
  juryRemainingMass,
  juryRun,
  juryTransport,
  vaporJuryBam,
  type JuryInput,
} from '../src/processes/vapor/index.js';
import { references } from '../src/references/index.js';
import { erfc } from '../src/numerics/special.js';

const DAY = 86400;
const base: JuryInput = {
  chemical: { Da: 8.7e-6, Dw: 9.8e-10, H: 0.22 },
  soil: { porosity: 0.434, moisture: 0.15, bulkDensity: 1500, kd: 3.42e-4 },
  layerThickness: Infinity,
  initialConcentration: 1.5, // kg per m^3 of soil
};

function rel(a: number, ref: number): number {
  return Math.abs(a - ref) / Math.abs(ref);
}

/**
 * Independent finite-volume solution of the governing equation
 *   dC/dt = D_E d2C/dz2 - mu C,  dC/dz = k C at z = 0,  no flux at depth Z
 * for the gas concentration, Crank-Nicolson after two implicit Euler starting steps (Rannacher), on a
 * uniform grid whose faces fall on the layer edges. Returns the surface flux h C_s at the end time.
 */
function finiteDifferenceFlux(input: JuryInput, tEnd: number, nSteps: number, dz: number): number {
  const { Rg, DE, hb, k } = juryTransport(input);
  const a = input.coverThickness ?? 0;
  const L = input.layerThickness;
  const mu = input.decayRate ?? 0;
  const Z = a + L + 10 * Math.sqrt(DE * tEnd);
  const n = Math.ceil(Z / dz);
  const c = new Float64Array(n);
  const c0 = input.initialConcentration / Rg;
  for (let i = 0; i < n; i++) {
    const zl = i * dz;
    const zr = zl + dz;
    const overlap = Math.max(0, Math.min(zr, a + L) - Math.max(zl, a));
    c[i] = (c0 * overlap) / dz;
  }
  const r = DE / (dz * dz);
  // surface cell: loss through half cell plus boundary layer
  const surf = hb === Infinity ? (2 * DE) / (dz * dz) : (DE * k) / (dz * (1 + (k * dz) / 2));
  const step = (dt: number, theta: number): void => {
    const lower = new Float64Array(n);
    const diag = new Float64Array(n);
    const upper = new Float64Array(n);
    const rhs = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const left = i === 0 ? surf : r;
      const right = i === n - 1 ? 0 : r;
      const diagOp = -(left + right) - mu; // operator diagonal
      const lo = i === 0 ? 0 : r;
      const up = i === n - 1 ? 0 : r;
      let explicit = diagOp * (c[i] as number);
      if (i > 0) explicit += lo * (c[i - 1] as number);
      if (i < n - 1) explicit += up * (c[i + 1] as number);
      rhs[i] = (c[i] as number) + dt * (1 - theta) * explicit;
      diag[i] = 1 - dt * theta * diagOp;
      lower[i] = -dt * theta * lo;
      upper[i] = -dt * theta * up;
    }
    // Thomas algorithm
    for (let i = 1; i < n; i++) {
      const w = (lower[i] as number) / (diag[i - 1] as number);
      diag[i] = (diag[i] as number) - w * (upper[i - 1] as number);
      rhs[i] = (rhs[i] as number) - w * (rhs[i - 1] as number);
    }
    c[n - 1] = (rhs[n - 1] as number) / (diag[n - 1] as number);
    for (let i = n - 2; i >= 0; i--) {
      c[i] =
        ((rhs[i] as number) - (upper[i] as number) * (c[i + 1] as number)) / (diag[i] as number);
    }
  };
  const dt = tEnd / nSteps;
  step(dt / 2, 1);
  step(dt / 2, 1);
  for (let s = 1; s < nSteps; s++) step(dt, 0.5);
  const surfaceFlux = (DE * Rg * ((c[0] as number) * 2)) / dz; // Dg * C_1 / (dz / 2) for Dirichlet
  if (hb === Infinity) return surfaceFlux;
  const Cs = (c[0] as number) / (1 + (k * dz) / 2);
  return hb * Cs;
}

describe('Jury volatilization: closed form identities', () => {
  const { DE } = juryTransport(base);

  it('no boundary layer, no cover, infinite layer: J = C_T0 (D_E / (pi t))^(1/2)', () => {
    for (const t of [DAY, 30 * DAY, 3650 * DAY]) {
      const ref = base.initialConcentration * Math.sqrt(DE / (Math.PI * t));
      expect(rel(juryFlux(base, t), ref)).toBeLessThan(1e-12);
    }
  });

  it('average flux over T equals 2 C_T0 (D_E / (pi T))^(1/2) (the SSG average)', () => {
    const T = 9.5e8;
    const ref = 2 * base.initialConcentration * Math.sqrt(DE / (Math.PI * T));
    expect(rel(juryAverageFlux(base, T), ref)).toBeLessThan(1e-9);
  });

  it('a boundary layer lowers the flux and approaches the Dirichlet limit as it thins', () => {
    const t = 100 * DAY;
    const free = juryFlux(base, t);
    const thick = juryFlux({ ...base, boundaryLayerThickness: 0.05 }, t);
    const thin = juryFlux({ ...base, boundaryLayerThickness: 1e-9 }, t);
    expect(thick).toBeLessThan(free);
    expect(rel(thin, free)).toBeLessThan(1e-6);
  });

  it('is linear in the source and decays as exp(-mu t)', () => {
    const t = 50 * DAY;
    const mu = 0.01 / DAY;
    const j1 = juryFlux({ ...base, boundaryLayerThickness: 0.01, layerThickness: 1 }, t);
    const j2 = juryFlux(
      { ...base, boundaryLayerThickness: 0.01, layerThickness: 1, initialConcentration: 3 },
      t,
    );
    expect(rel(j2, 2 * j1)).toBeLessThan(1e-12);
    const jd = juryFlux(
      { ...base, boundaryLayerThickness: 0.01, layerThickness: 1, decayRate: mu },
      t,
    );
    expect(rel(jd, j1 * Math.exp(-mu * t))).toBeLessThan(1e-12);
  });

  it('reproduces the published reduced solution (SSG Appendix C Equation 1 and Mayer Equation 7)', () => {
    // epa1996ssg Appendix C, Equation 1: Js = C0 exp(-mu t) (D_E / (pi t))^(1/2) [1 - exp(-L^2 / 4 D_E t)]
    const L = 0.6;
    const mu = 0.002 / DAY;
    for (const t of [10 * DAY, 200 * DAY, 2000 * DAY]) {
      const ref =
        base.initialConcentration *
        Math.exp(-mu * t) *
        Math.sqrt(DE / (Math.PI * t)) *
        (1 - Math.exp(-(L * L) / (4 * DE * t)));
      expect(rel(juryFlux({ ...base, layerThickness: L, decayRate: mu }, t), ref)).toBeLessThan(
        1e-12,
      );
    }
  });

  it('matches the published Jury et al. (1983) flux, Equation 9 of SSG Appendix C, at zero water flux', () => {
    // J = C0 H_E exp(H_E^2 t / D_E) [erfc(H_E t / (D_E t)^(1/2)) - exp(H_E L / D_E) erfc(L / 2 (D_E t)^(1/2)
    //     + H_E t / (D_E t)^(1/2))], H_E = h / R_g; the printed expression carries the opposite sign
    //     because that document measures depth downward and the flux into the soil.
    // thick layer so that the published exponentials do not overflow in plain floating point
    const d = 20;
    const L = 0.5;
    const input: JuryInput = { ...base, boundaryLayerThickness: d, layerThickness: L };
    const { Rg, hb } = juryTransport(input);
    const HE = hb / Rg;
    for (const t of [5 * DAY, 120 * DAY, 1500 * DAY]) {
      const s = Math.sqrt(DE * t);
      const x0 = (HE * t) / s;
      const printed =
        input.initialConcentration *
        HE *
        Math.exp((HE * HE * t) / DE) *
        (erfc(x0) - Math.exp((HE * L) / DE) * erfc(L / (2 * s) + x0));
      expect(rel(juryFlux(input, t), printed)).toBeLessThan(1e-9);
    }
  });
});

describe('Jury volatilization: independent numerical solution', () => {
  const cases: Array<{ name: string; input: JuryInput; t: number }> = [
    {
      name: 'cover, finite layer, boundary layer, decay',
      input: {
        ...base,
        coverThickness: 0.2,
        layerThickness: 0.6,
        boundaryLayerThickness: 0.005,
        decayRate: 0.003 / DAY,
      },
      t: 10 * DAY,
    },
    {
      name: 'no cover, finite layer, no boundary layer',
      input: { ...base, layerThickness: 0.5 },
      t: 3 * DAY,
    },
    {
      name: 'low Henry constant, thick boundary layer',
      input: {
        ...base,
        chemical: { Da: 5e-6, Dw: 8e-10, H: 2e-4 },
        coverThickness: 0.1,
        layerThickness: 1,
        boundaryLayerThickness: 0.02,
      },
      t: 365 * DAY,
    },
  ];
  for (const c of cases) {
    it(`agrees with a Crank-Nicolson finite-volume solution: ${c.name}`, () => {
      const closed = juryFlux(c.input, c.t);
      const fd = finiteDifferenceFlux(c.input, c.t, 800, 2e-3);
      expect(rel(fd, closed)).toBeLessThan(2e-4);
    });
  }
});

describe('Jury volatilization: mass balance (identity 8f)', () => {
  it('cumulative emission plus remaining mass equals the initial mass with mu = 0', () => {
    const input: JuryInput = {
      ...base,
      coverThickness: 0.15,
      layerThickness: 0.5,
      boundaryLayerThickness: 0.01,
    };
    const { Rg } = juryTransport(input);
    const initial = Rg * (input.initialConcentration / Rg) * 0.5;
    for (const t of [2 * DAY, 15 * DAY]) {
      const total = juryCumulativeEmission(input, t) + juryRemainingMass(input, t);
      expect(rel(total, initial)).toBeLessThan(1e-6);
    }
  });

  it('holds with no boundary layer and the profile equals the initial layer at tiny t', () => {
    const input: JuryInput = { ...base, layerThickness: 0.4 };
    const { Rg } = juryTransport(input);
    const t = 5 * DAY;
    expect(
      rel(
        juryCumulativeEmission(input, t) + juryRemainingMass(input, t),
        0.4 * input.initialConcentration,
      ),
    ).toBeLessThan(1e-6);
    expect(rel(juryProfile(input, 1e-3, 0.2) * Rg, input.initialConcentration)).toBeLessThan(1e-9);
  });
});

describe('Jury volatilization: contract', () => {
  it('juryRun returns a flux series, a cumulative series and the no-boundary-layer warning', () => {
    const r = juryRun(base);
    expect(r.flux(DAY)).toBeGreaterThan(0);
    expect(r.cumulative(10 * DAY)).toBeGreaterThan(r.cumulative(DAY));
    expect(r.warnings.map((w) => w.code)).toContain('vapor.jury-no-boundary-layer');
    expect(
      juryRun({ ...base, boundaryLayerThickness: 0.01 }).warnings.map((w) => w.code),
    ).not.toContain('vapor.jury-no-boundary-layer');
  });

  it('rejects invalid input', () => {
    expect(() => juryFlux({ ...base, layerThickness: 0 }, DAY)).toThrow(RangeError);
    expect(() => juryFlux({ ...base, coverThickness: -1 }, DAY)).toThrow(RangeError);
    expect(() => juryFlux(base, -1)).toThrow(RangeError);
    expect(juryFlux(base, 0)).toBe(0);
  });

  it('declares citations that exist in the reference list', () => {
    const keys = new Set(references.map((r) => r.key));
    for (const key of vaporJuryBam.citations) expect(keys.has(key), key).toBe(true);
  });
});
