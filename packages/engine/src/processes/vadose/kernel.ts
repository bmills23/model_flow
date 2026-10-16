import { erf, expErfc } from '../../numerics/special.js';
import { integrate, integrateTanhSinh } from '../../numerics/quadrature.js';

/**
 * One-dimensional leachate transport below a depleting source, SI units:
 *
 *   R dC/dt = D d2C/dx2 - v dC/dx - mu C,   C(x, 0) = 0,   C(0, t) = c0 exp(-gamma t),
 *
 * with a zero gradient at great depth. This is case C13 of van Genuchten and Alves (1982) with zero
 * initial and constant parts and no production; decay acts on the dissolved phase only.
 */
export interface C13Params {
  /** Seepage velocity, m/s. */
  v: number;
  /** Dispersion coefficient, m^2/s (> 0). */
  D: number;
  /** Retardation factor (>= 1 in practice; > 0 required). */
  R: number;
  /** First-order decay rate of the dissolved phase, 1/s. */
  mu: number;
  /** Source depletion rate, 1/s. */
  gamma: number;
  /** Inlet concentration at t = 0, kg/m^3. */
  c0: number;
}

export type C13Evaluation = 'closed-form' | 'convolution';

const SQRT_PI = Math.sqrt(Math.PI);

function check(p: C13Params): void {
  for (const [k, val] of Object.entries(p)) {
    if (!Number.isFinite(val)) throw new RangeError(`${k} must be finite, got ${val}`);
  }
  if (!(p.v > 0)) throw new RangeError(`v must be positive, got ${p.v}`);
  if (!(p.D > 0)) throw new RangeError(`D must be positive, got ${p.D}`);
  if (!(p.R > 0)) throw new RangeError(`R must be positive, got ${p.R}`);
  if (p.mu < 0) throw new RangeError(`mu must not be negative, got ${p.mu}`);
  if (p.gamma < 0) throw new RangeError(`gamma must not be negative, got ${p.gamma}`);
}

/** w^2 = v^2 + 4 D (mu - gamma R); the closed form needs w^2 >= 0. */
export function c13W2(p: C13Params): number {
  return p.v * p.v + 4 * p.D * (p.mu - p.gamma * p.R);
}

/** Which evaluation {@link c13Concentration} uses for these parameters. */
export function c13Evaluation(p: C13Params): C13Evaluation {
  return c13W2(p) >= 0 ? 'closed-form' : 'convolution';
}

/**
 * Closed form (van Genuchten and Alves 1982, case C13), valid when w^2 >= 0:
 * C = c0 e^(-gamma t) / 2 [e^((v-w)x/2D) erfc((Rx - wt)/s) + e^((v+w)x/2D) erfc((Rx + wt)/s)],
 * s = 2 sqrt(D R t). The depletion factor is folded into each exponent so nothing overflows.
 */
export function c13ClosedForm(p: C13Params, x: number, t: number): number {
  check(p);
  if (!(x >= 0) || !(t >= 0)) throw new RangeError('x and t must be >= 0');
  if (t === 0) return x === 0 ? p.c0 : 0;
  if (x === 0) return p.c0 * Math.exp(-p.gamma * t);
  const w2 = c13W2(p);
  if (w2 < 0) throw new RangeError('closed form needs v^2 + 4 D (mu - gamma R) >= 0');
  const w = Math.sqrt(w2);
  const s = 2 * Math.sqrt(p.D * p.R * t);
  const a1 = ((p.v - w) * x) / (2 * p.D) - p.gamma * t;
  const a2 = ((p.v + w) * x) / (2 * p.D) - p.gamma * t;
  const b1 = (p.R * x - w * t) / s;
  const b2 = (p.R * x + w * t) / s;
  return 0.5 * p.c0 * (expErfc(a1, b1) + expErfc(a2, b2));
}

/**
 * The same solution as a Duhamel convolution of the inlet history with the first-type impulse
 * response, valid for any gamma:
 * C = c0 int_0^t e^(-gamma (t - tau)) x / (2 sqrt(pi D' tau^3)) exp(-(x - v' tau)^2 / (4 D' tau)
 *     - (mu / R) tau) dtau, with D' = D / R and v' = v / R.
 */
