import { integrateTanhSinh } from '../../numerics/quadrature.js';
import { axisDensity, panelRule, type Point3 } from './common.js';

export type { Point3 } from './common.js';

/**
 * AT123D-class Green's function solution of the three-dimensional advection-dispersion equation
 * (Yeh 1981) for uniform one-dimensional flow along x, an aquifer infinite in x and y, and either
 * infinite depth or a finite thickness with no-flux top and bottom (z measured from the base).
 *
 * Governing equation, written for the dissolved concentration C with retardation R and first-order
 * decay lambda acting on the total (dissolved plus sorbed) mass:
 *   dC/dt = (Dx/R) C_xx + (Dy/R) C_yy + (Dz/R) C_zz - (v/R) C_x - lambda C + source.
 * Any consistent unit system works; the library convention is metres, seconds, kilograms.
 */
export interface At123dAquifer {
  /** Seepage (pore-water) velocity along x. */
  velocity: number;
  porosity: number;
  /** Retardation factor R >= 1 (default 1). */
  retardation?: number;
  /** First-order decay rate lambda (default 0). */
  decayRate?: number;
  /** Dispersion coefficients (alpha * v + molecular diffusion), see dispersionCoefficients. */
  dx: number;
  dy: number;
  dz: number;
  /** Layer thickness. Omit for an infinitely deep aquifer. */
  thickness?: number;
}

/** Rectangular volume source (Galya 1987). Equal bounds in a direction make the source a plane, line or point. */
export interface BoxSource {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  z1: number;
  z2: number;
}

/** Constant mass release rate between start and end (end may be Infinity for a continuous source). */
export interface LoadingStep {
  start: number;
  end: number;
  rate: number;
}

export interface At123dInput {
  aquifer: At123dAquifer;
  source: BoxSource;
  loading: readonly LoadingStep[];
  time: number;
}

export interface DispersionInput {
  alphaL: number;
  alphaT: number;
  alphaV: number;
  velocity: number;
  molecularDiffusion?: number;
}

/** D_i = alpha_i v + D_m. */
export function dispersionCoefficients(i: DispersionInput): {
  dx: number;
  dy: number;
  dz: number;
} {
  const dm = i.molecularDiffusion ?? 0;
  return {
    dx: i.alphaL * i.velocity + dm,
    dy: i.alphaT * i.velocity + dm,
    dz: i.alphaV * i.velocity + dm,
  };
}

/** Mass loading rate = source concentration x Darcy flux x source cross-section normal to the flow. */
export function massRateFromConcentration(
  concentration: number,
  darcyFlux: number,
  area: number,
): number {
  if (!(concentration >= 0) || !(darcyFlux >= 0) || !(area >= 0)) {
    throw new RangeError('Concentration, Darcy flux and area must be non-negative');
  }
  return concentration * darcyFlux * area;
}

/**
 * Well-screen average of a vertical profile over [zTop, zBottom] using the trapezoid rule, which
 * gives the two end points half weight.
 */
export function wellScreenAverage(
  profile: (z: number) => number,
  zTop: number,
  zBottom: number,
  intervals = 10,
): number {
  if (!(zBottom > zTop))
    throw new RangeError('Screen bottom must be below its top (zBottom > zTop)');
  const n = Math.max(1, Math.floor(intervals));
  const h = (zBottom - zTop) / n;
  let sum = 0.5 * (profile(zTop) + profile(zBottom));
  for (let i = 1; i < n; i++) sum += profile(zTop + i * h);
  return (sum * h) / (zBottom - zTop);
}

function checkGeometry(box: BoxSource): void {
  if (!(box.x2 >= box.x1 && box.y2 >= box.y1 && box.z2 >= box.z1)) {
    throw new RangeError('Source bounds must satisfy x1 <= x2, y1 <= y2, z1 <= z2');
  }
}

/**
 * Concentration at a point a time `tau` after an instantaneous release of mass `mass` spread
 * uniformly over the box. The unit-mass response is n R C = product of three axis profiles times
 * exp(-lambda tau).
 */
export function instantaneousBoxConcentration(
  aquifer: At123dAquifer,
  box: BoxSource,
  p: Point3,
  tau: number,
  mass = 1,
): number {
  const R = aquifer.retardation ?? 1;
  const lambda = aquifer.decayRate ?? 0;
  const u = aquifer.velocity / R;
  const wx = 2 * Math.sqrt((aquifer.dx / R) * tau);
  const wy = 2 * Math.sqrt((aquifer.dy / R) * tau);
  const wz = 2 * Math.sqrt((aquifer.dz / R) * tau);
  const fx = axisDensity(p.x - u * tau, box.x1, box.x2, wx);
  if (fx === 0) return 0;
  const fy = axisDensity(p.y, box.y1, box.y2, wy);
  if (fy === 0) return 0;
  const fz = axisDensity(p.z, box.z1, box.z2, wz, aquifer.thickness);
  return ((mass * Math.exp(-lambda * tau)) / (aquifer.porosity * R)) * fx * fy * fz;
}

