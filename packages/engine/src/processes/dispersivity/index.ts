import type { MethodDescriptor } from '../../registry/index.js';
import { dispersivityUncertainInputs } from './uncertain.js';

export interface DispersivityInput {
  /** Distance from source to receptor, metres. */
  distance: number;
}

export interface DispersivityOutput {
  /** Longitudinal dispersivity, metres. */
  alphaL: number;
  /** Transverse (horizontal) dispersivity, metres. */
  alphaT: number;
  /** Vertical dispersivity, metres. */
  alphaV: number;
}

/**
 * RISC5's saturated-zone regression, ln(aL) = -3.795 + 1.774 ln x - 0.093 (ln x)^2, attributed to
 * Gelhar et al. (1985). The saturated-zone log-quadratic has no primary source located: the EPRI
 * report (EA-4190) prints field data and a plot against scale, not this equation, so the
 * coefficients stand on RISC5's statement of its choice and the method warns whenever the law value
 * is used (dispersivity.regression-unsourced).
 */
export function gelhar1985Longitudinal(x: number): number {
  if (!(x > 0)) throw new RangeError(`Distance must be positive, got ${x}`);
  const lx = Math.log(x);
  return Math.exp(-3.795 + 1.774 * lx - 0.093 * lx * lx);
}

/**
 * EPA Soil Screening Guidance rule for the longitudinal dispersivity of the dilution-attenuation
 * factor: alpha_L = 0.1 x_r, with x_r the horizontal distance to the receptor (U.S. EPA 1996,
 * Technical Background Document, printed page 45, equation 39 and the definitions under it; read
 * 2026-10-22). The passage gives no transverse ratio, so only the longitudinal value is a rule.
 */
export function ssg1996Longitudinal(distance: number): number {
  if (!Number.isFinite(distance) || !(distance > 0)) {
    throw new RangeError(`Distance must be positive, got ${distance}`);
  }
  return 0.1 * distance;
}

/** Xu and Eckstein (1995) regression: aL = 0.83 (log10 L)^2.414, zero below 1 m. */
export function xuEckstein1995Longitudinal(length: number): number {
  if (!(length > 0)) throw new RangeError(`Scale length must be positive, got ${length}`);
  if (length < 1) return 0;
  return 0.83 * Math.log10(length) ** 2.414;
}

export const gelhar1985Api1987: MethodDescriptor<DispersivityInput, DispersivityOutput> = {
  id: 'dispersivity.gelhar1985-api1987',
  uncertainInputs: dispersivityUncertainInputs(),
  process: 'dispersivity',
  kind: 'legacy',
  name: 'Gelhar et al. (1985) regression with API (1987) ratios',
  summary:
    'Longitudinal dispersivity from a log-quadratic regression on source-to-receptor distance; transverse and vertical values from fixed ratios.',
  citations: ['gelhar1985', 'api1987'],
  assumptions: [
    'Dispersivity depends only on the transport distance.',
    'Transverse dispersivity is one third of longitudinal; vertical is 1/87 of transverse.',
  ],
  risc5Choice:
    'RISC5 computes longitudinal dispersivity from the Gelhar et al. 1985 regression on receptor distance and applies the API 1987 ratios 3 and 87 when dispersivities are entered as zero.',
  validate: () => [
    {
      code: 'dispersivity.regression-unsourced',
      message:
        'The longitudinal dispersivity regression (RISC5 choice, attributed to Gelhar et al. 1985) has no primary source: the cited report prints field data and a plot, not this equation. Enter a site value or a cited rule instead.',
    },
  ],
  run: ({ distance }) => {
    const alphaL = gelhar1985Longitudinal(distance);
    const alphaT = alphaL / 3;
    return { alphaL, alphaT, alphaV: alphaT / 87 };
  },
};

export const xuEckstein1995: MethodDescriptor<DispersivityInput, DispersivityOutput> = {
  id: 'dispersivity.xu-eckstein1995',
  uncertainInputs: dispersivityUncertainInputs(),
  process: 'dispersivity',
  kind: 'modern',
  name: 'Xu and Eckstein (1995) regression with BIOSCREEN ratios',
  summary:
    'Longitudinal dispersivity from a weighted least-squares fit to field data on scale; transverse is one tenth and vertical one hundredth of longitudinal.',
  citations: ['xueckstein1995', 'newell1996'],
  assumptions: [
    'Dispersivity depends only on the transport distance.',
    'The regression collapses to zero below one metre.',
  ],
  validate: ({ distance }) =>
    distance < 1
      ? [
          {
            code: 'dispersivity.short-distance',
            message:
              'Distance is below 1 m: the Xu and Eckstein regression returns zero dispersivity.',
          },
        ]
      : [],
  run: ({ distance }) => {
    const alphaL = xuEckstein1995Longitudinal(distance);
    return { alphaL, alphaT: alphaL / 10, alphaV: alphaL / 100 };
  },
};

/**
 * Schulze-Makuch (2005) scale-dependent power law, alpha_L = c L^m.
 *
 * Provenance of the coefficients (verified 2026-10-15). The publication itself (Ground Water 43(3),
 * 443-456, doi 10.1111/j.1745-6584.2005.0051.x) was confirmed through Crossref; its abstract states the
 * unconsolidated-media exponent range 0.44 to 0.94 with the most reliable subsets at the low end.
 * The coefficient pair c = 0.20, m = 0.44 for unconsolidated media fitted to the most reliable data
 * is quoted from a secondary source with attribution to the paper: Bjerg, P.L., "Note A5: Dispersion
 * in aquifers" (DTU Environment, v1.1, 2008) and the DTU Sustain lecture note "Dispersion in Aquifers"
 * (v2.0, 2025, course 12330), both reading "alpha_L = c (L)^m = 0.20 (L)^0.44". Per-medium
 * coefficients for consolidated rocks and the paper's stated data range could not be verified and are
 * deliberately not encoded. Those notes give 1.6 m at 100 m, whereas the formula gives 1.517 m; the
 * formula as quoted is used.
 */
export function schulzeMakuch2005Longitudinal(length: number): number {
  if (!(length > 0)) throw new RangeError(`Scale length must be positive, got ${length}`);
  return 0.2 * length ** 0.44;
}

export const schulzeMakuch2005: MethodDescriptor<DispersivityInput, DispersivityOutput> = {
  id: 'dispersivity.schulze-makuch2005',
  uncertainInputs: dispersivityUncertainInputs(),
  process: 'dispersivity',
  kind: 'modern',
  name: 'Schulze-Makuch (2005) power law with BIOSCREEN ratios',
  summary:
    'Longitudinal dispersivity from the unconsolidated-media power law 0.20 L^0.44 on scale; transverse is one tenth and vertical one hundredth of longitudinal (BIOSCREEN ratios).',
  citations: ['schulzemakuch2005', 'newell1996'],
  assumptions: [
    'Dispersivity depends only on the transport distance and grows without an upper bound.',
    'Coefficients are those for unconsolidated media fitted to the most reliable data in the compilation.',
    'Transverse and vertical dispersivity are fixed fractions (1/10 and 1/100) of the longitudinal value.',
  ],
  run: ({ distance }) => {
    const alphaL = schulzeMakuch2005Longitudinal(distance);
    return { alphaL, alphaT: alphaL / 10, alphaV: alphaL / 100 };
  },
};
