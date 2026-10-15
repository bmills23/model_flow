import { describe, expect, it } from 'vitest';
import {
  at123dConcentration,
  at123dGrid,
  domenicoConcentration,
  domenicoWarnings,
  groundwaterDomenico,
  patchfConcentration,
  patchfGrid,
  patchiConcentration,
  patchiGrid,
  type At123dAquifer,
  type At123dInput,
  type BoxSource,
  type DomenicoInput,
  type WexlerInput,
} from '../src/processes/groundwater/index.js';

const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

/** Huge patch, no decay: the 1-D answer is exactly c0 at steady state. */
function hugePatch(alphaL: number): WexlerInput {
  const u = 0.5;
  return {
    velocity: u,
    decayRate: 0,
    dx: alphaL * u,
    dy: 1,
    dz: 1,
    c0: 1000,
    patch: { y1: 0, y2: 2e6, z1: 0, z2: 2e6 },
  };
}

describe('review finding 1: steady state at high Peclet', () => {
  for (const alphaL of [0.1, 0.01, 0.001]) {
    const inp = hugePatch(alphaL);
    const p = { x: 100, y: 1e6, z: 1e6 };
    const fin = { width: 2e6, thickness: 2e6 };
    it(`PATCHI point gives c0 at alphaL ${alphaL}`, () => {
      expect(rel(patchiConcentration(inp, p, Infinity), 1000)).toBeLessThan(1e-6);
    });
    it(`PATCHF integral and default give c0 at alphaL ${alphaL}`, () => {
      expect(
        rel(patchfConcentration(inp, p, Infinity, { ...fin, method: 'integral' }).value, 1000),
      ).toBeLessThan(1e-6);
      expect(rel(patchfConcentration(inp, p, Infinity, fin).value, 1000)).toBeLessThan(1e-6);
    });
    it(`grids give c0 at alphaL ${alphaL}`, () => {
      expect(rel(patchiGrid(inp, [100], [1e6], 1e6, Infinity)[0]![0]!, 1000)).toBeLessThan(1e-6);
      expect(rel(patchfGrid(inp, [100], [1e6], 1e6, Infinity, fin)[0]![0]!, 1000)).toBeLessThan(
        1e-6,
      );
    });
  }
});

describe('review finding 2: grid versus point at high Peclet', () => {
  const GRID_TOL = 1e-4;
  for (const [alphaL, pe] of [
    [0.1, 1e3],
    [0.01, 1e4],
    [0.001, 1e5],
  ] as const) {
    const u = 0.5;
    const wex: WexlerInput = {
      velocity: u,
      decayRate: 0.001,
      dx: alphaL * u,
      dy: 0.2 * alphaL * u,
      dz: 0.05 * alphaL * u,
      c0: 1000,
      patch: { y1: 20, y2: 40, z1: 0, z2: 4 },
    };
    it(`PATCHI/PATCHF grid matches point at Pe ${pe}`, () => {
      for (const t of [200, 205, 300]) {
        const xs = [60, 100];
        const gi = patchiGrid(wex, xs, [30, 38], 2, t);
        const gf = patchfGrid(wex, xs, [30, 38], 2, t, { width: 60, thickness: 10 });
        xs.forEach((x, i) =>
          [30, 38].forEach((y, j) => {
            const pt = { x, y, z: 2 };
            const a = patchiConcentration(wex, pt, t);
            const b = patchfConcentration(wex, pt, t, { width: 60, thickness: 10 }).value;
            if (a > 1e-9) expect(rel(gi[i]![j]!, a)).toBeLessThan(GRID_TOL);
            if (b > 1e-9) expect(rel(gf[i]![j]!, b)).toBeLessThan(GRID_TOL);
          }),
        );
      }
    });
    it(`AT123D grid matches point at Pe ${pe}`, () => {
      const input: At123dInput = {
        aquifer: {
          velocity: u,
          porosity: 0.3,
          dx: alphaL * u,
          dy: 0.2 * alphaL * u,
          dz: 0.05 * alphaL * u,
          decayRate: 0.001,
        },
        source: { x1: -1, x2: 1, y1: -2, y2: 2, z1: -0.5, z2: 0.5 },
        loading: [{ start: 0, end: Infinity, rate: 1 }],
        time: 300,
      };
      const g = at123dGrid(input, [100], [0, 1], 0);
      [0, 1].forEach((y, j) => {
        const pt = at123dConcentration(input, { x: 100, y, z: 0 });
        expect(rel(g[0]![j]!, pt)).toBeLessThan(GRID_TOL);
      });
    });
  }
});

const aq: At123dAquifer = {
  velocity: 0.5,
  porosity: 0.3,
  dx: 1,
  dy: 0.2,
  dz: 0.05,
  thickness: 10,
};
const box: BoxSource = { x1: -1, x2: 1, y1: -2, y2: 2, z1: 4, z2: 6 };
const mk = (a: Partial<At123dAquifer>, s: Partial<BoxSource> = {}, time = 100): At123dInput => ({
  aquifer: { ...aq, ...a },
  source: { ...box, ...s },
  loading: [{ start: 0, end: Infinity, rate: 1 }],
  time,
});
const pt = { x: 10, y: 0, z: 5 };

