import { GRAVITY, checkNonNeg, checkPos } from './units.js';

/**
 * Building and foundation coupling of Johnson and Ettinger (1991), in SI.
 * A = D_T A_B / (Q_B L_T), B = Q_soil / Q_B, xi = Q_soil L_crack / (D_crack A_crack).
 */

export interface JeBuildingInput {
  /** Overall effective diffusion coefficient from the source to the foundation, m^2/s. */
  DT: number;
  /** Area of the foundation in contact with soil, m^2. */
  AB: number;
  /** Building ventilation rate, m^3/s. */
  QB: number;
  /** Distance from the top of the source to the base of the foundation, m. */
  LT: number;
  /** Soil gas flow into the building, m^3/s (0 allowed). */
  Qsoil: number;
  /** Foundation thickness, m. */
  Lcrack: number;
  /** Effective diffusion coefficient of the crack, m^2/s. */
  Dcrack: number;
  /** Crack area, m^2. */
  Acrack: number;
  /** No foundation resistance (dirt floor): alpha = A / (1 + A). */
  dirtFloor?: boolean;
}

export interface JeAlphaResult {
  /** Attenuation coefficient: indoor air over source vapor concentration. */
  alpha: number;
  A: number;
  B: number;
  xi: number;
  /** The same building with Q_soil set to zero. */
  alphaDiffusionOnly: number;
}

/**
 * alpha = A / (1 + A e^-xi + (A/B)(1 - e^-xi)), evaluated overflow-free. (A/B)(1 - e^-xi) is written
 * as (A/C) g(xi) with C = D_crack A_crack / (Q_B L_crack) and g(xi) = (1 - e^-xi)/xi (g(0) = 1), which
 * is exact at Q_soil = 0 and needs no division by B.
 */
export function jeAlpha(p: JeBuildingInput): JeAlphaResult {
  checkPos('DT', p.DT);
  checkPos('AB', p.AB);
  checkPos('QB', p.QB);
  checkPos('LT', p.LT);
  checkNonNeg('Qsoil', p.Qsoil);
  const A = (p.DT * p.AB) / (p.QB * p.LT);
  const B = p.Qsoil / p.QB;
  if (p.dirtFloor) {
    const alpha = A / (1 + A);
    return { alpha, A, B, xi: 0, alphaDiffusionOnly: alpha };
  }
  checkPos('Lcrack', p.Lcrack);
  checkPos('Dcrack', p.Dcrack);
  checkPos('Acrack', p.Acrack);
  const invC = (p.QB * p.Lcrack) / (p.Dcrack * p.Acrack);
  const f = (qsoil: number): { alpha: number; xi: number } => {
    const xi = (qsoil * p.Lcrack) / (p.Dcrack * p.Acrack);
    const g = xi < 1e-8 ? 1 - xi / 2 : -Math.expm1(-xi) / xi;
    return { alpha: A / (1 + A * Math.exp(-xi) + A * invC * g), xi };
  };
  const full = f(p.Qsoil);
  return {
    alpha: full.alpha,
    A,
    B,
    xi: full.xi,
    alphaDiffusionOnly: f(0).alpha,
  };
}

/** Equivalent crack radius, m: r = eta A_B / X_crack. */
export function crackRadius(eta: number, AB: number, Xcrack: number): number {
  checkPos('eta', eta);
  checkPos('AB', AB);
  checkPos('Xcrack', Xcrack);
  return (eta * AB) / Xcrack;
}

export interface SoilGasFlowInput {
  /** Indoor-outdoor pressure difference, Pa. */
  dP: number;
  /** Soil vapor permeability, m^2. */
  kv: number;
  /** Air viscosity, Pa s. */
  mu: number;
  /** Floor-wall seam length, m. */
  Xcrack: number;
  /** Depth of the cracks below grade, m. */
  Zcrack: number;
  /** Equivalent crack radius, m. */
  rcrack: number;
}

/** Cylinder-sink soil gas flow into the building, m^3/s: 2 pi dP k X / (mu ln(2 Z / r)). */
export function soilGasFlow(p: SoilGasFlowInput): number {
  checkNonNeg('dP', p.dP);
  checkNonNeg('kv', p.kv);
  checkPos('mu', p.mu);
  checkPos('Xcrack', p.Xcrack);
  checkPos('Zcrack', p.Zcrack);
  checkPos('rcrack', p.rcrack);
  const arg = (2 * p.Zcrack) / p.rcrack;
  if (!(arg > 1)) {
    throw new RangeError(`crack depth must exceed half the crack radius (2 Z / r = ${arg} <= 1)`);
  }
  return (2 * Math.PI * p.dP * p.kv * p.Xcrack) / (p.mu * Math.log(arg));
}

/** Soil vapor permeability from hydraulic conductivity: k = K mu_w / (rho_w g), m^2. */
export function permeabilityFromConductivity(K: number, muWater: number, rhoWater: number): number {
  checkNonNeg('K', K);
  checkPos('muWater', muWater);
  checkPos('rhoWater', rhoWater);
  return (K * muWater) / (rhoWater * GRAVITY);
}
