import type { Warning } from '../../registry/index.js';
import { erf, erfc } from '../../numerics/special.js';
import type { Point3 } from './common.js';
import { patchiConcentration } from './wexler.js';

/**
 * Domenico (1987) approximate solution for a patch source, as used in BIOSCREEN and RBCA-style
 * screening tools. The source is a vertical plane of width Y (centred on y = 0) and thickness Z
 * measured down from the water table (z = 0 is the top, with a no-flux mirror there). Offered as a
 * comparison mode only: the solution is not exact (see the warnings).
 */
export interface DomenicoInput {
  /** Seepage velocity. */
  velocity: number;
  retardation?: number;
  decayRate?: number;
  alphaL: number;
  alphaT: number;
  alphaV: number;
  /** Source concentration. */
  c0: number;
  sourceWidth: number;
  sourceThickness: number;
}

function checkVelocity(input: DomenicoInput): void {
  const R = input.retardation ?? 1;
  if (!(input.velocity > 0 && Number.isFinite(input.velocity)))
    throw new RangeError('Domenico needs a finite positive velocity');
  if (!(R >= 1 && Number.isFinite(R))) throw new RangeError('Retardation factor must be >= 1');
}

/** erf((s + h) / w) - erf((s - h) / w) with the sharp limit when the spreading width is zero. */
function erfBand(s: number, half: number, w: number): number {
  if (w === 0) {
    const a = Math.abs(s);
    return a < half ? 2 : a === half ? 1 : 0;
  }
  return erf((s + half) / w) - erf((s - half) / w);
}

/**
 * Domenico (1987) concentration at p and the given time (Infinity for steady state), in the
 * truncated one-term form used by BIOSCREEN: the transient enters only through the erfc term.
 */
export function domenicoConcentration(input: DomenicoInput, p: Point3, time: number): number {
  checkVelocity(input);
  // z is measured down from the water table; above it there is no aquifer (no mirror image)
  if (p.x <= 0 || time <= 0 || p.z < 0) return 0;
  const R = input.retardation ?? 1;
  const lambda = input.decayRate ?? 0;
  const v = input.velocity / R;
  const aL = input.alphaL;
  const root = Math.sqrt(1 + (4 * lambda * aL) / v);
  let xTerm: number;
  if (aL === 0) {
    // exact zero-dispersivity limit: pure advection with decay and a sharp front at x = v t
    const front = p.x < v * time ? 2 : p.x === v * time ? 1 : 0;
    xTerm = Math.exp((-lambda * p.x) / v) * front;
  } else {
    const decayExp = Math.exp((p.x / (2 * aL)) * (1 - root));
    const arg =
      time === Infinity ? -Infinity : (p.x - v * time * root) / (2 * Math.sqrt(aL * v * time));
    xTerm = decayExp * erfc(arg);
  }
  const yBand = erfBand(p.y, input.sourceWidth / 2, 2 * Math.sqrt(input.alphaT * p.x));
  const zBand = erfBand(p.z, input.sourceThickness, 2 * Math.sqrt(input.alphaV * p.x));
  return (input.c0 / 8) * xTerm * yBand * zBand;
}

/** The exact (Wexler 1992 PATCHI) concentration for the same source: the mirror gives a patch of height 2Z. */
export function domenicoExactReference(input: DomenicoInput, p: Point3, time: number): number {
  const R = input.retardation ?? 1;
  const u = input.velocity / R;
  return patchiConcentration(
    {
      velocity: u,
      decayRate: input.decayRate ?? 0,
      dx: input.alphaL * u,
      dy: input.alphaT * u,
      dz: input.alphaV * u,
      c0: input.c0,
      patch: {
        y1: -input.sourceWidth / 2,
        y2: input.sourceWidth / 2,
        z1: -input.sourceThickness,
        z2: input.sourceThickness,
      },
    },
    p,
    time,
  );
}

/** Relative deviation (Domenico minus exact, over exact) above which a warning is issued. */
export const DOMENICO_DEVIATION_THRESHOLD = 0.1;

/**
 * Validity warnings. The qualitative conditions come from the published evaluations:
 * the solution is exact only for zero longitudinal dispersivity (Srinivasan et al. 2007), centreline
 * concentrations can be underpredicted by up to 80 percent with the error growing with dispersivity,
 * time and dimensionality (West et al. 2007), and agreement with the rigorous solution is good on the
 * centreline but degrades laterally, especially with decay (Guyonnet and Neville 2004). The
 * quantitative warning compares against the exact patch solution at the same point.
 */
export function domenicoWarnings(
  input: DomenicoInput,
  p: Point3,
  time: number,
  threshold = DOMENICO_DEVIATION_THRESHOLD,
): Warning[] {
  checkVelocity(input);
  const out: Warning[] = [];
  if (p.x <= 0 || p.z < 0) {
    out.push({
      code: 'domenico.outside-domain',
      message:
        'The Domenico solution is defined for x > 0 and z >= 0 (z is depth below the water table) only; the value is reported as zero.',
    });
    return out;
  }
  if (input.alphaL > 0) {
    out.push({
      code: 'domenico.approximate-longitudinal-dispersion',
      message:
        'The Domenico solution is exact only for zero longitudinal dispersivity (Srinivasan et al. 2007). West et al. 2007 report centreline underprediction of up to 80 percent for a medium sand, growing with dispersivity, time and dimensionality.',
    });
  }
  if ((input.decayRate ?? 0) > 0 && p.y !== 0) {
    out.push({
      code: 'domenico.off-centreline-with-decay',
      message:
        'Off the plume centreline (lateral offset) with decay the Domenico solution can diverge considerably from the rigorous solution (Guyonnet and Neville 2004).',
    });
  }
  // the exact reference needs strictly positive dispersion in every direction
  const canCompare = input.alphaL > 0 && input.alphaT > 0 && input.alphaV > 0;
  const approx = domenicoConcentration(input, p, time);
  const exact = canCompare ? domenicoExactReference(input, p, time) : 0;
  if (exact > 0) {
    const dev = (approx - exact) / exact;
    if (Math.abs(dev) > threshold) {
      out.push({
        code: 'domenico.deviates-from-exact',
        message: `At this point the Domenico value differs from the exact patch-source solution (Wexler 1992) by ${(dev * 100).toFixed(1)} percent (threshold ${(threshold * 100).toFixed(0)} percent).`,
      });
    }
  }
  return out;
}
