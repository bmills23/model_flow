import stdErf from '@stdlib/math-base-special-erf';
import stdErfc from '@stdlib/math-base-special-erfc';
import stdErfcx from '@stdlib/math-base-special-erfcx';

/** Error function. */
export function erf(x: number): number {
  return stdErf(x);
}

/** Complementary error function, accurate in the tail. */
export function erfc(x: number): number {
  return stdErfc(x);
}

/** Scaled complementary error function exp(x^2) erfc(x). */
export function erfcx(x: number): number {
  return stdErfcx(x);
}

/**
 * exp(a) * erfc(b) computed without overflowing exp(a) when the product is representable.
 * Terms of this shape appear throughout the analytical advection-dispersion solutions
 * (van Genuchten and Alves 1982; Wexler 1992), where a and b^2 are large and nearly equal.
 */
export function expErfc(a: number, b: number): number {
  if (b < 0) return Math.exp(a) * stdErfc(b);
  return Math.exp(a - b * b) * stdErfcx(b);
}

/** Standard normal distribution function Phi(z), accurate in both tails. */
export function normalCdf(z: number): number {
  return 0.5 * stdErfc(-z / Math.SQRT2);
}

function poly(c: readonly number[], r: number): number {
  // c holds ascending coefficients; Horner from the highest.
  let v = 0;
  for (let i = c.length - 1; i >= 0; i--) v = v * r + (c[i] as number);
  return v;
}

// Coefficients of Wichura (1988), algorithm AS 241 (PPND16), ascending order.
const A = [
  3.3871328727963665, 133.14166789178438, 1971.5909503065513, 13731.69376550946, 45921.95393154987,
  67265.7709270087, 33430.57558358813, 2509.0809287301227,
];
const B = [
  1, 42.31333070160091, 687.1870074920579, 5394.196021424751, 21213.794301586597, 39307.89580009271,
  28729.085735721943, 5226.495278852854,
];
const C = [
  1.4234371107496835, 4.630337846156546, 5.769497221460691, 3.6478483247632045, 1.2704582524523684,
  0.2417807251774506, 0.022723844989269184, 7.745450142783414e-4,
];
const D = [
  1, 2.053191626637759, 1.6763848301838038, 0.6897673349851, 0.14810397642748008,
  0.015198666563616457, 5.475938084995345e-4, 1.0507500716444169e-9,
];
const E = [
  6.657904643501103, 5.463784911164114, 1.7848265399172913, 0.29656057182850487,
  0.026532189526576124, 0.0012426609473880784, 2.7115555687434876e-5, 2.0103343992922881e-7,
];
const F = [
  1, 0.599832206555888, 0.1369298809227358, 0.014875361290850615, 7.868691311456133e-4,
  1.8463183175100548e-5, 1.421511758316446e-7, 2.0442631033899397e-15,
];

/**
 * Inverse of the standard normal distribution function, Wichura's algorithm AS 241 (PPND16,
 * about 1e-16 relative accuracy). Returns -Infinity at 0, Infinity at 1 and NaN outside [0, 1].
 */
export function normalQuantile(p: number): number {
  if (!(p >= 0 && p <= 1)) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (q * poly(A, r)) / poly(B, r);
  }
  let r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p));
  let val: number;
  if (r <= 5) {
    r -= 1.6;
    val = poly(C, r) / poly(D, r);
  } else {
    r -= 5;
    val = poly(E, r) / poly(F, r);
  }
  return q < 0 ? -val : val;
}
