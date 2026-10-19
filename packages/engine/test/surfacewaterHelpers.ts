import { integrate } from '../src/numerics/quadrature.js';
import {
  instantaneousBoxConcentration,
  type At123dAquifer,
  type BoxSource,
} from '../src/processes/groundwater/index.js';
import {
  bankPlaneDischarge,
  type PlaneConcentration,
} from '../src/processes/surfaceWater/discharge.js';

// Consistent units here: metres and days (the kernels are unit-agnostic); the engine's SI is s.
export const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

export const H = 20; // finite layer, water table at z = H
export const n = 0.3;
export const v = 0.1;
export const layer = (over: Partial<At123dAquifer> = {}): At123dAquifer => ({
  velocity: v,
  porosity: n,
  retardation: 1,
  decayRate: 0,
  dx: 1,
  dy: 0.02,
  dz: 0.01,
  thickness: H,
  ...over,
});
/** Plane (y, depth) onto the layer's coordinates: z measured up from the bottom, water table at z = H. */
export const at =
  (x: number, f: (p: { x: number; y: number; z: number }) => number): PlaneConcentration =>
  (y, depth) =>
    f({ x, y, z: H - depth });

// The unit-mass impulse response is closed form, so the time integral is cheap. A thin layer (2 m) with
// a source spanning all of it keeps the vertical profile exactly uniform, which the plane quadrature
// then integrates in one pass.
export const HT = 2;
export const thin = (over: Partial<At123dAquifer> = {}): At123dAquifer =>
  layer({ thickness: HT, ...over });
export const slab: BoxSource = { x1: -1, x2: 1, y1: -3, y2: 3, z1: 0, z2: HT };
export const impulse =
  (aq: At123dAquifer, b: BoxSource, x: number): PlaneConcentration =>
  (y, depth, t) =>
    instantaneousBoxConcentration(aq, b, { x, y, z: HT - depth }, t, 1);
export const W = (c: PlaneConcentration, reach: number, t: number, q: number): number =>
  bankPlaneDischarge(c, { reachLength: reach, thickness: HT, darcyFlux: q }, [t], {
    relTol: 1e-7,
    panels: 2,
  }).discharge[0]!;
export const timeIntegral = (f: (t: number) => number, tMax: number): number => {
  let sum = 0;
  const cuts = 6;
  for (let i = 0; i < cuts; i++) {
    sum += integrate(f, (i * tMax) / cuts, ((i + 1) * tMax) / cuts, {
      relTol: 1e-8,
      absTol: 1e-11,
      maxDepth: 12,
    }).value;
  }
  return sum;
};
