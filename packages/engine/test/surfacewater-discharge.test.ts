import { describe, expect, it } from 'vitest';
import { erf } from '../src/numerics/special.js';
import {
  at123dConcentration,
  instantaneousBoxConcentration,
  type BoxSource,
} from '../src/processes/groundwater/index.js';
import { axisDensity } from '../src/processes/groundwater/common.js';
import {
  bankPlaneDischarge,
  planeIntegral,
  type PlaneConcentration,
} from '../src/processes/surfaceWater/discharge.js';
import { H, at, layer, n, rel, v } from './surfacewaterHelpers.js';

describe('mass balance of the bank plane against AT123D (fixtures 4a to 4d)', () => {
  const box: BoxSource = { x1: -1, x2: 1, y1: -3, y2: 3, z1: 5, z2: 15 };

  it('4a: continuous source, no decay, full plane: W at late time equals the release rate', () => {
    const aq = layer({ dy: 0.01, dz: 0.02, dx: 0.05 });
    const rate = 2.5;
    const c = at(20, (p) =>
      at123dConcentration(
        { aquifer: aq, source: box, loading: [{ start: 0, end: Infinity, rate }], time: 800 },
        p,
      ),
    );
    const r = bankPlaneDischarge(c, { reachLength: 30, thickness: H, darcyFlux: n * v }, [800], {
      relTol: 1e-6,
      panels: 2,
    });
    expect(rel(r.discharge[0]!, rate)).toBeLessThan(1e-6);
    expect(r.groundwaterFlow).toBeCloseTo(n * v * H * 30, 12);
    expect(rel(r.fluxAveragedConcentration[0]!, r.discharge[0]! / r.groundwaterFlow)).toBeLessThan(
      1e-14,
    );
  }, 120_000);

  it('4d: the adaptive plane quadrature equals the closed-form full-width integral', () => {
    // integral over y of the lateral factor is 1, so W(t) = (v/R) fx(x - u t) exp(-lambda t) for unit mass
    const lambda = 0.002;
    const R = 1.5;
    const aq = layer({ decayRate: lambda, retardation: R, dy: 0.5 });
    const c: PlaneConcentration = (y, depth, t) =>
      instantaneousBoxConcentration(aq, box, { x: 30, y, z: H - depth }, t, 1);
    for (const t of [150, 300, 600]) {
      const u = v / R;
      const wx = 2 * Math.sqrt((aq.dx / R) * t);
      const oracle = (v / R) * axisDensity(30 - u * t, box.x1, box.x2, wx) * Math.exp(-lambda * t);
      expect(
        rel(
          bankPlaneDischarge(c, { reachLength: 400, thickness: H, darcyFlux: n * v }, [t])
            .discharge[0]!,
          oracle,
        ),
      ).toBeLessThan(1e-8);
    }
  });
});

describe('reach and underflow checks', () => {
  const aq = layer({ dy: 0.5, dz: 0.05 });
  const box: BoxSource = { x1: -1, x2: 1, y1: -3, y2: 3, z1: 15, z2: 20 };
  const c: PlaneConcentration = (y, depth, t) =>
    instantaneousBoxConcentration(aq, box, { x: 20, y, z: H - depth }, t, 1);
  const peakT = 200;
  const plane = { darcyFlux: n * v, fullHalfWidth: 80, fullDepth: H };

  it('a wide, deep plane holds essentially all of the discharge and warns nothing', () => {
    const r = bankPlaneDischarge(c, { ...plane, reachLength: 100, thickness: H }, [peakT]);
    expect(r.reachFraction!).toBeGreaterThan(0.999);
    expect(r.depthFraction!).toBeGreaterThan(0.999);
    expect(r.warnings).toEqual([]);
  });

  it('a short reach warns that it truncates the plume', () => {
    const r = bankPlaneDischarge(c, { ...plane, reachLength: 4, thickness: H }, [peakT]);
    expect(r.reachFraction!).toBeLessThan(0.99);
    expect(r.warnings.map((w) => w.code)).toContain('surfaceWater.reach-truncates-plume');
  });

  it('a shallow discharge thickness warns the plume passes beneath the water body', () => {
    const r = bankPlaneDischarge(c, { ...plane, reachLength: 100, thickness: 2 }, [peakT]);
    expect(r.depthFraction!).toBeLessThan(0.95);
    expect(r.warnings.map((w) => w.code)).toContain('surfaceWater.plume-underflow');
    // the surface layer holds less than the full plane
    const full = bankPlaneDischarge(c, { ...plane, reachLength: 100, thickness: H }, [peakT]);
    expect(r.discharge[0]!).toBeLessThan(full.discharge[0]!);
  });

  it('skips the checks when the plane declares no full extent', () => {
    const r = bankPlaneDischarge(c, { reachLength: 4, thickness: 2, darcyFlux: n * v }, [peakT]);
    expect(r.reachFraction).toBeUndefined();
    expect(r.depthFraction).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });
});

