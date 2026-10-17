import { finite, nonNeg, pos } from '../saturatedSource/checks.js';

export { finite, nonNeg, pos };

/** Value must lie in the closed interval [0, 1]. */
export function fraction(name: string, x: number): void {
  finite(name, x);
  if (!(x >= 0 && x <= 1)) throw new RangeError(`${name} must be in [0, 1], got ${x}`);
}
