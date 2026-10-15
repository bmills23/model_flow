import { describe, expect, it } from 'vitest';
import { integrate } from '../src/numerics/quadrature.js';
import { erfc } from '../src/numerics/special.js';
import {
  at123dConcentration,
  at123dGrid,
  dispersionCoefficients,
  instantaneousBoxConcentration,
  massRateFromConcentration,
  wellScreenAverage,
  type At123dAquifer,
  type BoxSource,
} from '../src/processes/groundwater/index.js';

const aquifer: At123dAquifer = {
  velocity: 0.5,
  porosity: 0.3,
  retardation: 1,
  decayRate: 0,
  dx: 1.0,
  dy: 0.2,
  dz: 0.05,
};
function infinite(a: At123dAquifer): At123dAquifer {
  const c = { ...a };
  delete c.thickness;
  return c;
}
const box: BoxSource = { x1: -1, x2: 1, y1: -2, y2: 2, z1: -0.5, z2: 0.5 };

describe('dispersion coefficients and loading conversions', () => {
  it('forms D = alpha v + Dm for each direction', () => {
    const d = dispersionCoefficients({
      alphaL: 10,
      alphaT: 1,
      alphaV: 0.1,
      velocity: 0.2,
      molecularDiffusion: 0.001,
    });
    expect(d.dx).toBeCloseTo(2.001, 12);
    expect(d.dy).toBeCloseTo(0.201, 12);
    expect(d.dz).toBeCloseTo(0.021, 12);
  });

  it('converts a source concentration to a mass loading rate through the Darcy flux', () => {
    // 5 g/m3 times 0.02 m/d times 3 m2 = 0.3 g/d
    expect(massRateFromConcentration(5, 0.02, 3)).toBeCloseTo(0.3, 12);
    expect(() => massRateFromConcentration(-1, 0.02, 3)).toThrow(RangeError);
  });
});

describe('well-screen averaging with half-weight end points', () => {
  it('returns the value of a uniform profile', () => {
    expect(wellScreenAverage(() => 7.25, 1, 4)).toBeCloseTo(7.25, 12);
  });
  it('averages a linear profile exactly (trapezoid)', () => {
    expect(wellScreenAverage((z) => 2 * z + 1, 0, 3, 6)).toBeCloseTo(4, 12);
  });
  it('rejects an inverted screen', () => {
    expect(() => wellScreenAverage(() => 1, 4, 1)).toThrow(RangeError);
  });
});

