/**
 * Longitudinal dispersivity (m) for leachate transport over a distance x (m) below the source, as
 * the two-branch log-log regression RISC5 attributes to the field data compiled by Gelhar et al.
 * (1985) (RISC5 choice; the coefficients are taken from RISC5's statement of its choice):
 *
 *   ln aL = -4.933 + 3.811 ln x   (x <= 2 m)
 *   ln aL = -2.727 + 0.584 ln x   (x > 2 m)
 *
 * The branches do not meet exactly at 2 m (0.101 m against 0.098 m).
 */
export function vadsatDispersivity(x: number): number {
  if (!Number.isFinite(x) || !(x > 0)) {
    throw new RangeError(`distance must be finite and positive, got ${x}`);
  }
  const lx = Math.log(x);
  return x <= 2 ? Math.exp(-4.933 + 3.811 * lx) : Math.exp(-2.727 + 0.584 * lx);
}
