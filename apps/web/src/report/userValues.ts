import { overridesOf, type Project } from '../project';
import { loadChemicalDb } from '../risk/chemicalDb';
import { overrideRows, type OverrideRow } from '../overrides/toxicity';

/** The project's toxicity overrides as report rows, with the database value beside each. */
export async function loadOverrideRows(project: Project): Promise<OverrideRow[]> {
  const state = overridesOf(project);
  if (Object.keys(state.toxicity).length === 0) return [];
  return overrideRows(await loadChemicalDb(), state);
}
