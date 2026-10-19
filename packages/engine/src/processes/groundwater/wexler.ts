import { integrateTanhSinh } from '../../numerics/quadrature.js';
import { superposeLoading, superposeLoadingGrid, type ConcentrationStep } from './loading.js';
import { expErfc } from '../../numerics/special.js';
import {
  BASE_PANELS_PER_DECADE,
  axisDensity,
  panelRule,
  peakFollowingDensity,
  slab,
  type Point3,
} from './common.js';

/**
 * Wexler (1992) exact solutions for a patch source on the inflow plane x = 0 with a first-type
 * (fixed concentration c0) boundary condition, uniform flow along x, first-order decay and
 * retardation. PATCHI: infinite width and depth. PATCHF: finite width (y in [0, W]) and thickness
 * (z in [0, H]) with no-flux boundaries. Concentrations outside x >= 0 are reported as zero.
 */
export interface WexlerInput {
  /** Seepage velocity along x. */
  velocity: number;
  retardation?: number;
  decayRate?: number;
  dx: number;
  dy: number;
  dz: number;
  /** Concentration held on the patch. */
  c0: number;
  patch: { y1: number; y2: number; z1: number; z2: number };
}

export interface FiniteAquifer {
  width: number;
  thickness: number;
  /** 'series' (default, falls back to 'integral' when the series does not converge) or force one. */
  method?: 'series' | 'integral';
  /** Maximum number of terms per direction in the series. */
  maxTerms?: number;
}

export interface PatchfResult {
  value: number;
  converged: boolean;
  method: 'series' | 'integral';
  /** Terms used in each direction (series) or 0. */
  terms: number;
}

/**
 * Vertical boundary of a PATCHI run, for a patch that does not span the whole z axis.
 * `thickness`: a layer z in [0, H] with no-flux top and bottom (PATCHI with infinite width and a
 * bounded depth). `waterTable`: an infinitely deep aquifer below a no-flux water table at z = waterTable
 * (the patch must lie at or below it; receptors above it report zero).
 */
export type VerticalBounds = { thickness: number } | { waterTable: number };

/** Lateral and vertical boundaries in force inside the time integral and the grid rule. */
interface Bounds {
  width?: number;
  thickness?: number;
  waterTable?: number;
}

function boundsOf(
  finite?: { width: number; thickness: number },
  vertical?: VerticalBounds,
): Bounds {
  if (finite) return { width: finite.width, thickness: finite.thickness };
  return vertical ?? {};
}

/** True when a receptor lies outside the bounded domain (zero concentration, not a mirrored image). */
function outsideBounds(p: Point3, b: Bounds): boolean {
  if (b.width !== undefined && (p.y < 0 || p.y > b.width)) return true;
  if (b.thickness !== undefined && (p.z < 0 || p.z > b.thickness)) return true;
  return b.waterTable !== undefined && p.z > b.waterTable;
}

/** Unnormalised y profile of the patch spread by width w: smoothed indicator, reflected when bounded. */
function yProfile(y: number, y1: number, y2: number, w: number, b: Bounds): number {
  return b.width === undefined
    ? slab(y, y1, y2, w)
    : axisDensity(y, y1, y2, w, b.width) * (y2 - y1);
}

/** Unnormalised z profile: reflected at the layer ends, or at the water table (image patch), when bounded. */
function zProfile(z: number, z1: number, z2: number, w: number, b: Bounds): number {
  if (b.thickness !== undefined) return axisDensity(z, z1, z2, w, b.thickness) * (z2 - z1);
  if (b.waterTable !== undefined) {
    const t = b.waterTable;
    return z > t ? 0 : slab(z, z1, z2, w) + slab(z, 2 * t - z2, 2 * t - z1, w);
  }
  return slab(z, z1, z2, w);
}

function checkVertical(input: WexlerInput, vertical?: VerticalBounds): void {
  if (!vertical) return;
  const { z1, z2 } = input.patch;
  if ('thickness' in vertical) {
    if (!(vertical.thickness > 0)) throw new RangeError('Thickness must be positive');
    if (!(z1 >= 0 && z2 <= vertical.thickness))
      throw new RangeError('Patch must lie inside the aquifer');
  } else {
    if (!Number.isFinite(vertical.waterTable)) throw new RangeError('Water table must be finite');
    if (!(z2 <= vertical.waterTable))
      throw new RangeError('Patch must lie at or below the no-flux water table');
  }
}

interface Retarded {
  u: number;
  dx: number;
  dy: number;
  dz: number;
  k: number;
}

