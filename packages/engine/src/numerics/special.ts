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
