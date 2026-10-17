import { integrate } from '../../numerics/quadrature.js';
import { checkFinite, checkPositive, checkTimes, type SurfaceWaterWarning } from './checks.js';

/**
 * Modern mass discharge across the bank plane (`docs/methods/surface-water.md`, "Mass discharge across
 * the bank plane"): W(t) = q * integral over y in [-L_r/2, L_r/2], depth in [0, d] of C dy dz, with the
 * M1 concentration read at the plane, the Darcy flux q = n v of the M1 aquifer, and the flux-averaged
 * groundwater concentration C_gw = W / Q_gw with Q_gw = q d L_r (DEFAULT rulings 6 and 7).
 *
 * The concentration is given as a function of the position on the plane, so the caller maps the plane
 * (lateral offset y from the centreline, depth below the water table) to the coordinates of the M1
 * method it runs; the plane's x position is baked into that function. SI units throughout.
 */

/** Concentration at lateral offset y (m, from the centreline) and depth (m, below the water table) at time t (s). */
export type PlaneConcentration = (y: number, depth: number, t: number) => number;

export interface BankPlane {
  /** Reach length L_r, m (the plane spans y in [-L_r/2, L_r/2]). */
  reachLength: number;
  /** Discharge thickness d, m (the plane spans depth in [0, d]). */
  thickness: number;
  /** Darcy flux q = n v of the M1 aquifer, m/s. */
  darcyFlux: number;
  /** Half width of the "full" plane used for the reach-truncation check, m. Omit to skip that check. */
  fullHalfWidth?: number;
  /** Depth of the "full" plane used for the plume-underflow check, m. Omit to skip that check. */
  fullDepth?: number;
}

export interface PlaneQuadratureOptions {
  /** Relative tolerance of each one-dimensional adaptive pass. Default 1e-9. */
  relTol?: number;
  /** Equal panels per axis that the range is cut into before adapting (guards a narrow bump). Default 8. */
  panels?: number;
}

/** REACH fraction below which the reach is said to truncate the plume. */
export const REACH_TRUNCATION_LIMIT = 0.99;
/** Depth fraction below which the plume is said to pass beneath the water body. */
export const PLUME_UNDERFLOW_LIMIT = 0.95;

function panelled(
  f: (x: number) => number,
  lo: number,
  hi: number,
  panels: number,
  relTol: number,
): number {
  // an absolute floor scaled to the integrand keeps the adaptive passes from chasing rounding noise
  // where the field is essentially zero
  const samples = 4 * panels + 1;
  let top = 0;
  for (let i = 0; i < samples; i++)
    top = Math.max(top, Math.abs(f(lo + ((hi - lo) * i) / (samples - 1))));
  const h = (hi - lo) / panels;
  const absTol = relTol * 1e-3 * top * h;
  let sum = 0;
  for (let i = 0; i < panels; i++) {
    sum += integrate(f, lo + i * h, lo + (i + 1) * h, { relTol, absTol, maxDepth: 20 }).value;
  }
  return sum;
}

/** Integral of C dy dz over y in [yLo, yHi], depth in [0, depth], at time t (adaptive Gauss-Kronrod, nested). */
export function planeIntegral(
  c: PlaneConcentration,
  t: number,
  yLo: number,
  yHi: number,
  depth: number,
  opts: PlaneQuadratureOptions = {},
): number {
  const relTol = opts.relTol ?? 1e-9;
  const panels = Math.max(1, Math.floor(opts.panels ?? 8));
  return panelled(
    (y) => panelled((z) => c(y, z, t), 0, depth, panels, relTol),
    yLo,
    yHi,
    panels,
    relTol,
  );
}

export interface BankDischargeResult {
  times: number[];
  /** Advective mass discharge W(t) across the plane, kg/s. */
  discharge: number[];
  /** Groundwater flow through the plane Q_gw = q d L_r, m^3/s. */
  groundwaterFlow: number;
  /** Flux-averaged concentration W / Q_gw at each time, kg/m^3. */
  fluxAveragedConcentration: number[];
  /** Smallest share of the full-width discharge that the reach holds over the times (when checked). */
  reachFraction?: number;
  /** Smallest share of the full-depth discharge that lies above the discharge thickness (when checked). */
  depthFraction?: number;
  warnings: SurfaceWaterWarning[];
}

