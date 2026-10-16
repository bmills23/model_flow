import { expErfc } from '../../numerics/special.js';
import { integrateTanhSinh } from '../../numerics/quadrature.js';
import { c13Concentration, type C13Params } from './kernel.js';

/**
 * One-dimensional leachate transport below a depleting source with a flux-type (third-type) inlet,
 * SI units:
 *
 *   R dC/dt = D d2C/dx2 - v dC/dx - mu C,   C(x, 0) = 0,
 *   (-D dC/dx + v C)(0, t) = v c0 exp(-gamma t),   dC/dx(inf, t) = 0.
 *
 * This is case C14 of van Genuchten and Alves (1982) with zero initial and constant parts and no
 * production (C_i = C_a = 0, C_b = c0, lambda = gamma). C is the resident (pore-water)
 * concentration. The parameters are the same as for case C13.
 */
export type C14Evaluation = 'closed-form' | 'convolution';

/**
 * |v - w| / v below which the general closed form is not used (its two 1/(v - w) terms cancel and
 * lose about log10(v / |v - w|) digits); the convolution is used there instead, except at
 * mu = gamma R exactly, where the bulletin's own second expression applies.
 */
const NEAR_SINGULAR = 1e-3;

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

function checkXT(x: number, t: number): void {
  if (!(x >= 0) || !(t >= 0) || !Number.isFinite(x) || !Number.isFinite(t)) {
    throw new RangeError('x and t must be finite and >= 0');
  }
}

/** Which evaluation {@link c14Concentration} uses for these parameters. */
export function c14Evaluation(p: C13Params): C14Evaluation {
  const delta = p.mu - p.gamma * p.R;
  if (delta === 0) return 'closed-form';
  const w2 = p.v * p.v + 4 * p.D * delta;
  if (w2 < 0) return 'convolution';
  return Math.abs(p.v - Math.sqrt(w2)) >= NEAR_SINGULAR * p.v ? 'closed-form' : 'convolution';
}

/**
 * Closed form of case C14 (van Genuchten and Alves 1982, printed pages 79 and 80). With
 * s = 2 sqrt(D R t), w = sqrt(v^2 + 4 D (mu - gamma R)) and mu != gamma R:
 *
 *   C = c0 { e^(-gamma t) [ v/(v+w) e^((v-w)x/2D) erfc((Rx - wt)/s)
 *                         + v/(v-w) e^((v+w)x/2D) erfc((Rx + wt)/s) ]
 *          + v^2 / (2D(mu - gamma R)) e^(vx/D - mu t/R) erfc((Rx + vt)/s) }.
 *
 * At mu = gamma R it is C = c0 (e^(-gamma t) - A(x, t)), which reduces to
 *
 *   C = c0 { e^(-gamma t) [ erfc((Rx - vt)/s)/2 + sqrt(v^2 t/(pi D R)) e^(-(Rx - vt)^2/s^2) ]
 *          - (1/2)(1 + vx/D + v^2 t/(D R)) e^(vx/D - mu t/R) erfc((Rx + vt)/s) }.
 *
 * Every exp(a) erfc(b) product is evaluated through the scaled complementary error function.
 */
export function c14ClosedForm(p: C13Params, x: number, t: number): number {
  check(p);
  checkXT(x, t);
  if (t === 0) return 0;
  const { v, D, R, mu, gamma, c0 } = p;
  const s = 2 * Math.sqrt(D * R * t);
  const delta = mu - gamma * R;
  const b2 = (R * x + v * t) / s;
  if (delta === 0) {
    const b1 = (R * x - v * t) / s;
    const first =
      0.5 * expErfc(-gamma * t, b1) +
      Math.sqrt((v * v * t) / (Math.PI * D * R)) * Math.exp(-gamma * t - b1 * b1);
    const last =
      0.5 * (1 + (v * x) / D + (v * v * t) / (D * R)) * expErfc((v * x) / D - (mu * t) / R, b2);
    return c0 * (first - last);
  }
  const w2 = v * v + 4 * D * delta;
  if (w2 < 0) throw new RangeError('closed form needs v^2 + 4 D (mu - gamma R) >= 0');
  const w = Math.sqrt(w2);
  const t1 = (v / (v + w)) * expErfc(((v - w) * x) / (2 * D) - gamma * t, (R * x - w * t) / s);
  const t2 = (v / (v - w)) * expErfc(((v + w) * x) / (2 * D) - gamma * t, (R * x + w * t) / s);
  const t3 = ((v * v) / (2 * D * delta)) * expErfc((v * x) / D - (mu * t) / R, b2);
  return c0 * (t1 + t2 + t3);
}

/**
 * The same solution as a Duhamel convolution of the inlet history with the flux-type impulse
 * response, valid for any gamma. With D' = D/R, v' = v/R and k = mu/R,
 *
 *   C = c0 int_0^t e^(-gamma (t - tau)) e^(-k tau) g(x, tau) dtau,
 *   g = v'/sqrt(pi D' tau) e^(-(x - v' tau)^2/(4 D' tau))
 *       - (v'^2 / (2 D')) e^(v x / D) erfc((x + v' tau)/(2 sqrt(D' tau))),
 *
 * where g is the time derivative of the constant-input flux-type solution without decay.
 */
export function c14Convolution(p: C13Params, x: number, t: number): number {
  check(p);
  checkXT(x, t);
  if (t === 0) return 0;
  const Dp = p.D / p.R;
  const vp = p.v / p.R;
  const k = p.mu / p.R;
  const pe = (p.v * x) / p.D;
  const f = (tau: number): number => {
    const lead = -p.gamma * (t - tau) - k * tau;
    const sq = Math.sqrt(Dp * tau);
    const d = x - vp * tau;
    const pulse = (vp / Math.sqrt(Math.PI * Dp * tau)) * Math.exp(lead - (d * d) / (4 * Dp * tau));
    const tail = ((vp * vp) / (2 * Dp)) * expErfc(lead + pe, (x + vp * tau) / (2 * sq));
    return pulse - tail;
  };
  const arrival = x / vp;
  const width = x > 0 ? Math.sqrt(2 * Dp * arrival) / vp : 0;
  const cuts = [0, arrival - 3 * width, arrival, arrival + 3 * width, t]
    .filter((c) => c >= 0 && c <= t)
    .sort((a, b) => a - b);
  let sum = 0;
  for (let j = 0; j + 1 < cuts.length; j++) {
    const lo = cuts[j]!;
    const hi = cuts[j + 1]!;
    if (hi > lo) sum += integrateTanhSinh(f, lo, hi, { relTol: 1e-13, absTol: 0 }).value;
  }
  return p.c0 * Math.max(sum, 0);
}

/** Resident concentration C(x, t) for the flux-type inlet. */
export function c14Concentration(p: C13Params, x: number, t: number): number {
  return c14Evaluation(p) === 'closed-form' ? c14ClosedForm(p, x, t) : c14Convolution(p, x, t);
}

/**
 * Total (advective plus dispersive) flux per unit area across depth x, kg/m^2/s, for a column with
 * water content theta: theta (v C - D dC/dx). The flux-averaged concentration C - (D/v) dC/dx
 * obeys the same constant-coefficient equation, starts at zero, and equals c0 exp(-gamma t) at
 * x = 0 by the inlet condition, so it is the first-type (case C13) solution with the same
 * parameters. The flux is therefore theta v times that solution.
 */
export function c14TotalFlux(p: C13Params, theta: number, x: number, t: number): number {
  if (!(theta > 0) || !Number.isFinite(theta)) throw new RangeError('theta must be > 0');
  return theta * p.v * c13Concentration(p, x, t);
}
