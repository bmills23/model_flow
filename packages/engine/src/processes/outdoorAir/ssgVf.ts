import type { MethodDescriptor, Warning } from '../../registry/index.js';
import type { VaporChemical } from '../vapor/legacyJe.js';
import { juryTransport, type JurySoil } from '../vapor/jury.js';
import { checkNonNeg, checkPos } from '../vapor/units.js';
import { SSG_DEFAULT_Q_OVER_C, qOverCToSi } from './qOverC.js';

/**
 * Soil Screening Guidance soil-to-air volatilization factor (`outdoorAir.ssg-vf-1996`), epa1996ssg
 * Part 2, Equation 6 (infinite source, page 23) and Equation 55 (mass limit, Section 2.6.3, page 60),
 * rewritten in SI. The infinite-source VF is the exact time average of the `vapor.jury-bam` flux for
 * no boundary layer, no cover, an infinite layer and no degradation (Jury et al. 1984 infinite source).
 *
 * Equation 6 prints pi as 3.14; this code uses Math.PI (a 0.02 percent difference, DECISIONS.md).
 */

/** Exposure interval of the Soil Screening Guidance defaults, 9.5e8 s (30 years), Part 2 Equation 6 table. */
export const SSG_DEFAULT_EXPOSURE_S = 9.5e8;

export type SsgSoil = JurySoil;

export interface SsgVfInput {
  chemical: VaporChemical;
  soil: SsgSoil;
  /** Dispersion factor in SI, kg/(m^2 s) per kg/m^3 (m/s). Convert a published value with qOverCToSi. */
  qOverC?: number;
  /** Exposure interval, s (default 9.5e8). */
  exposureTime?: number;
  /** Source depth, m, for the mass-limit VF (Equation 55). */
  sourceDepth?: number;
}

export interface SsgVfResult {
  /** Apparent diffusivity D_A, m^2/s. */
  DA: number;
  /** Infinite-source VF, m^3/kg (Equation 6). */
  vfInfinite: number;
  /** Mass-limit VF, m^3/kg (Equation 55), when a source depth is given. */
  vfMassLimit?: number;
  /** The VF to use: the larger of the two, since Equation 55 is a lower bound on VF. */
  vf: number;
  /** True when the mass limit governs. */
  massLimited: boolean;
  warnings: Warning[];
}

/**
 * Apparent diffusivity (Equation 6): [(theta_a^(10/3) D_i H' + theta_w^(10/3) D_w) / n^2] /
 * (rho_b K_d + theta_w + theta_a H'), m^2/s.
 */
export function ssgApparentDiffusivity(soil: SsgSoil, chem: VaporChemical): number {
  checkPos('H', chem.H);
  checkPos('porosity', soil.porosity);
  const thetaA = soil.porosity - soil.moisture;
  if (!(thetaA >= 0)) throw new RangeError('water-filled porosity exceeds total porosity');
  const numerator =
    (Math.pow(thetaA, 10 / 3) * chem.Da * chem.H + Math.pow(soil.moisture, 10 / 3) * chem.Dw) /
    (soil.porosity * soil.porosity);
  return numerator / (soil.bulkDensity * soil.kd + soil.moisture + thetaA * chem.H);
}

/** Infinite-source VF, m^3/kg: (Q/C) (pi T)^(1/2) / (2 rho_b D_A^(1/2)). */
export function ssgInfiniteVf(
  DA: number,
  soil: SsgSoil,
  qOverC: number,
  exposureTime: number,
): number {
  checkPos('apparent diffusivity', DA);
  return (qOverC * Math.sqrt(Math.PI * exposureTime)) / (2 * soil.bulkDensity * Math.sqrt(DA));
}

/** Mass-limit VF, m^3/kg (Equation 55): (Q/C) T / (rho_b d_s). */
export function ssgMassLimitVf(
  soil: SsgSoil,
  qOverC: number,
  exposureTime: number,
  sourceDepth: number,
): number {
  checkPos('source depth', sourceDepth);
  return (qOverC * exposureTime) / (soil.bulkDensity * sourceDepth);
}

export function ssgVolatilizationFactor(input: SsgVfInput): SsgVfResult {
  const qOverC = input.qOverC ?? qOverCToSi(SSG_DEFAULT_Q_OVER_C);
  const T = input.exposureTime ?? SSG_DEFAULT_EXPOSURE_S;
  checkPos('Q/C', qOverC);
  checkPos('exposure time', T);
  checkNonNeg('bulk density', input.soil.bulkDensity);
  const DA = ssgApparentDiffusivity(input.soil, input.chemical);
  const vfInfinite = ssgInfiniteVf(DA, input.soil, qOverC, T);
  const out: SsgVfResult = { DA, vfInfinite, vf: vfInfinite, massLimited: false, warnings: [] };
  if (input.sourceDepth !== undefined) {
    const vfMassLimit = ssgMassLimitVf(input.soil, qOverC, T, input.sourceDepth);
    out.vfMassLimit = vfMassLimit;
    if (vfMassLimit > vfInfinite) {
      out.vf = vfMassLimit;
      out.massLimited = true;
      out.warnings.push({
        code: 'outdoorAir.ssg-mass-limit',
        message:
          'the mass-limit VF exceeds the infinite-source VF: the source would be depleted within the exposure interval, so the mass-limit VF is used',
      });
    }
  }
  return out;
}

/** Apparent diffusivity agrees with the Jury effective diffusivity D_g / R_g (identity used in tests). */
export function ssgDiffusivityViaJury(soil: SsgSoil, chem: VaporChemical): number {
  return juryTransport({
    chemical: chem,
    soil,
    layerThickness: Infinity,
    initialConcentration: 0,
  }).DE;
}

export const outdoorAirSsgVf1996: MethodDescriptor<SsgVfInput, SsgVfResult> = {
  id: 'outdoorAir.ssg-vf-1996',
  process: 'outdoorAir',
  kind: 'modern',
  name: 'Soil Screening Guidance volatilization factor',
  summary:
    'Soil-to-air volatilization factor for a surface soil source: the time-averaged Jury infinite-source flux over the exposure interval divided into a user-entered dispersion factor Q/C, bounded below by the mass-limit VF for a source of finite depth.',
  citations: ['epa1996ssg', 'millingtonquirk1961'],
  assumptions: [
    'Uniformly contaminated, semi-infinite soil with no boundary layer, no water flux and no degradation.',
    'The result is an air concentration at the centre of a square ground-level area source via Q/C; it does not use the outdoor box.',
    'Adding this to a box emission for the same area double counts.',
  ],
  risc5Choice:
    'Offered as the modern option for outdoor air; Q/C is user-entered with the guidance default of 68.81 g/(m^2 s) per kg/m^3 for a 0.5 acre source.',
  validate: (input) => ssgVolatilizationFactor(input).warnings,
  run: ssgVolatilizationFactor,
};
