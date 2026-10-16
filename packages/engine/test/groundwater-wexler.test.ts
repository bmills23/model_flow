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

describe('PATCHI with a bounded z axis', () => {
  // a source box below a no-flux water table at z = 0, receptors at z <= 0
  const below: WexlerInput = { ...base, patch: { y1: -2.5, y2: 2.5, z1: -3, z2: 0 } };
  const image: WexlerInput = { ...below, patch: { y1: -2.5, y2: 2.5, z1: -3, z2: 3 } };
  const noFlux = { waterTable: 0 };

  it('a no-flux water table equals the image patch [-T, T] of the whole-space solution', () => {
    for (const z of [0, -0.5, -1.5, -3, -6]) {
      const want = patchiConcentration(image, { x: 40, y: 1, z }, 20);
      const got = patchiConcentration(below, { x: 40, y: 1, z }, 20, undefined, noFlux);
      expect(want).toBeGreaterThan(0);
      expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-12 * want);
    }
  });

  it('lies above the unbounded solution, which leaks the held concentration upward', () => {
    const open = patchiConcentration(below, { x: 40, y: 0, z: 0 }, 20);
    const closed = patchiConcentration(below, { x: 40, y: 0, z: 0 }, 20, undefined, noFlux);
    expect(open / closed).toBeLessThan(0.8);
  });

  it('reports zero above the water table and on the inflow plane outside the patch', () => {
    expect(patchiConcentration(below, { x: 40, y: 0, z: 0.5 }, 20, undefined, noFlux)).toBe(0);
    expect(patchiConcentration(below, { x: 0, y: 0, z: -1 }, 20, undefined, noFlux)).toBe(below.c0);
    expect(patchiConcentration(below, { x: 0, y: 0, z: -5 }, 20, undefined, noFlux)).toBe(0);
  });

  it('the grid at a water-table depth matches the point solution and the image patch', () => {
    const xs = [5, 30, 80];
    const ys = [-4, 0, 4];
    for (const z of [0, -1.5, -6]) {
      const grid = patchiGrid(below, xs, ys, z, 25, undefined, undefined, noFlux);
      xs.forEach((x, i) =>
        ys.forEach((y, j) => {
          const ref = patchiConcentration(image, { x, y, z }, 25);
          expect(Math.abs(grid[i]![j]! - ref)).toBeLessThanOrEqual(1e-8 + 2e-5 * Math.abs(ref));
        }),
      );
    }
    expect(patchiGrid(below, xs, ys, 0.5, 25, undefined, undefined, noFlux)[1]![1]).toBe(0);
  });

  it('rejects a patch above the water table', () => {
    expect(() =>
      patchiConcentration(base, { x: 5, y: 0, z: 1 }, 10, undefined, { waterTable: 0 }),
    ).toThrow(RangeError);
  });

  describe('a layer with no-flux top and bottom and infinite width', () => {
    const H = 6;
    const layer: WexlerInput = { ...base, patch: { y1: -2.5, y2: 2.5, z1: 2, z2: 5 } };
    // independent reference: the whole-space solution summed over the images of the patch
    const images = (p: { x: number; y: number; z: number }, t: number): number => {
      let sum = 0;
      for (let n = -8; n <= 8; n++) {
        const { z1, z2 } = layer.patch;
        for (const [a, b] of [
          [z1 + 2 * n * H, z2 + 2 * n * H],
          [-z2 + 2 * n * H, -z1 + 2 * n * H],
        ] as const) {
          sum += patchiConcentration({ ...layer, patch: { ...layer.patch, z1: a, z2: b } }, p, t);
        }
      }
      return sum;
    };

    it('equals the whole-space solution summed over the patch images', () => {
      for (const z of [0, 1.5, 3, 5.5, 6]) {
        const p = { x: 25, y: 1, z };
        const want = images(p, 40);
        const got = patchiConcentration(layer, p, 40, undefined, { thickness: H });
        expect(want).toBeGreaterThan(0);
        expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-7 * want);
      }
    });

    it('tends to the finite-width PATCHF solution as the width grows', () => {
      const W = 4000;
      const wide: WexlerInput = {
        ...layer,
        patch: { ...layer.patch, y1: layer.patch.y1 + W / 2, y2: layer.patch.y2 + W / 2 },
      };
      const want = patchfConcentration(wide, { x: 25, y: 1 + W / 2, z: 3 }, 40, {
        width: W,
        thickness: H,
        method: 'integral',
      }).value;
      const got = patchiConcentration(layer, { x: 25, y: 1, z: 3 }, 40, undefined, {
        thickness: H,
      });
      expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-8 * want);
    });

    it('the grid matches the point solution and zero outside [0, H]', () => {
      const xs = [5, 30];
      const ys = [-3, 0];
      const grid = patchiGrid(layer, xs, ys, 3, 40, undefined, undefined, { thickness: H });
      xs.forEach((x, i) =>
        ys.forEach((y, j) => {
          const ref = patchiConcentration(layer, { x, y, z: 3 }, 40, undefined, { thickness: H });
          expect(Math.abs(grid[i]![j]! - ref)).toBeLessThanOrEqual(1e-8 + 2e-5 * Math.abs(ref));
        }),
      );
      expect(
        patchiConcentration(layer, { x: 25, y: 0, z: 7 }, 40, undefined, { thickness: H }),
      ).toBe(0);
    });

    it('rejects a patch outside the layer', () => {
      expect(() =>
        patchiConcentration(layer, { x: 5, y: 0, z: 3 }, 10, undefined, { thickness: 4 }),
      ).toThrow(RangeError);
    });
  });
});