describe('instantaneous box release (Green function)', () => {
  it('conserves mass: porosity times retardation times the volume integral is M exp(-lambda tau)', () => {
    const a: At123dAquifer = { ...aquifer, retardation: 2, decayRate: 0.01 };
    const tau = 8;
    const tol = { relTol: 1e-6, absTol: 1e-12 };
    const m = integrate(
      (x) =>
        integrate(
          (y) =>
            integrate((z) => instantaneousBoxConcentration(a, box, { x, y, z }, tau, 1), -4, 4, tol)
              .value,
          -12,
          12,
          tol,
        ).value,
      -10,
      30,
      tol,
    ).value;
    expect(m * a.porosity * 2).toBeCloseTo(Math.exp(-0.01 * tau), 4);
  });

  it('is symmetric about the centreline in y and z for a centred source', () => {
    const p1 = instantaneousBoxConcentration(aquifer, box, { x: 3, y: 1.3, z: 0.2 }, 5);
    const p2 = instantaneousBoxConcentration(aquifer, box, { x: 3, y: -1.3, z: -0.2 }, 5);
    expect(p1).toBeCloseTo(p2, 14);
  });

  it('starts as a uniform block: initial concentration is M / (n R V) inside the source', () => {
    const c = instantaneousBoxConcentration(aquifer, box, { x: 0, y: 0, z: 0 }, 0, 2.4);
    expect(c).toBeCloseTo(2.4 / (0.3 * 1 * 2 * 4 * 1), 12);
    expect(instantaneousBoxConcentration(aquifer, box, { x: 5, y: 0, z: 0 }, 0)).toBe(0);
  });

  it('with no-flux top and bottom conserves mass over the layer and approaches a uniform profile', () => {
    const thick: At123dAquifer = { ...aquifer, thickness: 2, dz: 0.4 };
    const src: BoxSource = { ...box, z1: 0.5, z2: 1.0 };
    const tol = { relTol: 1e-9, absTol: 1e-14 };
    for (const tau of [0.5, 3, 40]) {
      const zi = integrate(
        (z) => instantaneousBoxConcentration(thick, src, { x: 2, y: 0, z }, tau),
        0,
        2,
        tol,
      ).value;
      const noFloor = instantaneousBoxConcentration(
        infinite(thick),
        src,
        { x: 2, y: 0, z: 0.7 },
        tau,
      );
      expect(zi).toBeGreaterThan(0);
      if (tau === 40) {
        // fully mixed: layer-integral equals H times the single-point value
        const a = instantaneousBoxConcentration(thick, src, { x: 2, y: 0, z: 0.1 }, tau);
        const b = instantaneousBoxConcentration(thick, src, { x: 2, y: 0, z: 1.9 }, tau);
        expect(a / b).toBeCloseTo(1, 6);
      }
      if (tau === 0.5) expect(noFloor).toBeGreaterThan(0);
    }
    // layer-integrated vertical factor equals the unbounded one (mass conservation of the image series)
    const withLayer = integrate(
      (z) => instantaneousBoxConcentration(thick, src, { x: 2, y: 0, z }, 3),
      0,
      2,
      tol,
    ).value;
    const unbounded = integrate(
      (z) => instantaneousBoxConcentration(infinite(thick), src, { x: 2, y: 0, z }, 3),
      -30,
      30,
      tol,
    ).value;
    expect(withLayer).toBeCloseTo(unbounded, 7);
  });

  it('image series and cosine series agree across their switching point', () => {
    const thick: At123dAquifer = { ...aquifer, thickness: 2, dz: 0.4 };
    const src: BoxSource = { ...box, z1: 0.5, z2: 1.0 };
    // tau where D tau / H^2 straddles the switch (0.2): tau = 0.2*4/0.4 = 2
    const lo = instantaneousBoxConcentration(thick, src, { x: 2, y: 0, z: 1.3 }, 1.999999);
    const hi = instantaneousBoxConcentration(thick, src, { x: 2, y: 0, z: 1.3 }, 2.000001);
    expect(Math.abs(hi - lo) / lo).toBeLessThan(1e-5);
  });
});