function retarded(input: WexlerInput): Retarded {
  const R = input.retardation ?? 1;
  const { y1, y2, z1, z2 } = input.patch;
  if (!(y2 > y1 && z2 > z1)) throw new RangeError('Patch bounds must satisfy y1 < y2 and z1 < z2');
  if (!(input.dx > 0 && input.dy >= 0 && input.dz >= 0))
    throw new RangeError('Dispersion coefficients must be positive');
  return {
    u: input.velocity / R,
    dx: input.dx / R,
    dy: input.dy / R,
    dz: input.dz / R,
    k: input.decayRate ?? 0,
  };
}

/**
 * First-type 1-D solution X(x, t; k) / c0 for a semi-infinite column with decay k: the closed form of
 * the time integral of the decayed first-passage density x/(2 sqrt(pi D tau^3)) exp(-(x - u tau)^2 / (4 D tau) - k tau).
 */
function firstType(x: number, t: number, u: number, d: number, k: number): number {
  if (x === 0) return 1;
  if (t === 0) return 0;
  const beta = Math.sqrt(u * u + 4 * d * k);
  const first = (x * (u - beta)) / (2 * d);
  if (t === Infinity) return Math.exp(first);
  const rt = 2 * Math.sqrt(d * t);
  return (
    0.5 *
    (expErfc(first, (x - beta * t) / rt) + expErfc((x * (u + beta)) / (2 * d), (x + beta * t) / rt))
  );
}

/**
 * Upper end of the time integral at steady state. The integrand carries
 * exp(-(x - u T)^2 / (4 D T) - k T); the limit is the larger root of that exponent equal to 40
 * (e^-40 is about 4e-18), which is the quadratic beta^2 T^2 - (2 x u + 160 D) T + x^2 = 0 with
 * beta^2 = u^2 + 4 D k. This covers the advective Gaussian tail at any Peclet number. If the
 * exponent never reaches 40 the integrand is negligible everywhere and the vertex is used.
 */
function integralUpperLimit(x: number, r: Retarded): number {
  const b2 = r.u * r.u + 4 * r.dx * r.k;
  if (!(b2 > 0)) throw new RangeError('No steady state: needs positive velocity or decay');
  const m = x * r.u + 80 * r.dx;
  const disc = m * m - b2 * x * x;
  const root = disc > 0 ? Math.sqrt(disc) : 0;
  return (m + root) / b2;
}

function timeIntegral(
  input: WexlerInput,
  r: Retarded,
  p: Point3,
  time: number,
  bounds: Bounds = {},
): number {
  const { y1, y2, z1, z2 } = input.patch;
  const norm = x0(p.x);
  const upper = time === Infinity ? integralUpperLimit(p.x, r) : time;
  const f = (tau: number): number => {
    const g =
      (norm * Math.exp(-r.k * tau - (p.x - r.u * tau) ** 2 / (4 * r.dx * tau))) /
      Math.pow(tau, 1.5);
    if (!(g > 0)) return 0;
    const wy = 2 * Math.sqrt(r.dy * tau);
    const wz = 2 * Math.sqrt(r.dz * tau);
    return g * yProfile(p.y, y1, y2, wy, bounds) * zProfile(p.z, z1, z2, wz, bounds);
  };
  function x0(x: number): number {
    return x / (2 * Math.sqrt(Math.PI * r.dx));
  }
  const peak = r.u > 0 ? p.x / r.u : -1;
  const cuts = peak > 0 && peak < upper ? [0, peak, upper] : [0, upper];
  let sum = 0;
  for (let i = 0; i + 1 < cuts.length; i++)
    sum += integrateTanhSinh(f, cuts[i]!, cuts[i + 1]!, {
      relTol: 1e-9,
      absTol: 0,
      maxDepth: 10,
    }).value;
  return input.c0 * sum;
}

function inflowPlane(input: WexlerInput, p: Point3, bounds: Bounds = {}): number {
  const { y1, y2, z1, z2 } = input.patch;
  // on the inflow plane the profile is the sharp patch indicator inside the aquifer
  if (outsideBounds(p, bounds)) return 0;
  const zPart =
    bounds.waterTable !== undefined ? zProfile(p.z, z1, z2, 0, bounds) : slab(p.z, z1, z2, 0);
  return input.c0 * slab(p.y, y1, y2, 0) * zPart;
}

/**
 * Wexler (1992) PATCHI: patch source on the inflow plane, infinite width and depth. With `vertical`
 * the z axis is bounded instead (see VerticalBounds): the patch spreading is reflected at the no-flux
 * layer ends or water table by the method of images, and receptors outside the domain report zero.
 * With a loading, `unitResponse` keeps the unit step response by age between calls: it does not depend
 * on the concentrations, so a caller re-running one point with new concentrations (a level search)
 * passes one map per point and skips the quadrature. Valid for one input (c0 aside), point and vertical.
 */