export function c13Convolution(p: C13Params, x: number, t: number): number {
  check(p);
  if (!(x >= 0) || !(t >= 0)) throw new RangeError('x and t must be >= 0');
  if (t === 0) return x === 0 ? p.c0 : 0;
  if (x === 0) return p.c0 * Math.exp(-p.gamma * t);
  const Dp = p.D / p.R;
  const vp = p.v / p.R;
  const k = p.mu / p.R;
  const pre = x / (2 * Math.sqrt(Math.PI * Dp));
  const f = (tau: number): number => {
    const d = x - vp * tau;
    return (
      pre *
      Math.pow(tau, -1.5) *
      Math.exp(-p.gamma * (t - tau) - (d * d) / (4 * Dp * tau) - k * tau)
    );
  };
  // Split at the advective arrival and one spreading width either side, so tanh-sinh clusters
  // nodes around the peak of the impulse response as well as at the ends.
  const arrival = x / vp;
  const width = Math.sqrt(2 * Dp * arrival) / vp;
  const cuts = [0, arrival - 3 * width, arrival, arrival + 3 * width, t]
    .filter((c) => c >= 0 && c <= t)
    .sort((a, b) => a - b);
  let sum = 0;
  for (let j = 0; j + 1 < cuts.length; j++) {
    const lo = cuts[j]!;
    const hi = cuts[j + 1]!;
    if (hi > lo) sum += integrateTanhSinh(f, lo, hi, { relTol: 1e-13, absTol: 0 }).value;
  }
  return p.c0 * sum;
}

/** C(x, t), closed form where w is real and the convolution otherwise. */
export function c13Concentration(p: C13Params, x: number, t: number): number {
  return c13Evaluation(p) === 'closed-form' ? c13ClosedForm(p, x, t) : c13Convolution(p, x, t);
}

/** e^(-y^2) erfi(y) = (2 / sqrt(pi)) int_0^y e^(s^2 - y^2) ds (twice Dawson's integral). */
function scaledErfi(y: number): number {
  if (y === 0) return 0;
  const r = integrate((s) => Math.exp((s - y) * (s + y)), 0, y, {
    relTol: 1e-13,
    absTol: 1e-16 * y,
  });
  return (2 / SQRT_PI) * r.value;
}

/**
 * Analytic dC/dx at the inlet (x = 0), kg/m^4. Differentiating the closed form gives
 * c0 e^(-gamma t) / 2 [v/D - (w/D) erf(z) - 4R/(s sqrt(pi)) e^(-z^2)], z = w t / s. The solution is
 * even in w, so for w^2 < 0 (w = i omega) the same expression continues to
 * c0 e^(-gamma t) / 2 [v/D + (omega/D) erfi(y) - 4R/(s sqrt(pi)) e^(y^2)], y = omega t / s,
 * which stays bounded because y^2 < gamma t.
 */
export function c13InletGradient(p: C13Params, t: number): number {
  check(p);
  if (!(t > 0)) throw new RangeError(`t must be > 0, got ${t}`);
  const s = 2 * Math.sqrt(p.D * p.R * t);
  const w2 = c13W2(p);
  const g = Math.exp(-p.gamma * t);
  if (w2 >= 0) {
    const w = Math.sqrt(w2);
    const z = (w * t) / s;
    const bracket = p.v / p.D - (w / p.D) * erf(z) - ((4 * p.R) / (s * SQRT_PI)) * Math.exp(-z * z);
    return 0.5 * p.c0 * g * bracket;
  }
  const omega = Math.sqrt(-w2);
  const y = (omega * t) / s;
  const e = Math.exp(y * y - p.gamma * t);
  const bracket =
    (p.v / p.D) * g + (omega / p.D) * scaledErfi(y) * e - ((4 * p.R) / (s * SQRT_PI)) * e;
  return 0.5 * p.c0 * bracket;
}

/**
 * Cumulative dispersive influx per unit area across the inlet, int_0^t -theta D dC/dx(0, tau) dtau,
 * kg/m^2. The integrand behaves like tau^(-1/2) at zero, which tanh-sinh handles.
 */
export function c13DispersiveInflux(p: C13Params, theta: number, t: number): number {
  if (!(t > 0)) return 0;
  const r = integrateTanhSinh((tau) => -theta * p.D * c13InletGradient(p, tau), 0, t, {
    relTol: 1e-10,
    absTol: 0,
  });
  return r.value;
}
