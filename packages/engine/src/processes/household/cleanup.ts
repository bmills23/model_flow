import type { Warning } from '../../registry/index.js';
import type { DirectResult, Endpoint } from '../cleanup/direct.js';

/**
 * M5 coefficient wrappers for the M7 pathways. Every M7 forward function is linear in its source
 * concentration, so the source level is the receptor-medium level (from the direct back-calculation of
 * the air pathway) divided by the model coefficient (receptor medium per unit source): no root find.
 * Cancer and noncancer levels scale the same way, so the governing endpoint is unchanged.
 */
export interface SourceLevel {
  chemical: string;
  /** Source concentration (water kg/m^3 or soil kg/kg); null when not quantified. */
  level: number | null;
  cancerLevel: number | null;
  noncancerLevel: number | null;
  limiting: Endpoint | null;
  /** The receptor-medium level the source level reproduces. */
  mediumLevel: number | null;
  coefficient: number;
  warnings: Warning[];
}

export function sourceLevelsOverCoefficient(
  direct: DirectResult,
  medium: 'bathroomAir' | 'indoorAir' | 'outdoorAir' | 'surfaceWater',
  coefficients: Readonly<Record<string, number>>,
): SourceLevel[] {
  const m = direct.media.find((x) => x.medium === medium);
  if (!m) throw new RangeError(`the direct result has no ${medium} medium`);
  return m.levels.map((lv) => {
    const coefficient = coefficients[lv.chemical];
    if (coefficient === undefined || !Number.isFinite(coefficient) || coefficient < 0) {
      throw new RangeError(`${lv.chemical}: a finite coefficient of at least zero is required`);
    }
    const over = (x: number | null): number | null =>
      x === null || coefficient === 0 ? null : x / coefficient;
    const warnings: Warning[] = [];
    if (coefficient === 0) {
      warnings.push({
        code: 'cleanup.zero-coefficient',
        message: `${lv.chemical}: the model transfers nothing from the source to ${medium} (coefficient 0), so there is no risk-based source level`,
      });
    }
    const level = over(lv.level);
    return {
      chemical: lv.chemical,
      level,
      cancerLevel: over(lv.cancerLevel),
      noncancerLevel: over(lv.noncancerLevel),
      limiting: level === null ? null : lv.limiting,
      mediumLevel: lv.level,
      coefficient,
      warnings,
    };
  });
}
