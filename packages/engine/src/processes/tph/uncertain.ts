import type { UncertainInput } from '../../registry/index.js';
import { declareRows, type Row } from '../vapor/uncertain.js';
import type { TphTotalLevelInput } from './fractions.js';

/**
 * Uncertain-input declarations of the TPH total level methods (uncertainty note, ruling 2). Ids are
 * `tph.<name>`. The fraction levels (from the cleanup process) and the target hazard index are declared;
 * the mass fractions are not, because they are one composition that must sum to one and independent
 * draws would break it. Eight fraction slots are declared; a base with fewer fractions reads NaN.
 */

export const TPH_DECLARED_FRACTIONS = 8;

/** Declarations of `tph.tphcwg` and `tph.madep`. */
export function tphUncertainInputs(): UncertainInput<TphTotalLevelInput>[] {
  const rows: Row<TphTotalLevelInput>[] = [
    ['targetHazardIndex', ['targetHazardIndex'], 'Target hazard index', '1', 'site'],
  ];
  for (let k = 0; k < TPH_DECLARED_FRACTIONS; k++) {
    rows.push([
      `fraction${k}.level`,
      ['fractions', k, 'levelKgPerKg'],
      `Level of fraction ${k + 1} for a hazard quotient of one`,
      'kg/kg',
      'chemical',
    ]);
  }
  return declareRows<TphTotalLevelInput>('tph', rows);
}