describe('review finding 3: AT123D input validation', () => {
  const bad: Array<[string, Partial<At123dAquifer>]> = [
    ['porosity 0', { porosity: 0 }],
    ['porosity negative', { porosity: -0.3 }],
    ['porosity above 1', { porosity: 1.2 }],
    ['retardation 0', { retardation: 0 }],
    ['retardation below 1', { retardation: 0.5 }],
    ['dx negative', { dx: -1 }],
    ['dx NaN', { dx: NaN }],
    ['thickness 0', { thickness: 0 }],
    ['thickness negative', { thickness: -3 }],
    ['velocity NaN', { velocity: NaN }],
    ['decay NaN', { decayRate: NaN }],
  ];
  for (const [name, patch] of bad) {
    it(`throws RangeError for ${name}`, () => {
      expect(() => at123dConcentration(mk(patch), pt)).toThrow(RangeError);
      expect(() => at123dGrid(mk(patch), [10], [0], 5)).toThrow(RangeError);
    });
  }
  it('throws for non-finite receptor and source coordinates', () => {
    expect(() => at123dConcentration(mk({}), { x: NaN, y: 0, z: 5 })).toThrow(RangeError);
    expect(() => at123dConcentration(mk({}, { x1: NaN }), pt)).toThrow(RangeError);
  });
});

describe('review finding 4: Domenico needs a positive velocity', () => {
  const d: DomenicoInput = {
    velocity: 0,
    alphaL: 10,
    alphaT: 1,
    alphaV: 0.1,
    c0: 10,
    sourceWidth: 20,
    sourceThickness: 3,
  };
  it('throws RangeError for zero or negative velocity in every entry point', () => {
    for (const v of [0, -0.2, NaN]) {
      const inp = { ...d, velocity: v };
      const p = { x: 5, y: 0, z: 0 };
      expect(() => domenicoConcentration(inp, p, 10)).toThrow(RangeError);
      expect(() => domenicoWarnings(inp, p, 10)).toThrow(RangeError);
      expect(() => groundwaterDomenico.run({ params: inp, time: 10, points: [p] })).toThrow(
        RangeError,
      );
    }
  });
});

describe('review finding 5: negative velocity', () => {
  it('is mirrored by the sign of the receptor position', () => {
    const fwd = at123dConcentration(mk({ velocity: 0.5, dx: 0.005 }, { x1: 0, x2: 0 }, 300), {
      x: 100,
      y: 0,
      z: 5,
    });
    const back = at123dConcentration(mk({ velocity: -0.5, dx: 0.005 }, { x1: 0, x2: 0 }, 300), {
      x: -100,
      y: 0,
      z: 5,
    });
    expect(fwd).toBeGreaterThan(0);
    expect(rel(back, fwd)).toBeLessThan(1e-6);
  });
});

describe('review finding 6: infinite time', () => {
  it('is rejected by the AT123D point and grid paths', () => {
    expect(() => at123dConcentration(mk({}, {}, Infinity), pt)).toThrow(RangeError);
    expect(() => at123dGrid(mk({}, {}, Infinity), [10], [0], 5)).toThrow(RangeError);
  });
});

describe('review finding 7: out-of-domain coordinates', () => {
  it('rejects a source box outside the layer', () => {
    expect(() => at123dConcentration(mk({}, { z2: 14 }), pt)).toThrow(RangeError);
    expect(() => at123dConcentration(mk({}, { z1: -1 }), pt)).toThrow(RangeError);
  });
  it('reports zero for receptors outside the layer, in point and grid paths', () => {
    expect(at123dConcentration(mk({}), { x: 10, y: 0, z: 13 })).toBe(0);
    expect(at123dConcentration(mk({}), { x: 10, y: 0, z: -1 })).toBe(0);
    expect(at123dGrid(mk({}), [10], [0], 13)[0]![0]).toBe(0);
  });
  it('PATCHF grid agrees with the point function outside the aquifer', () => {
    const w: WexlerInput = {
      velocity: 0.5,
      decayRate: 0.01,
      dx: 2,
      dy: 0.4,
      dz: 0.1,
      c0: 1000,
      patch: { y1: 10, y2: 30, z1: 0, z2: 4 },
    };
    const f = { width: 40, thickness: 10 };
    const g = patchfGrid(w, [8], [-5, 20, 45], 5, 60, f);
    expect(g[0]![0]).toBe(0);
    expect(g[0]![2]).toBe(0);
    expect(g[0]![1]).toBeGreaterThan(0);
    expect(patchfGrid(w, [8], [20], 12, 60, f)[0]![0]).toBe(0);
    expect(patchfGrid(w, [8], [20], -1, 60, f)[0]![0]).toBe(0);
  });
  it('Domenico does not mirror z < 0', () => {
    const d: DomenicoInput = {
      velocity: 0.2,
      decayRate: 0.002,
      alphaL: 10,
      alphaT: 1,
      alphaV: 0.1,
      c0: 10,
      sourceWidth: 20,
      sourceThickness: 3,
    };
    expect(domenicoConcentration(d, { x: 10, y: 0, z: -2 }, 100)).toBe(0);
    expect(domenicoWarnings(d, { x: 10, y: 0, z: -2 }, 100).map((w) => w.code)).toContain(
      'domenico.outside-domain',
    );
  });
});

describe('review finding 10: off-centreline warning concerns lateral divergence', () => {
  const d: DomenicoInput = {
    velocity: 0.2,
    decayRate: 0.002,
    alphaL: 10,
    alphaT: 1,
    alphaV: 0.1,
    c0: 10,
    sourceWidth: 20,
    sourceThickness: 3,
  };
  const codes = (y: number, z: number): string[] =>
    domenicoWarnings(d, { x: 20, y, z }, 100).map((w) => w.code);
  it('fires for y != 0 only', () => {
    expect(codes(5, 0)).toContain('domenico.off-centreline-with-decay');
    expect(codes(0, 1)).not.toContain('domenico.off-centreline-with-decay');
  });
});
