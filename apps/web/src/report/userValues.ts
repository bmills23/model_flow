import { chemicalsOf, overridesOf, screensOf, type Project, type Screens } from '../project';
import { receptorKey, withReceptorEdits, type ReceptorScreen } from '../overrides/receptors';
import type { ReceptorForm } from '../risk/form';
import { editableRows, shownValue } from '../risk/receptorRows';
import { loadChemicalDb } from '../risk/chemicalDb';
import { overrideRows, type OverrideRow } from '../overrides/toxicity';
import type { OverridesState } from '../overrides/model';
import { userChemicalRows, type UserChemicalRow } from '../overrides/userChemicals';

/** The project's toxicity overrides as report rows, with the database value beside each. */
export async function loadOverrideRows(project: Project): Promise<OverrideRow[]> {
  const state = overridesOf(project);
  if (Object.keys(state.toxicity).length === 0) return [];
  return overrideRows(await loadChemicalDb(), state);
}

/** Every value of every chemical the user defined, with its note (source `user`). */
export const userChemicalRowsOf = (project: Project): UserChemicalRow[] =>
  userChemicalRows(chemicalsOf(project));

/** The screens with the project's receptor names and factor edits laid on the receptors, for a build. */
export function withProjectReceptorEdits(screens: Screens, state: OverridesState): Screens {
  return {
    ...screens,
    risk: { ...screens.risk, form: withReceptorEdits(screens.risk.form, state, 'risk') },
    cleanup: {
      ...screens.cleanup,
      form: withReceptorEdits(screens.cleanup.form, state, 'cleanup'),
    },
  };
}

const screenForms = (project: Project) => {
  const screens = screensOf(project);
  return [
    { screen: 'risk' as const, title: 'Exposure and risk', form: screens.risk.form },
    { screen: 'cleanup' as const, title: 'Cleanup', form: screens.cleanup.form },
  ];
};

/** One edited exposure factor as the report lists it. */
export interface ReceptorEditRow {
  receptor: string;
  factor: string;
  unit: string;
  presetValue: string;
  userValue: string;
  /** The source note given for the edit; empty when none was. */
  note: string;
}

/**
 * Every saved receptor factor edit, with the preset value beside it: of the exposure and cleanup screens'
 * receptors, or of the receptors `forms` names (a guided report passes the step 4 pair).
 */
export function receptorEditRows(
  project: Project,
  forms: readonly {
    screen: ReceptorScreen;
    title: string;
    form: { a: ReceptorForm; b: ReceptorForm | null };
  }[] = screenForms(project),
): ReceptorEditRow[] {
  const state = overridesOf(project);
  const rows: ReceptorEditRow[] = [];
  for (const { screen, title, form } of forms) {
    for (const which of ['a', 'b'] as const) {
      const rf = which === 'a' ? form.a : form.b;
      const key = receptorKey(screen, which);
      const edits = state.receptors[key];
      if (rf === null || edits === undefined) continue;
      const name = (state.receptorNames[key] ?? '').trim();
      const tag = name === '' ? `Receptor ${which.toUpperCase()}` : name;
      const all = editableRows(rf.preset);
      for (const r of [...all.legacy, ...all.modern, all.lifetime]) {
        const e = edits[r.key];
        if (e === undefined) continue;
        const method = r.key.startsWith('legacy.')
          ? ' (legacy)'
          : r.key.startsWith('modern.')
            ? ' (modern)'
            : '';
        rows.push({
          receptor: `${title}, ${tag}`,
          factor: `${r.label}${method}`,
          unit: r.unit,
          presetValue: shownValue(r.preset),
          userValue: e.value.trim(),
          note: e.note.trim(),
        });
      }
    }
  }
  return rows;
}