export function patchiConcentration(
  input: WexlerInput,
  p: Point3,
  time: number,
  loading?: readonly ConcentrationStep[],
  vertical?: VerticalBounds,
  unitResponse?: Map<number, number>,
): number {
  if (loading) {
    const unit = { ...input, c0: 1 };
    return superposeLoading(loading, time, (tau) => {
      const known = unitResponse?.get(tau);
      if (known !== undefined) return known;
      const value = patchiConcentration(unit, p, tau, undefined, vertical);
      unitResponse?.set(tau, value);
      return value;
    });
  }
  const r = retarded(input);
  checkVertical(input, vertical);
  const bounds = boundsOf(undefined, vertical);
  if (p.x < 0 || time < 0 || outsideBounds(p, bounds)) return 0;
  if (p.x === 0) return inflowPlane(input, p, bounds);
  if (time === 0) return 0;
  return timeIntegral(input, r, p, time, bounds);
}

/** Wexler (1992) PATCHF: finite width and thickness, with the exact double-cosine series solution. */
export function patchfConcentration(
  input: WexlerInput,
  p: Point3,
  time: number,
  aquifer: FiniteAquifer,
  loading?: readonly ConcentrationStep[],
): PatchfResult {
  if (loading) {
    const unit = { ...input, c0: 1 };
    const acc: PatchfResult = { value: 0, converged: true, method: 'series', terms: 0 };
    acc.value = superposeLoading(loading, time, (tau) => {
      const r = patchfConcentration(unit, p, tau, aquifer);
      acc.converged &&= r.converged;
      if (r.method === 'integral') acc.method = 'integral';
      acc.terms = Math.max(acc.terms, r.terms);
      return r.value;
    });
    return acc;
  }
  const r = retarded(input);
  const { width: W, thickness: H } = aquifer;
  const { y1, y2, z1, z2 } = input.patch;
  if (!(W > 0 && H > 0)) throw new RangeError('Width and thickness must be positive');
  if (!(y1 >= 0 && y2 <= W && z1 >= 0 && z2 <= H))
    throw new RangeError('Patch must lie inside the aquifer');
  if (p.x < 0 || time < 0 || p.y < 0 || p.y > W || p.z < 0 || p.z > H) {
    return { value: 0, converged: true, method: 'series', terms: 0 };
  }
  if (p.x === 0)
    return {
      value: inflowPlane(input, p, boundsOf(aquifer)),
      converged: true,
      method: 'series',
      terms: 0,
    };
  if (time === 0) return { value: 0, converged: true, method: 'series', terms: 0 };
  const finite = { width: W, thickness: H };
  const forced = aquifer.method;
  if (forced !== 'integral') {
    const maxTerms = aquifer.maxTerms ?? 400;
    const s = patchfSeries(input, r, p, time, W, H, maxTerms);
    if (s.converged || forced === 'series') {
      return { value: s.value, converged: s.converged, method: 'series', terms: s.terms };
    }
  }
  return {
    value: timeIntegral(input, r, p, time, boundsOf(finite)),
    converged: true,
    method: 'integral',
    terms: 0,
  };
}

const SERIES_TOL = 1e-13;

function patchfSeries(
  input: WexlerInput,
  r: Retarded,
  p: Point3,
  time: number,
  W: number,
  H: number,
  maxTerms: number,
): { value: number; converged: boolean; terms: number } {
  const { y1, y2, z1, z2 } = input.patch;
  // cosine coefficients of the patch indicator in y (width W) and z (thickness H)
  const coefY = (n: number): number =>
    n === 0
      ? (y2 - y1) / W
      : (2 / (n * Math.PI)) * (Math.sin((n * Math.PI * y2) / W) - Math.sin((n * Math.PI * y1) / W));
  const coefZ = (m: number): number =>
    m === 0
      ? (z2 - z1) / H
      : (2 / (m * Math.PI)) * (Math.sin((m * Math.PI * z2) / H) - Math.sin((m * Math.PI * z1) / H));
  const envelope = (n: number): number => (n === 0 ? 1 : 4 / (n * Math.PI));
  let sum = 0;
  let terms = 0;
  for (let n = 0; n < maxTerms; n++) {
    const an = coefY(n) * Math.cos((n * Math.PI * p.y) / W);
    const ky = r.dy * ((n * Math.PI) / W) ** 2;
    // first term of the row bounds every later row, since the decay-modified kernel only decreases
    if (envelope(n) * firstType(p.x, time, r.u, r.dx, r.k + ky) < SERIES_TOL) {
      return { value: input.c0 * sum, converged: true, terms };
    }
    let m = 0;
    for (; m < maxTerms; m++) {
      const kz = r.dz * ((m * Math.PI) / H) ** 2;
      const xv = firstType(p.x, time, r.u, r.dx, r.k + ky + kz);
      if (envelope(n) * envelope(m) * xv < SERIES_TOL) break;
      sum += an * coefZ(m) * Math.cos((m * Math.PI * p.z) / H) * xv;
    }
    if (m === maxTerms) return { value: input.c0 * sum, converged: false, terms: maxTerms };
    terms = Math.max(terms, n, m);
  }
  return { value: input.c0 * sum, converged: false, terms: maxTerms };
}

