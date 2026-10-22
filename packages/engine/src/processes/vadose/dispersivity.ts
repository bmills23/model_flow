import type { Warning } from '../../registry/index.js';

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

/**
 * The RISC5 vadose dispersivity regression (two branches on depth, attributed to Gelhar et al. 1985)
 * has no primary source located: the EPRI report (EA-4190, read 2026-10-21) prints field data and a
 * plot, not the equations. Both vadose methods warn with this code whenever it is used.
 */
export function dispersivityRegressionWarning(): Warning {
  return {
    code: 'vadose.dispersivity-regression-unsourced',
    message:
      'No dispersivity was entered, so the RISC5 regression (attributed to Gelhar et al. 1985) was used. It has no primary source: the cited report prints field data and a plot, not the equations. Enter a site value or a cited value instead.',
  };
}