describe('linearity and input checks', () => {
  const g: PlaneConcentration = (y, depth) => Math.exp(-(y * y) / 50 - depth / 3);
  it('W is linear in the concentration field', () => {
    const plane = { reachLength: 40, thickness: 8, darcyFlux: 0.03 };
    const a = bankPlaneDischarge(g, plane, [1]).discharge[0]!;
    const b = bankPlaneDischarge((y, z, t) => 2 * g(y, z, t), plane, [1]).discharge[0]!;
    expect(rel(b, 2 * a)).toBeLessThan(1e-12);
  });
  it('integrates a known field: constant C over the plane is C times the area', () => {
    expect(
      rel(
        planeIntegral(() => 3, 0, -5, 5, 4),
        120,
      ),
    ).toBeLessThan(1e-12);
  });
  it('rejects bad planes and times', () => {
    const ok = { reachLength: 40, thickness: 8, darcyFlux: 0.03 };
    expect(() => bankPlaneDischarge(g, { ...ok, reachLength: 0 }, [1])).toThrow(RangeError);
    expect(() => bankPlaneDischarge(g, { ...ok, thickness: -1 }, [1])).toThrow(RangeError);
    expect(() => bankPlaneDischarge(g, { ...ok, darcyFlux: 0 }, [1])).toThrow(RangeError);
    expect(() => bankPlaneDischarge(g, { ...ok, fullHalfWidth: 10 }, [1])).toThrow(RangeError);
    expect(() => bankPlaneDischarge(g, { ...ok, fullDepth: 4 }, [1])).toThrow(RangeError);
    expect(() => bankPlaneDischarge(g, ok, [2, 1])).toThrow(RangeError);
    expect(() => bankPlaneDischarge(g, ok, [])).toThrow(RangeError);
  });
});

describe('narrow plume over a long reach (closed-form oracle)', () => {
  // C = exp(-y^2 / (2 s^2)) exp(-depth / lam): the integral over y in [-L/2, L/2], depth in [0, d] is
  // s sqrt(2 pi) erf(L / (2 s sqrt 2)) lam (1 - exp(-d / lam)). The fast setting of the web app is used.
  const fast = { relTol: 1e-3, panels: 1 } as const;
  const exact = (s: number, lam: number, L: number, d: number): number =>
    s * Math.sqrt(2 * Math.PI) * erf(L / (2 * s * Math.SQRT2)) * lam * (1 - Math.exp(-d / lam));
  const field =
    (s: number, lam: number): PlaneConcentration =>
    (y, z) =>
      Math.exp(-(y * y) / (2 * s * s) - z / lam);
  const cases: [string, number, number, number, number][] = [
    ['1 m plume, 1,000 m reach', 0.5, 0.3, 1000, 3],
    ['1 m plume, 2,000 m reach', 0.5, 0.3, 2000, 3],
    ['1 m plume, 20,000 m reach', 0.5, 0.3, 20000, 3],
    ['10 m plume, 200,000 m reach', 5, 1, 200000, 3],
    ['thin plume at the water table, 5,000 m reach', 2, 0.01, 5000, 3],
  ];
  for (const [name, s, lam, L, d] of cases) {
    for (const opts of [fast, {}]) {
      it(`captures the plume: ${name} (${Object.keys(opts).length ? 'fast' : 'default'})`, () => {
        const got = planeIntegral(field(s, lam), 1, -L / 2, L / 2, d, opts);
        expect(rel(got, exact(s, lam, L, d))).toBeLessThan(1e-3);
      });
    }
  }
  it('returns zero for a field that is zero everywhere', () => {
    expect(planeIntegral(() => 0, 1, -50, 50, 3, fast)).toBe(0);
  });
});
