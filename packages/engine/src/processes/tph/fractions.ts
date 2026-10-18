import type { Warning } from '../../registry/index.js';
import { soilSaturationConcentration } from '../saturatedSource/partitioning.js';
import { checkNonNegative, checkPositive } from '../plantUptake/checks.js';

/**
 * RSL November 2024 TPH surrogate record ids (aliphatic low, medium, high; aromatic medium, high).
 * Ruling 9: both fraction sets map onto these records; no toxicity is entered here.
 */
export const TPH_SURROGATE_IDS: readonly string[] = [
  'E1790666',
  'E1790668',
  'E1790670',
  'E1790674',
  'E1790676',
];

/** A TPH fraction of a fraction set (TPHCWG or MADEP). The caller names the surrogate record. */
export interface TphFraction {
  label: string;
  family: 'aliphatic' | 'aromatic';
  /** Mass fraction of the total TPH, kg/kg. */
  massFraction: number;
  /** RSL surrogate record id, or null for a fraction with no surrogate. */
  surrogate: string | null;
}

const SUM_TOLERANCE = 1e-6;

const unmappedWarning = (label: string): Warning => ({
  code: 'TPH_FRACTION_UNMAPPED',
  message: `fraction ${label} has no RSL surrogate record; it is excluded from the TPH calculation`,
});

export interface ResolvedFractions<F extends TphFraction> {
  mapped: F[];
  unmapped: F[];
  warnings: Warning[];
}

export function isMapped(f: TphFraction): boolean {
  return f.surrogate !== null && TPH_SURROGATE_IDS.includes(f.surrogate);
}

/** Splits a fraction set into mapped and unmapped fractions and checks the mass fractions sum to one. */
export function resolveFractions<F extends TphFraction>(
  fractions: readonly F[],
): ResolvedFractions<F> {
  if (fractions.length === 0) throw new RangeError('at least one TPH fraction is required');
  let sum = 0;
  for (const f of fractions) {
    checkNonNegative(`mass fraction of ${f.label}`, f.massFraction);
    sum += f.massFraction;
  }
  const warnings: Warning[] = [];
  const mapped: F[] = [];
  const unmapped: F[] = [];
  for (const f of fractions) {
    if (isMapped(f)) mapped.push(f);
    else {
      unmapped.push(f);
      warnings.push(unmappedWarning(f.label));
    }
  }
  if (Math.abs(sum - 1) > SUM_TOLERANCE) {
    warnings.push({
      code: 'TPH_FRACTIONS_DO_NOT_SUM',
      message: `fraction mass fractions sum to ${sum}, not 1`,
    });
  }
  return { mapped, unmapped, warnings };
}

export interface TphLevelFraction extends TphFraction {
  /** Level of this fraction alone for a hazard quotient of one, kg/kg (from M5). */
  levelKgPerKg: number;
}

export interface TphTotalLevelInput {
  fractions: readonly TphLevelFraction[];
  /** Target hazard index; default 1. */
  targetHazardIndex?: number;
}

export interface TphTotalLevelResult {
  /** C_TPH = HI_t / sum_j( f_j / CL_j ), kg/kg; null when no mapped fraction carries mass. */
  totalKgPerKg: number | null;
  warnings: Warning[];
}

export function tphTotalLevel(input: TphTotalLevelInput): TphTotalLevelResult {
  const hi = input.targetHazardIndex ?? 1;
  checkPositive('target hazard index', hi);
  const { mapped, warnings } = resolveFractions(input.fractions);
  let sum = 0;
  for (const f of mapped) {
    checkPositive(`level of ${f.label}`, f.levelKgPerKg);
    sum += f.massFraction / f.levelKgPerKg;
  }
  return { totalKgPerKg: sum > 0 ? hi / sum : null, warnings };
}

export interface TphForwardInput {
  /** Total TPH soil concentration, kg/kg. */
  totalKgPerKg: number;
  fractions: readonly TphFraction[];
  /** Hazard quotient of one fraction run as its own chemical at C_s,j (the M4 receptor run). */
  hazardQuotient: (fraction: TphFraction, soilKgPerKg: number) => number;
}

export interface TphForwardResult {
  byFraction: { label: string; soilKgPerKg: number; hazardQuotient: number }[];
  hazardIndex: number;
  warnings: Warning[];
}

/** Each mapped fraction runs at C_s,j = f_j C_TPH; the noncancer hazard quotients add. */
export function tphForwardHazard(input: TphForwardInput): TphForwardResult {
  checkNonNegative('total TPH concentration', input.totalKgPerKg);
  const { mapped, warnings } = resolveFractions(input.fractions);
  const byFraction = mapped.map((f) => {
    const soilKgPerKg = f.massFraction * input.totalKgPerKg;
    return { label: f.label, soilKgPerKg, hazardQuotient: input.hazardQuotient(f, soilKgPerKg) };
  });
  return {
    byFraction,
    hazardIndex: byFraction.reduce((s, x) => s + x.hazardQuotient, 0),
    warnings,
  };
}

export interface FractionSaturationInput {
  label: string;
  soil: { rhoB: number; foc: number; theta: number; thetaA: number };
  /** Solubility S (kg/m^3), dimensionless Henry constant H, organic carbon partition coefficient koc (m^3/kg). */
  chemical: { S: number; H: number; koc: number };
  /** The fraction's soil concentration f_j C_TPH, kg/kg. */
  soilKgPerKg: number;
}

export interface FractionSaturationResult {
  saturationKgPerKg: number;
  exceeded: boolean;
  warnings: Warning[];
}

/** Saturation limit of one fraction (pure phase, x = 1) against its share of the total. */
export function checkFractionSaturation(input: FractionSaturationInput): FractionSaturationResult {
  checkNonNegative('fraction soil concentration', input.soilKgPerKg);
  checkNonNegative('foc', input.soil.foc);
  checkNonNegative('koc', input.chemical.koc);
  const saturationKgPerKg = soilSaturationConcentration({
    S: input.chemical.S,
    x: 1,
    rhoB: input.soil.rhoB,
    kd: input.chemical.koc * input.soil.foc,
    theta: input.soil.theta,
    thetaA: input.soil.thetaA,
    H: input.chemical.H,
  });
  const exceeded = input.soilKgPerKg > saturationKgPerKg;
  return {
    saturationKgPerKg,
    exceeded,
    warnings: exceeded
      ? [
          {
            code: 'TPH_CSAT_EXCEEDED',
            message: `fraction ${input.label} exceeds its soil saturation limit; a separate phase is present and the partitioning model does not apply`,
          },
        ]
      : [],
  };
}