/**
 * PATCHI on a plan-view grid at height z: one shared time rule for all points (see at123dGrid).
 * Agrees with patchiConcentration to a few 1e-8 relative wherever the value exceeds 1e-6 of c0, for Peclet
 * numbers (x u / D) up to MAX_GRID_PECLET (larger values throw). Returns c[ix][iy]; x < 0 and receptors
 * outside a finite aquifer give zero. `vertical` bounds the z axis as for patchiConcentration.
 */
export function patchiGrid(
  input: WexlerInput,
  xs: readonly number[],
  ys: readonly number[],
  z: number,
  time: number,
  panelsPerDecade = BASE_PANELS_PER_DECADE,
  loading?: readonly ConcentrationStep[],
  vertical?: VerticalBounds,
): number[][] {
  checkVertical(input, vertical);
  const bounds = boundsOf(undefined, vertical);
  if (loading) {
    const unit = { ...input, c0: 1 };
    return superposeLoadingGrid(loading, time, xs.length, ys.length, (tau) =>
      wexlerGrid(unit, xs, ys, z, tau, panelsPerDecade, bounds),
    );
  }
  return wexlerGrid(input, xs, ys, z, time, panelsPerDecade, bounds);
}

/** PATCHF on a plan-view grid (same shared time rule; reflected y and z profiles). */
export function patchfGrid(
  input: WexlerInput,
  xs: readonly number[],
  ys: readonly number[],
  z: number,
  time: number,
  aquifer: { width: number; thickness: number },
  panelsPerDecade = BASE_PANELS_PER_DECADE,
  loading?: readonly ConcentrationStep[],
): number[][] {
  const { y1, y2, z1, z2 } = input.patch;
  if (!(y1 >= 0 && y2 <= aquifer.width && z1 >= 0 && z2 <= aquifer.thickness)) {
    throw new RangeError('Patch must lie inside the aquifer');
  }
  if (loading) {
    const unit = { ...input, c0: 1 };
    return superposeLoadingGrid(loading, time, xs.length, ys.length, (tau) =>
      wexlerGrid(unit, xs, ys, z, tau, panelsPerDecade, boundsOf(aquifer)),
    );
  }
  return wexlerGrid(input, xs, ys, z, time, panelsPerDecade, boundsOf(aquifer));
}

function wexlerGrid(
  input: WexlerInput,
  xs: readonly number[],
  ys: readonly number[],
  z: number,
  time: number,
  panelsPerDecade: number,
  bounds: Bounds = {},
): number[][] {
  const r = retarded(input);
  const { y1, y2, z1, z2 } = input.patch;
  // receptors outside the bounded domain carry no concentration (same as patchfConcentration)
  const outside = (y: number): boolean => outsideBounds({ x: 0, y, z }, bounds);
  const xmax = Math.max(0, ...xs);
  const upper = time === Infinity ? integralUpperLimit(xmax, r) : time;
  const xPos = xs.filter((x) => x > 0);
  const tauMax = r.u > 0 && xPos.length > 0 ? Math.min(upper, Math.max(...xPos) / r.u) : 0;
  const rule = panelRule(0, upper, peakFollowingDensity(panelsPerDecade, r.u, r.dx, tauMax));
  const n = rule.tau.length;
  const wy = new Float64Array(n);
  const fz = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const tau = rule.tau[k]!;
    wy[k] = 2 * Math.sqrt(r.dy * tau);
    const wz = 2 * Math.sqrt(r.dz * tau);
    const zf = zProfile(z, z1, z2, wz, bounds);
    fz[k] = zf * rule.weight[k]! * Math.exp(-r.k * tau);
  }
  const fy = ys.map((y) => {
    const row = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      row[k] = yProfile(y, y1, y2, wy[k]!, bounds) * fz[k]!;
    }
    return row;
  });
  return xs.map((x) => {
    if (x < 0) return ys.map(() => 0);
    if (x === 0) return ys.map((y) => (outside(y) ? 0 : inflowPlane(input, { x, y, z }, bounds)));
    const g = new Float64Array(n);
    const norm = x / (2 * Math.sqrt(Math.PI * r.dx));
    for (let k = 0; k < n; k++) {
      const tau = rule.tau[k]!;
      g[k] = (norm * Math.exp(-((x - r.u * tau) ** 2) / (4 * r.dx * tau))) / Math.pow(tau, 1.5);
    }
    return ys.map((y, j) => {
      if (outside(y)) return 0;
      const f = fy[j]!;
      let sum = 0;
      for (let k = 0; k < n; k++) sum += g[k]! * f[k]!;
      return input.c0 * sum;
    });
  });
}
