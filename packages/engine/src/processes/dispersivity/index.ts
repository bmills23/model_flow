import type { MethodDescriptor } from '../../registry/index.js';

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

/** Gelhar et al. (1985) regression: ln(aL) = -3.795 + 1.774 ln x - 0.093 (ln x)^2. */
export function gelhar1985Longitudinal(x: number): number {
  if (!(x > 0)) throw new RangeError(`Distance must be positive, got ${x}`);
  const lx = Math.log(x);
  return Math.exp(-3.795 + 1.774 * lx - 0.093 * lx * lx);
}

/** Xu and Eckstein (1995) regression: aL = 0.83 (log10 L)^2.414, zero below 1 m. */
export function xuEckstein1995Longitudinal(length: number): number {
  if (!(length > 0)) throw new RangeError(`Scale length must be positive, got ${length}`);
  if (length < 1) return 0;
  return 0.83 * Math.log10(length) ** 2.414;
}

export const gelhar1985Api1987: MethodDescriptor<DispersivityInput, DispersivityOutput> = {
  id: 'dispersivity.gelhar1985-api1987',
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
  run: ({ distance }) => {
    const alphaL = gelhar1985Longitudinal(distance);
    const alphaT = alphaL / 3;
    return { alphaL, alphaT, alphaV: alphaT / 87 };
  },
};

export const xuEckstein1995: MethodDescriptor<DispersivityInput, DispersivityOutput> = {
  id: 'dispersivity.xu-eckstein1995',
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