describe('time-integrated loading', () => {
  const a: At123dAquifer = { ...aquifer, decayRate: 0.02 };
  const p = { x: 6, y: 0.5, z: 0.1 };

  it('continuous release equals a long pulse before its end and superposes after it', () => {
    const cont = at123dConcentration(
      { aquifer: a, source: box, loading: [{ start: 0, end: Infinity, rate: 3 }], time: 30 },
      p,
    );
    const pulseLong = at123dConcentration(
      { aquifer: a, source: box, loading: [{ start: 0, end: 100, rate: 3 }], time: 30 },
      p,
    );
    expect(pulseLong).toBeCloseTo(cont, 10);
    const pulse = at123dConcentration(
      { aquifer: a, source: box, loading: [{ start: 0, end: 10, rate: 3 }], time: 30 },
      p,
    );
    const c30 = cont;
    const c20 = at123dConcentration(
      { aquifer: a, source: box, loading: [{ start: 0, end: Infinity, rate: 3 }], time: 20 },
      p,
    );
    // a pulse of duration 10 is the continuous response at t minus the one lagged by 10
    expect(pulse).toBeCloseTo(c30 - c20, 8);
  });

  it('piecewise-constant loading is the sum of its steps', () => {
    const steps = [
      { start: 0, end: 5, rate: 2 },
      { start: 5, end: 12, rate: 0.5 },
      { start: 15, end: 22, rate: 4 },
    ];
    const total = at123dConcentration({ aquifer: a, source: box, loading: steps, time: 30 }, p);
    const sum = steps
      .map((s) => at123dConcentration({ aquifer: a, source: box, loading: [s], time: 30 }, p))
      .reduce((u, v) => u + v, 0);
    expect(total).toBeCloseTo(sum, 12);
  });

  it('is zero before release starts and for a zero-rate load', () => {
    expect(
      at123dConcentration(
        { aquifer: a, source: box, loading: [{ start: 5, end: 9, rate: 1 }], time: 5 },
        p,
      ),
    ).toBe(0);
    expect(
      at123dConcentration(
        { aquifer: a, source: box, loading: [{ start: 0, end: 9, rate: 0 }], time: 8 },
        p,
      ),
    ).toBe(0);
  });

  it('reproduces the 1-D plane-source steady state in the wide-source limit', () => {
    // plane source (x1 = x2) wide in y and z: steady C = q / (n A beta) exp(x (u - beta) / (2 D))
    for (const decayRate of [0, 0.05]) {
      const aq: At123dAquifer = { ...aquifer, decayRate, retardation: 1.5 };
      const R = 1.5;
      const u = aq.velocity / R;
      const D = aq.dx / R;
      const beta = Math.sqrt(u * u + 4 * D * decayRate);
      const wide: BoxSource = { x1: 0, x2: 0, y1: -400, y2: 400, z1: -400, z2: 400 };
      const x = 4;
      const q = 5;
      const area = 800 * 800;
      const c = at123dConcentration(
        { aquifer: aq, source: wide, loading: [{ start: 0, end: Infinity, rate: q }], time: 4000 },
        { x, y: 0, z: 0 },
      );
      // the retarded equation has u = v / R and D_r = D / R; the Green integral over time gives 1 / beta_r
      const expected = (q / (aq.porosity * R * area * beta)) * Math.exp((x * (u - beta)) / (2 * D));
      expect(c / expected).toBeCloseTo(1, 4);
    }
  });

  it('matches the closed-form continuous point-source solution of the 3-D equation', () => {
    const aq: At123dAquifer = { ...aquifer, decayRate: 0.03 };
    const point: BoxSource = { x1: 0, x2: 0, y1: 0, y2: 0, z1: 0, z2: 0 };
    const x = 7,
      y = 1,
      z = 0.2,
      t = 60,
      rate = 2;
    const gamma = Math.sqrt(x * x + (y * y * aq.dx) / aq.dy + (z * z * aq.dx) / aq.dz);
    const beta = Math.sqrt(aq.velocity ** 2 + 4 * aq.dx * aq.decayRate!);
    const rt = 2 * Math.sqrt(aq.dx * t);
    const term = (s: number) =>
      Math.exp((aq.velocity * x + s * gamma * beta) / (2 * aq.dx)) *
      erfc((gamma + s * beta * t) / rt);
    const expected =
      (rate * (term(-1) + term(1))) /
      (8 * aq.porosity * Math.PI * gamma * Math.sqrt(aq.dy * aq.dz));
    const c = at123dConcentration(
      { aquifer: aq, source: point, loading: [{ start: 0, end: Infinity, rate }], time: t },
      { x, y, z },
    );
    expect(c / expected).toBeCloseTo(1, 6);
  });
});

describe('plan-view grid', () => {
  const a: At123dAquifer = { ...aquifer, decayRate: 0.002, thickness: 10 };
  const src: BoxSource = { x1: -2, x2: 2, y1: -5, y2: 5, z1: 0, z2: 3 };
  const input = {
    aquifer: a,
    source: src,
    loading: [
      { start: 0, end: 60, rate: 1 },
      { start: 80, end: Infinity, rate: 0.4 },
    ],
    time: 100,
  };

  it('agrees with the adaptive point solution', () => {
    const xs = [-3, 0, 1.5, 6, 20, 45];
    const ys = [-12, -5, 0, 2, 9];
    const grid = at123dGrid(input, xs, ys, 1.5);
    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < ys.length; j++) {
        const ref = at123dConcentration(input, { x: xs[i]!, y: ys[j]!, z: 1.5 });
        expect(Math.abs(grid[i]![j]! - ref), `x=${xs[i]} y=${ys[j]}`).toBeLessThanOrEqual(
          1e-9 + 2e-5 * Math.abs(ref),
        );
      }
    }
  });

  it('evaluates a 100 by 60 plan-view grid at one time well under a second', () => {
    const xs = Array.from({ length: 100 }, (_, i) => -5 + i * 0.7);
    const ys = Array.from({ length: 60 }, (_, j) => -15 + j * 0.5);
    const start = Date.now();
    const grid = at123dGrid(input, xs, ys, 1.5);
    const ms = Date.now() - start;
    (globalThis as unknown as { console: { info(s: string): void } }).console.info(
      `AT123D-class 100x60 plan-view grid: ${ms} ms`,
    );
    expect(grid[30]![30]).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000);
  });
});
