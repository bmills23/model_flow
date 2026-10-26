import type { GuidedFormKey } from '../guided/state';
import type { VaporChemicalRow } from '../vapor/chemicals';
import { usableValue, type OverridesState } from './model';
import { FATE_FIELDS, type FateKey } from './userChemicals';

/**
 * Project-only edits of a chemical's fate and partition properties (the `fate` set of the project
 * overrides). An edit needs a number above zero and a source note, as a toxicity edit does. The edited
 * value is laid over the database row, so every screen that reads the rows shows the same value.
 */

/** The rows with each chemical's usable edits laid over its database values; the same list when none apply. */
export function applyFateOverrides(
  rows: VaporChemicalRow[],
  state: OverridesState,
): VaporChemicalRow[] {
  if (Object.keys(state.fate).length === 0) return rows;
  let changed = false;
  const out = rows.map((row) => {
    const edits = state.fate[row.id];
    if (edits === undefined) return row;
    const rsl = { ...row.rsl };
    let any = false;
    for (const { key } of FATE_FIELDS) {
      const e = edits[key];
      const v = e === undefined ? null : usableValue(e);
      if (v !== null) {
        rsl[key] = { value: v };
        any = true;
      }
    }
    if (!any) return row;
    changed = true;
    return { ...row, rsl };
  });
  return changed ? out : rows;
}

/** The properties each model reads from a chemical's database row (the keys of `FATE_FIELDS`). */
const MODEL_FATE: Record<GuidedFormKey, readonly FateKey[]> = {
  vadose: ['mw', 's', 'hPrime', 'koc', 'dia', 'diw'],
  saturated: ['mw', 's', 'hPrime', 'koc'],
  transport: ['koc'],
  vapor: ['mw', 's', 'hPrime', 'koc', 'dia', 'diw'],
  surfaceWater: ['koc', 's'],
  household: ['mw', 'hPrime'],
  plantsEco: ['koc'],
};

/** The properties the chosen models use, in screen order, each once. */
export function fateKeysUsed(models: readonly GuidedFormKey[]): FateKey[] {
  const used = new Set<FateKey>(models.flatMap((m) => MODEL_FATE[m]));
  return FATE_FIELDS.filter((f) => used.has(f.key)).map((f) => f.key);
}
