import { describe, expect, it } from 'vitest';
import { erfc } from '../src/numerics/special.js';
import {
  patchfConcentration,
  patchiConcentration,
  patchfGrid,
  patchiGrid,
  type WexlerInput,
} from '../src/processes/groundwater/index.js';

const base: WexlerInput = {
  velocity: 0.5,
  decayRate: 0.01,
  dx: 2,
  dy: 0.4,
  dz: 0.1,
  c0: 1000,
  patch: { y1: -10, y2: 10, z1: 0, z2: 4 },
};

describe('PATCHI (Wexler 1992): infinite width and depth', () => {
  it('equals the patch factor C0 on the inflow plane and zero outside the domain', () => {
    expect(patchiConcentration(base, { x: 0, y: 0, z: 2 }, 10)).toBeCloseTo(1000, 9);
    expect(patchiConcentration(base, { x: 0, y: 20, z: 2 }, 10)).toBe(0);
    expect(patchiConcentration(base, { x: -1, y: 0, z: 2 }, 10)).toBe(0);
  });

  it('is symmetric about the patch centreline', () => {
    const a = patchiConcentration(base, { x: 8, y: 3.7, z: 1 }, 60);
    const b = patchiConcentration(base, { x: 8, y: -3.7, z: 1 }, 60);
    expect(a).toBeCloseTo(b, 10);
    const c = patchiConcentration(base, { x: 8, y: 0, z: 0.9 }, 60);
    const d = patchiConcentration(base, { x: 8, y: 0, z: 3.1 }, 60);
    expect(c).toBeCloseTo(d, 10);
  });

  it('reduces to the 1-D first-type solution for a very large patch', () => {
    const big: WexlerInput = { ...base, patch: { y1: -1e5, y2: 1e5, z1: -1e5, z2: 1e5 } };
    const u = 0.5;
    const D = 2;
    const k = 0.01;
    const beta = Math.sqrt(u * u + 4 * D * k);
    const x = 12;
    const t = 90;
    const rt = 2 * Math.sqrt(D * t);
    const half =
      0.5 *
      (Math.exp((x * (u - beta)) / (2 * D)) * erfc((x - beta * t) / rt) +
        Math.exp((x * (u + beta)) / (2 * D)) * erfc((x + beta * t) / rt));
    expect(patchiConcentration(big, { x, y: 0, z: 0 }, t) / (1000 * half)).toBeCloseTo(1, 8);
  });

  it('steady state (infinite time) is the limit of the transient solution', () => {
    const s = patchiConcentration(base, { x: 6, y: 2, z: 2 }, Infinity);
    const t = patchiConcentration(base, { x: 6, y: 2, z: 2 }, 5000);
    expect(t / s).toBeCloseTo(1, 7);
  });

  it('applies retardation by scaling velocity and dispersion', () => {
    const r2 = patchiConcentration({ ...base, retardation: 2 }, { x: 6, y: 2, z: 2 }, 100);
    const scaled = patchiConcentration(
      { ...base, velocity: 0.25, dx: 1, dy: 0.2, dz: 0.05 },
      { x: 6, y: 2, z: 2 },
      100,
    );
    expect(r2).toBeCloseTo(scaled, 10);
  });
});