/**
 * Concentration at `p` and `input.time` for piecewise-constant mass loading, by superposition of the
 * instantaneous response over each loading step (adaptive Gauss-Kronrod in the release age).
 */
export function at123dConcentration(input: At123dInput, p: Point3): number {
  checkGeometry(input.source);
  if (!(input.time >= 0)) throw new RangeError('Time must be non-negative');
  const { aquifer, source, time } = input;
  const R = aquifer.retardation ?? 1;
  const u = aquifer.velocity / R;
  // the age at which the advected source centre reaches the point is where the integrand peaks
  const xc = 0.5 * (source.x1 + source.x2);
  const peak = u > 0 ? (p.x - xc) / u : -1;
  let total = 0;
  for (const step of input.loading) {
    if (step.rate === 0) continue;
    const end = Math.min(step.end, time);
    if (!(end > step.start)) continue;
    const lo = time - end;
    const hi = time - step.start;
    const f = (tau: number): number => instantaneousBoxConcentration(aquifer, source, p, tau, 1);
    const cuts = peak > lo && peak < hi ? [lo, peak, hi] : [lo, hi];
    let sum = 0;
    for (let i = 0; i + 1 < cuts.length; i++) {
      sum += integrateTanhSinh(f, cuts[i]!, cuts[i + 1]!, {
        relTol: 1e-8,
        absTol: 0,
        maxDepth: 10,
      }).value;
    }
    total += step.rate * sum;
  }
  return total;
}

export interface GridOptions {
  /** Panels per decade of the shared time rule (default 24). */
  panelsPerDecade?: number;
}

/**
 * Plan-view concentration at height `z` for many (x, y) points at one time, using one time rule
 * shared by every point, which makes a 100 by 60 map cost a few erfc evaluations per node instead
 * of a full adaptive integral per point. Agrees with at123dConcentration to about 1e-5 relative.
 * Returns c[ix][iy].
 */
export function at123dGrid(
  input: At123dInput,
  xs: readonly number[],
  ys: readonly number[],
  z: number,
  options: GridOptions = {},
): number[][] {
  checkGeometry(input.source);
  const { aquifer, source, time } = input;
  const R = aquifer.retardation ?? 1;
  const lambda = aquifer.decayRate ?? 0;
  const u = aquifer.velocity / R;
  const out = xs.map(() => new Array<number>(ys.length).fill(0));
  for (const step of input.loading) {
    const end = Math.min(step.end, time);
    if (step.rate === 0 || !(end > step.start)) continue;
    const rule = panelRule(time - end, time - step.start, options.panelsPerDecade ?? 24);
    const n = rule.tau.length;
    const base = new Float64Array(n);
    const wx = new Float64Array(n);
    const wy = new Float64Array(n);
    const fz = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const tau = rule.tau[k]!;
      wx[k] = 2 * Math.sqrt((aquifer.dx / R) * tau);
      wy[k] = 2 * Math.sqrt((aquifer.dy / R) * tau);
      const wz = 2 * Math.sqrt((aquifer.dz / R) * tau);
      fz[k] = axisDensity(z, source.z1, source.z2, wz, aquifer.thickness);
      base[k] =
        (step.rate * rule.weight[k]! * Math.exp(-lambda * tau) * fz[k]!) / (aquifer.porosity * R);
    }
    const fy = ys.map((y) => {
      const row = new Float64Array(n);
      for (let k = 0; k < n; k++)
        row[k] = base[k] === 0 ? 0 : axisDensity(y, source.y1, source.y2, wy[k]!);
      return row;
    });
    xs.forEach((x, i) => {
      const fx = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        fx[k] = base[k] === 0 ? 0 : axisDensity(x - u * rule.tau[k]!, source.x1, source.x2, wx[k]!);
      }
      const row = out[i]!;
      for (let j = 0; j < ys.length; j++) {
        const f = fy[j]!;
        let sum = 0;
        for (let k = 0; k < n; k++) sum += base[k]! * fx[k]! * f[k]!;
        row[j] = (row[j] ?? 0) + sum;
      }
    });
  }
  return out;
}
