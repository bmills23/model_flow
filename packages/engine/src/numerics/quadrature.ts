export interface QuadratureOptions {
  /** Relative tolerance on the integral estimate. */
  relTol?: number;
  /** Absolute tolerance on the integral estimate. */
  absTol?: number;
  /** Maximum bisection depth (Gauss-Kronrod) or refinement level (tanh-sinh). */
  maxDepth?: number;
}

export interface QuadratureResult {
  value: number;
  errorEstimate: number;
  evaluations: number;
  converged: boolean;
}

type Integrand = (x: number) => number;

// Gauss-Kronrod 7-15 abscissae and weights (QUADPACK qk15).
const XGK = [
  0.9914553711208126, 0.9491079123427585, 0.8648644233597691, 0.7415311855993945,
  0.5860872354676911, 0.4058451513773972, 0.20778495500789848, 0.0,
];
const WGK = [
  0.022935322010529224, 0.06309209262997856, 0.10479001032225019, 0.14065325971552592,
  0.1690047266392679, 0.19035057806478542, 0.20443294007529889, 0.20948214108472782,
];
const WG = [0.1294849661688697, 0.27970539148927664, 0.3818300505051189, 0.4179591836734694];

function gk15(f: Integrand, a: number, b: number): { k: number; g: number } {
  const c = 0.5 * (a + b);
  const h = 0.5 * (b - a);
  const fc = f(c);
  let k = fc * (WGK[7] as number);
  let g = fc * (WG[3] as number);
  for (let j = 0; j < 7; j++) {
    const dx = h * (XGK[j] as number);
    const sum = f(c - dx) + f(c + dx);
    k += sum * (WGK[j] as number);
    if (j % 2 === 1) g += sum * (WG[(j - 1) / 2] as number);
  }
  return { k: k * h, g: g * h };
}

/**
 * Adaptive Gauss-Kronrod (7-15) quadrature on a finite interval. Bisects until the Kronrod
 * minus Gauss difference meets the tolerance on every subinterval.
 */
export function integrate(
  f: Integrand,
  a: number,
  b: number,
  opts: QuadratureOptions = {},
): QuadratureResult {
  if (a === b) return { value: 0, errorEstimate: 0, evaluations: 0, converged: true };
  if (a > b) {
    const r = integrate(f, b, a, opts);
    return { ...r, value: -r.value };
  }
  const relTol = opts.relTol ?? 1e-10;
  const absTol = opts.absTol ?? 1e-14;
  const maxDepth = opts.maxDepth ?? 50;
  let evaluations = 0;
  let converged = true;

  const recurse = (lo: number, hi: number, depth: number, tol: number): [number, number] => {
    const { k, g } = gk15(f, lo, hi);
    evaluations += 15;
    const err = Math.abs(k - g);
    if (err <= Math.max(tol, relTol * Math.abs(k)) || depth >= maxDepth) {
      if (depth >= maxDepth && err > Math.max(tol, relTol * Math.abs(k))) converged = false;
      return [k, err];
    }
    const mid = 0.5 * (lo + hi);
    const [v1, e1] = recurse(lo, mid, depth + 1, tol / 2);
    const [v2, e2] = recurse(mid, hi, depth + 1, tol / 2);
    return [v1 + v2, e1 + e2];
  };

  const [value, errorEstimate] = recurse(a, b, 0, absTol);
  return { value, errorEstimate, evaluations, converged };
}

/**
 * Tanh-sinh (double exponential) quadrature on a finite interval. Robust to integrable
 * endpoint singularities because abscissae never touch the endpoints.
 */
export function integrateTanhSinh(
  f: Integrand,
  a: number,
  b: number,
  opts: QuadratureOptions = {},
): QuadratureResult {
  if (a === b) return { value: 0, errorEstimate: 0, evaluations: 0, converged: true };
  if (a > b) {
    const r = integrateTanhSinh(f, b, a, opts);
    return { ...r, value: -r.value };
  }
  const relTol = opts.relTol ?? 1e-10;
  const absTol = opts.absTol ?? 1e-14;
  const maxLevel = opts.maxDepth ?? 12;
  const halfWidth = 0.5 * (b - a);
  const tMax = 4.5; // beyond this the weights underflow double precision
  let evaluations = 0;

  const term = (t: number): number => {
    const u = (Math.PI / 2) * Math.sinh(t);
    const ch = Math.cosh(u);
    const w = ((Math.PI / 2) * Math.cosh(t)) / (ch * ch);
    // Distance to the nearest endpoint is computed without cancellation so that abscissae
    // close to a or b keep full relative precision.
    const x =
      u < 0
        ? a + (2 * halfWidth) / (1 + Math.exp(-2 * u))
        : b - (2 * halfWidth) / (1 + Math.exp(2 * u));
    if (x <= a || x >= b || w === 0) return 0;
    evaluations += 1;
    const v = f(x);
    return Number.isFinite(v) ? w * v : 0;
  };

  let h = 1;
  let sum = term(0);
  for (let k = 1; k * h <= tMax; k++) sum += term(k * h) + term(-k * h);
  let estimate = sum * h * halfWidth;
  let errorEstimate = Math.abs(estimate);
  let converged = false;
  for (let level = 1; level <= maxLevel; level++) {
    h /= 2;
    for (let k = 1; k * h <= tMax; k += 2) sum += term(k * h) + term(-k * h);
    const next = sum * h * halfWidth;
    errorEstimate = Math.abs(next - estimate);
    estimate = next;
    if (errorEstimate <= Math.max(absTol, relTol * Math.abs(estimate))) {
      converged = true;
      break;
    }
  }
  return { value: estimate, errorEstimate, evaluations, converged };
}

/**
 * Integral over [a, infinity) through the substitution x = a + t / (1 - t), t in [0, 1),
 * evaluated with tanh-sinh so the compressed upper end is handled as an endpoint singularity.
 */
export function integrateSemiInfinite(
  f: Integrand,
  a: number,
  opts: QuadratureOptions = {},
): QuadratureResult {
  const g = (t: number): number => {
    const oneMinus = 1 - t;
    const x = a + t / oneMinus;
    const v = f(x);
    return Number.isFinite(v) ? v / (oneMinus * oneMinus) : 0;
  };
  return integrateTanhSinh(g, 0, 1, opts);
}
