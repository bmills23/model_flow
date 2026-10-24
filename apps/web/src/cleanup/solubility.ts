import type { CleanupProps } from './ssg';

/**
 * The solubility a dissolved concentration is held against (docs/DECISIONS.md, wave AA ruling 7). It
 * defaults per chemical to the database's aqueous solubility and says where that value came from; a
 * ceiling the user types on the cleanup screen wins for every chemical.
 */
export interface SolubilityCeiling {
  /** mg/L. */
  value: number;
  origin: 'database' | 'entered';
  /** Where the value came from, in words for a reader. */
  source: string;
}

export const databaseSolubilitySource = (edition: string): string =>
  `aqueous solubility from the EPA Regional Screening Levels chemical-specific parameters, ${edition} edition`;

const ENTERED_SOURCE = 'a ceiling entered on the cleanup screen';

/** The ceiling for one chemical: the user's entry when it is a positive number, else the database value. */
export function solubilityCeiling(
  entered: string,
  chemicalId: string,
  props: CleanupProps | null,
  edition: string,
): SolubilityCeiling | null {
  const typed = entered.trim() === '' ? NaN : Number(entered.trim());
  if (Number.isFinite(typed) && typed > 0) {
    return { value: typed, origin: 'entered', source: ENTERED_SOURCE };
  }
  const s = props?.get(chemicalId)?.s;
  if (s === undefined || !Number.isFinite(s) || s <= 0) return null;
  return { value: s, origin: 'database', source: databaseSolubilitySource(edition) };
}

/** The ceiling of each listed chemical, by id (null where there is none). */
export function ceilingsOf(
  entered: string,
  ids: readonly string[],
  props: CleanupProps | null,
  edition: string,
): Record<string, SolubilityCeiling | null> {
  const out: Record<string, SolubilityCeiling | null> = {};
  for (const id of ids) out[id] = solubilityCeiling(entered, id, props, edition);
  return out;
}

const num = (x: number): string => String(Number(x.toPrecision(3)));

/** "526 mg/L (aqueous solubility from ...)". */
export const solubilityText = (c: SolubilityCeiling): string =>
  `${num(c.value)} mg/L (${c.source})`;

/** True when a dissolved level (mg/L) is above the ceiling. */
export const aboveSolubility = (levelMgPerL: number | null, c: SolubilityCeiling | null): boolean =>
  levelMgPerL !== null && c !== null && levelMgPerL > c.value * (1 + 1e-9);

/** The sentence that flags a level above the solubility, or null when it is not. */
export function solubilityFlag(
  name: string,
  levelMgPerL: number | null,
  c: SolubilityCeiling | null,
): string | null {
  if (c === null || !aboveSolubility(levelMgPerL, c)) return null;
  const what = c.origin === 'entered' ? 'the solubility ceiling' : 'the solubility';
  return `${name}: the level of ${num(levelMgPerL!)} mg/L is above ${what} of ${solubilityText(c)}, so a dissolved source cannot be that concentrated.`;
}
