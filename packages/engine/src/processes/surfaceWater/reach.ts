import { brent } from '../../numerics/roots.js';
import { erf } from '../../numerics/special.js';
import { checkPositive } from './checks.js';

/**
 * Impacted reach length from the steady Domenico (1987) plume width: the full width between the two points
 * where the lateral factor falls to 5 percent of its centreline value (RISC5 choice, methods note).
 */

export interface DomenicoReachInput {
  /** Source width Y, m. */
  sourceWidth: number;
  /** Distance from the downgradient source face to the bank x_s, m. */
  distance: number;
  /** Transverse dispersivity alpha_y, m. Default RISC5's own: alpha_x / 3 with alpha_x = 0.1 x_s. */
  transverseDispersivity?: number;
  /** Fraction of the centreline value that bounds the width. Default 0.05. */
  fraction?: number;
}

/** L_r = 2 y*, with g(y*) / g(0) = fraction. */
export function domenicoReachLength(i: DomenicoReachInput): number {
  checkPositive('source width', i.sourceWidth);
  checkPositive('distance to the bank', i.distance);
  const alphaY = i.transverseDispersivity ?? (0.1 * i.distance) / 3;
  checkPositive('transverse dispersivity', alphaY);
  const fraction = i.fraction ?? 0.05;
  if (!(fraction > 0 && fraction < 1)) throw new RangeError('fraction must be in (0, 1)');
  const half = i.sourceWidth / 2;
  const s = 2 * Math.sqrt(alphaY * i.distance);
  const g = (y: number): number => erf((y + half) / s) - erf((y - half) / s);
  const g0 = g(0);
  const root = brent((y) => g(y) / g0 - fraction, 0, half + 20 * Math.sqrt(alphaY * i.distance), {
    tol: 1e-12,
  }).root;
  return 2 * root;
}
