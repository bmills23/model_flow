import { erf, erfc } from '../../numerics/special.js';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

const SQRT_PI = Math.sqrt(Math.PI);

/**
 * (1/2)[erf((s - a) / w) - erf((s - b) / w)] for a < b, written with erfc in the tails so the
 * difference keeps its relative precision. w = 2 sqrt(D t) is the spreading width; w = 0 gives the
 * sharp indicator of the interval (one half on the end points).
 */
export function slab(s: number, a: number, b: number, w: number): number {
  if (w === 0) {
    if (s > a && s < b) return 1;
    return s === a || s === b ? 0.5 : 0;
  }
  const p = (s - a) / w;
  const q = (s - b) / w;
  // saturated tails: erfc(6) is about 2e-17, so skip the function calls
  if (q > 6 || p < -6) return 0;
  if (p > 6 && q < -6) return 1;
  if (q > 0) return 0.5 * (erfc(q) - erfc(p));
  if (p < 0) return 0.5 * (erfc(-p) - erfc(-q));
  return 0.5 * (erf(p) - erf(q));
}

/** Gaussian kernel of a point release spread by width w (integral over s equals 1). */
function gauss(s: number, a: number, w: number): number {
  if (w === 0) return s === a ? Infinity : 0;
  const r = (s - a) / w;
  return Math.exp(-r * r) / (w * SQRT_PI);
}

/** Switch from the image series to the cosine series when D t / H^2 exceeds this value. */
export const IMAGE_SERIES_LIMIT = 0.2;

/**
 * Concentration profile along one axis, per unit released mass, for a uniform release over [a, b]
 * (a point release when a = b), spread by width w = 2 sqrt(D t). The profile integrates to one over
 * the axis. With `length` (layer thickness or width) the axis is [0, length] with no-flux ends:
 * an image series for short times and a cosine series for long times (they agree to rounding).
 */
export function axisDensity(s: number, a: number, b: number, w: number, length?: number): number {
  const span = b - a;
  const open = (lo: number, hi: number): number =>
    span === 0 ? gauss(s, lo, w) : slab(s, lo, hi, w) / span;
  if (length === undefined) return open(a, b);
  const dt = (w * w) / 4; // D t
  if (w === 0 || dt / (length * length) <= IMAGE_SERIES_LIMIT) {
    // only images whose smoothed interval reaches s matter: slab() saturates beyond 6 widths
    const reach = 6 * w;
    let sum = 0;
    const lo1 = Math.ceil((s - b - reach) / (2 * length));
    const hi1 = Math.floor((s - a + reach) / (2 * length));
    for (let n = lo1; n <= hi1; n++) sum += open(a + 2 * n * length, b + 2 * n * length);
    const lo2 = Math.ceil((s + a - reach) / (2 * length));
    const hi2 = Math.floor((s + b + reach) / (2 * length));
    for (let n = lo2; n <= hi2; n++) sum += open(-b + 2 * n * length, -a + 2 * n * length);
    return sum;
  }
  const g = (Math.PI * w) / (2 * length);
  let sum = 1;
  for (let n = 1; n < 400; n++) {
    const damp = Math.exp(-n * n * g * g);
    if (damp < 1e-18) break;
    const k = (n * Math.PI) / length;
    const mode = span === 0 ? Math.cos(k * a) : (Math.sin(k * b) - Math.sin(k * a)) / (k * span);
    sum += 2 * Math.cos(k * s) * mode * damp;
  }
  return sum / length;
}

const GL6_X = [0.2386191860831969, 0.6612093864662645, 0.9324695142031521] as const;
const GL6_W = [0.467913934572691, 0.3607615730481386, 0.1713244923791704] as const;

export interface PanelRule {
  tau: Float64Array;
  weight: Float64Array;
}

/**
 * Composite 6-point Gauss-Legendre rule on [lo, hi] with panels that grow geometrically away from
 * `lo` (ratio 10^(1/panelsPerDecade)) from a first panel of 1e-7 of the range. The geometric
 * spacing resolves features at every time scale with a single fixed set of nodes, so the nodes can
 * be shared across all points of a plan-view grid.
 */
export function panelRule(lo: number, hi: number, panelsPerDecade = 24): PanelRule {
  const range = hi - lo;
  const ratio = Math.pow(10, 1 / panelsPerDecade);
  const edges = [0];
  let e = range * 1e-7;
  while (e < range) {
    edges.push(e);
    e *= ratio;
  }
  edges.push(range);
  const tau: number[] = [];
  const weight: number[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i]!;
    const b = edges[i + 1]!;
    const mid = 0.5 * (a + b);
    const half = 0.5 * (b - a);
    for (let j = 0; j < 3; j++) {
      tau.push(lo + mid - half * GL6_X[j]!, lo + mid + half * GL6_X[j]!);
      weight.push(half * GL6_W[j]!, half * GL6_W[j]!);
    }
  }
  return { tau: Float64Array.from(tau), weight: Float64Array.from(weight) };
}
