import { brent } from '../../numerics/roots.js';

/** Soil hydraulic parameters of one layer, SI (Ks in m/s, water contents dimensionless). */
export interface HydraulicLayer {
  thetaS: number;
  thetaR: number;
  /** van Genuchten shape parameter n (> 1). */
  n: number;
  Ks: number;
}

export type HydraulicModel = 'brooksCorey1964' | 'vanGenuchten1980';

export interface UnitGradientMoisture {
  theta: number;
  Se: number;
  /** Seepage velocity, m/s: min(q, Ks) / theta. */
  v: number;
  /** True when q >= Ks, so the soil is saturated and q was reduced to Ks. */
  clamped: boolean;
}

function finite(name: string, x: number): void {
  if (!Number.isFinite(x)) throw new RangeError(`${name} must be finite, got ${x}`);
}

function checkN(n: number): void {
  finite('n', n);
  if (!(n > 1)) throw new RangeError(`van Genuchten n must exceed 1, got ${n}`);
}

function checkSe(Se: number): void {
  finite('Se', Se);
  if (Se < 0 || Se > 1) throw new RangeError(`effective saturation must be in [0, 1], got ${Se}`);
}

function checkKr(kr: number): void {
  finite('kr', kr);
  if (kr < 0 || kr > 1) throw new RangeError(`relative conductivity must be in [0, 1], got ${kr}`);
}

function checkLambda(lambda: number): void {
  finite('lambda', lambda);
  if (!(lambda > 0)) throw new RangeError(`pore-size index must be positive, got ${lambda}`);
}

/**
 * Brooks-Corey pore-size index matched to a van Genuchten curve by equating the differential
 * saturation capacity at Se = 0.5 (Lenhard et al. 1989 principle):
 * lambda = (n - 1)(1 - 0.5^(n/(n - 1))).
 */
export function lenhardLambda(n: number): number {
  checkN(n);
  return (n - 1) * (1 - Math.pow(0.5, n / (n - 1)));
}

/** Brooks-Corey wetting-phase relative conductivity, Se^((2 + 3 lambda) / lambda). */
export function brooksCoreyKr(Se: number, lambda: number): number {
  checkSe(Se);
  checkLambda(lambda);
  return Math.pow(Se, (2 + 3 * lambda) / lambda);
}

/** Inverse of {@link brooksCoreyKr}: Se = kr^(lambda / (2 + 3 lambda)). */
export function brooksCoreySe(kr: number, lambda: number): number {
  checkKr(kr);
  checkLambda(lambda);
  return Math.pow(kr, lambda / (2 + 3 * lambda));
}

/** Mualem-van Genuchten relative conductivity, Se^(1/2) [1 - (1 - Se^(1/m))^m]^2, m = 1 - 1/n. */
export function mualemVanGenuchtenKr(Se: number, n: number): number {
  checkSe(Se);
  checkN(n);
  if (Se === 0) return 0;
  if (Se === 1) return 1;
  const m = 1 - 1 / n;
  const x = Math.pow(Se, 1 / m);
  // 1 - (1 - x)^m without cancellation for small x
  const inner = -Math.expm1(m * Math.log1p(-x));
  return Math.sqrt(Se) * inner * inner;
}

/** Inverse of {@link mualemVanGenuchtenKr} by Brent's method on (0, 1). */
export function mualemVanGenuchtenSe(kr: number, n: number): number {
  checkKr(kr);
  checkN(n);
  if (kr === 0) return 0;
  if (kr === 1) return 1;
  return brent((s) => mualemVanGenuchtenKr(s, n) - kr, 0, 1, { tol: 1e-15 }).root;
}

/**
 * Moisture under a unit hydraulic gradient: the Darcy flux equals the unsaturated conductivity,
 * so kr(Se) = q / Ks. At or above Ks the soil is saturated and q is reduced to Ks.
 */
export function unitGradientMoisture(
  layer: HydraulicLayer,
  q: number,
  model: HydraulicModel,
): UnitGradientMoisture {
  const { thetaS, thetaR, n, Ks } = layer;
  finite('thetaS', thetaS);
  finite('thetaR', thetaR);
  finite('Ks', Ks);
  finite('q', q);
  if (!(thetaS > 0 && thetaS <= 1)) throw new RangeError(`thetaS must be in (0, 1], got ${thetaS}`);
  if (!(thetaR >= 0 && thetaR < thetaS)) {
    throw new RangeError(`thetaR must be in [0, thetaS), got ${thetaR}`);
  }
  checkN(n);
  if (!(Ks > 0)) throw new RangeError(`Ks must be positive, got ${Ks}`);
  if (q < 0) throw new RangeError(`infiltration q must not be negative, got ${q}`);
  if (q >= Ks) return { theta: thetaS, Se: 1, v: Ks / thetaS, clamped: true };
  const ratio = q / Ks;
  const Se =
    model === 'brooksCorey1964'
      ? brooksCoreySe(ratio, lenhardLambda(n))
      : mualemVanGenuchtenSe(ratio, n);
  const theta = thetaR + Se * (thetaS - thetaR);
  return { theta, Se, v: q / theta, clamped: false };
}