describe('PATCHF (Wexler 1992): finite width and thickness', () => {
  const finite: WexlerInput = { ...base, patch: { y1: 20, y2: 40, z1: 2, z2: 6 } };
  it('converges to PATCHI as width and thickness grow', () => {
    // centred patch: shift coordinates so the same patch sits in the middle of a huge aquifer
    const W = 20000;
    const H = 20000;
    const shift = { y: W / 2 - 0, z: H / 2 };
    const wide: WexlerInput = {
      ...base,
      patch: { y1: -10 + shift.y, y2: 10 + shift.y, z1: 0 + shift.z, z2: 4 + shift.z },
    };
    for (const pt of [
      { x: 8, y: 3, z: 1 },
      { x: 20, y: 12, z: 3.5 },
    ]) {
      const fin = patchfConcentration(
        wide,
        { x: pt.x, y: pt.y + shift.y, z: pt.z + shift.z },
        150,
        { width: W, thickness: H },
      );
      const inf = patchiConcentration(base, pt, 150);
      expect(fin.value / inf).toBeCloseTo(1, 5);
    }
  });

  it('conserves symmetry about the aquifer mid-plane for a centred patch', () => {
    const sym: WexlerInput = { ...base, patch: { y1: 20, y2: 40, z1: 3, z2: 7 } };
    const a = patchfConcentration(sym, { x: 10, y: 25, z: 4 }, 100, { width: 60, thickness: 10 });
    const b = patchfConcentration(sym, { x: 10, y: 35, z: 6 }, 100, { width: 60, thickness: 10 });
    expect(a.value).toBeCloseTo(b.value, 9);
  });

  it('series and time-integral formulations agree', () => {
    const p = { x: 10, y: 33, z: 7 };
    const s = patchfConcentration(finite, p, 120, { width: 60, thickness: 10, method: 'series' });
    const q = patchfConcentration(finite, p, 120, { width: 60, thickness: 10, method: 'integral' });
    expect(s.converged).toBe(true);
    expect(s.value / q.value).toBeCloseTo(1, 6);
  });

  it('falls back to the integral formulation next to the inflow plane', () => {
    const r = patchfConcentration(finite, { x: 0.05, y: 30, z: 4 }, 120, {
      width: 60,
      thickness: 10,
    });
    expect(r.converged).toBe(true);
    expect(r.value).toBeGreaterThan(900);
    expect(r.value).toBeLessThanOrEqual(1000.0001);
  });

  it('steady state is the limit of the transient solution', () => {
    const p = { x: 10, y: 33, z: 7 };
    const s = patchfConcentration(finite, p, Infinity, { width: 60, thickness: 10 }).value;
    const t = patchfConcentration(finite, p, 20000, { width: 60, thickness: 10 }).value;
    expect(t / s).toBeCloseTo(1, 8);
  });
});

describe('plan-view grids and timing', () => {
  const log = (s: string) =>
    (globalThis as unknown as { console: { info(s: string): void } }).console.info(s);
  const xs = Array.from({ length: 100 }, (_, i) => i * 0.8);
  const ys = Array.from({ length: 60 }, (_, j) => -20 + j * 0.7);

  it('PATCHI grid agrees with the adaptive point solution and runs in well under a second', () => {
    const start = Date.now();
    const grid = patchiGrid(base, xs, ys, 2, 150);
    const ms = Date.now() - start;
    log(`PATCHI 100x60 plan-view grid: ${ms} ms`);
    expect(ms).toBeLessThan(1000);
    for (const [i, j] of [
      [0, 20],
      [5, 30],
      [25, 10],
      [60, 40],
      [99, 30],
    ] as const) {
      const ref = patchiConcentration(base, { x: xs[i]!, y: ys[j]!, z: 2 }, 150);
      expect(Math.abs(grid[i]![j]! - ref)).toBeLessThanOrEqual(1e-8 + 2e-5 * Math.abs(ref));
    }
  });

  it('PATCHF grid agrees with the series solution and runs in well under a second', () => {
    const finite: WexlerInput = { ...base, patch: { y1: 20, y2: 40, z1: 2, z2: 6 } };
    const xf = xs.map((x) => x + 0.5);
    const yf = Array.from({ length: 60 }, (_, j) => j);
    const start = Date.now();
    const grid = patchfGrid(finite, xf, yf, 4, 150, { width: 60, thickness: 10 });
    const ms = Date.now() - start;
    log(`PATCHF 100x60 plan-view grid: ${ms} ms`);
    expect(ms).toBeLessThan(1000);
    for (const [i, j] of [
      [0, 30],
      [10, 25],
      [40, 5],
      [99, 55],
    ] as const) {
      const ref = patchfConcentration(finite, { x: xf[i]!, y: yf[j]!, z: 4 }, 150, {
        width: 60,
        thickness: 10,
      }).value;
      expect(Math.abs(grid[i]![j]! - ref)).toBeLessThanOrEqual(1e-8 + 2e-5 * Math.abs(ref));
    }
  });
});