/**
 * W(t) = q * planeIntegral over the reach and the discharge thickness, at each sample time. When the plane
 * declares a full width and/or depth, the shares of the discharge inside the reach and above the
 * thickness are checked and warned (`surfaceWater.reach-truncates-plume`, `surfaceWater.plume-underflow`).
 */
export function bankPlaneDischarge(
  c: PlaneConcentration,
  plane: BankPlane,
  times: readonly number[],
  opts: PlaneQuadratureOptions = {},
): BankDischargeResult {
  checkPositive('reach length', plane.reachLength);
  checkPositive('discharge thickness', plane.thickness);
  checkPositive('Darcy flux', plane.darcyFlux);
  checkTimes(times);
  const half = plane.reachLength / 2;
  if (plane.fullHalfWidth !== undefined) {
    checkFinite('full plane half width', plane.fullHalfWidth);
    if (plane.fullHalfWidth < half) {
      throw new RangeError(
        'the full plane half width must not be smaller than half the reach length',
      );
    }
  }
  if (plane.fullDepth !== undefined) {
    checkFinite('full plane depth', plane.fullDepth);
    if (plane.fullDepth < plane.thickness) {
      throw new RangeError('the full plane depth must not be smaller than the discharge thickness');
    }
  }
  const groundwaterFlow = plane.darcyFlux * plane.thickness * plane.reachLength;
  const discharge: number[] = [];
  let reachFraction: number | undefined;
  let depthFraction: number | undefined;
  for (const t of times) {
    const inside = planeIntegral(c, t, -half, half, plane.thickness, opts);
    discharge.push(plane.darcyFlux * inside);
    if (!(inside > 0)) continue;
    let fullWidthAtThickness = inside;
    if (plane.fullHalfWidth !== undefined && plane.fullHalfWidth > half) {
      fullWidthAtThickness = planeIntegral(
        c,
        t,
        -plane.fullHalfWidth,
        plane.fullHalfWidth,
        plane.thickness,
        opts,
      );
    }
    if (plane.fullHalfWidth !== undefined) {
      const share = Math.min(1, inside / fullWidthAtThickness);
      reachFraction = reachFraction === undefined ? share : Math.min(reachFraction, share);
    }
    if (plane.fullDepth !== undefined && plane.fullDepth > plane.thickness) {
      const fullHalf = plane.fullHalfWidth ?? half;
      const fullPlane = planeIntegral(c, t, -fullHalf, fullHalf, plane.fullDepth, opts);
      const share = Math.min(1, fullWidthAtThickness / fullPlane);
      depthFraction = depthFraction === undefined ? share : Math.min(depthFraction, share);
    } else if (plane.fullDepth !== undefined) {
      depthFraction = 1;
    }
  }
  const warnings: SurfaceWaterWarning[] = [];
  if (reachFraction !== undefined && reachFraction < REACH_TRUNCATION_LIMIT) {
    warnings.push({
      code: 'surfaceWater.reach-truncates-plume',
      message: `the reach holds only ${(100 * reachFraction).toFixed(1)} percent of the full-width discharge`,
    });
  }
  if (depthFraction !== undefined && depthFraction < PLUME_UNDERFLOW_LIMIT) {
    warnings.push({
      code: 'surfaceWater.plume-underflow',
      message: `only ${(100 * depthFraction).toFixed(1)} percent of the full-depth discharge lies above the discharge thickness (the plume passes beneath the water body)`,
    });
  }
  return {
    times: [...times],
    discharge,
    groundwaterFlow,
    fluxAveragedConcentration: discharge.map((w) => w / groundwaterFlow),
    ...(reachFraction !== undefined ? { reachFraction } : {}),
    ...(depthFraction !== undefined ? { depthFraction } : {}),
    warnings,
  };
}
