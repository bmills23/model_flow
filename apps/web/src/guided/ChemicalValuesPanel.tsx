import type { ProjectChemical } from '../project/chemicals';
import type { VaporChemicalRow } from '../vapor/chemicals';
import { Field, TextField } from '../ui/controls';
import { entryProblem, type OverrideEntry, type OverridesState } from '../overrides/model';
import { FATE_FIELDS } from '../overrides/userChemicals';
import { fateKeysUsed } from '../overrides/fate';
import type { GuidedFormKey } from './state';

/**
 * Step 3c, chemical values: for each chemical, the properties the chosen models read, each with the
 * database value and a place for a value that applies to this project only, with the source note that
 * justifies it. A value without a note is not used. The edits are the project's `fate` overrides, so the
 * workbench screens show the same values.
 */
export function ChemicalValuesPanel(props: {
  chemicals: readonly ProjectChemical[];
  models: readonly GuidedFormKey[];
  /** The database rows before the project's edits. */
  baseRows: readonly VaporChemicalRow[];
  overrides: OverridesState;
  onChange: (next: OverridesState) => void;
  loading: boolean;
}) {
  const keys = fateKeysUsed(props.models);
  if (keys.length === 0) {
    return (
      <p className="muted">
        No model uses chemical properties with these site answers, so there is nothing to edit here.
      </p>
    );
  }
  const fields = FATE_FIELDS.filter((f) => keys.includes(f.key));
  const edit = (id: string, key: string, entry: OverrideEntry | null): void => {
    const own = { ...(props.overrides.fate[id] ?? {}) };
    if (entry === null) delete own[key];
    else own[key] = entry;
    const fate = { ...props.overrides.fate };
    if (Object.keys(own).length === 0) delete fate[id];
    else fate[id] = own;
    props.onChange({ ...props.overrides, fate });
  };
  return (
    <div className="guided-values">
      <p className="muted">
        These are the chemical properties the models in your chain read, from the database. A value
        you enter replaces the database value for this project only, and the database is not
        changed. A short source note is required, and a value without one is not used.
      </p>
      {props.chemicals.map((chem) => {
        const base = props.baseRows.find((r) => r.id === chem.id);
        const edits = props.overrides.fate[chem.id] ?? {};
        const count = Object.keys(edits).length;
        return (
          <details key={chem.id} className="override-panel">
            <summary>
              {chem.name} (chemical values){count > 0 ? `, ${count} edited` : ''}
            </summary>
            {fields.map(({ key, label, unit }) => {
              const dbv = base?.rsl[key]?.value;
              const entry = edits[key];
              const problem = entry === undefined ? null : entryProblem(entry);
              const id = `fate-${chem.id}-${key}`;
              return (
                <div
                  key={key}
                  className={entry === undefined ? 'override-row' : 'override-row edited'}
                >
                  <p className="override-title">
                    {label} <small>{unit}</small>
                    {entry !== undefined && <span className="edited-mark">Edited</span>}
                  </p>
                  <p className="muted">
                    Database value:{' '}
                    {dbv !== undefined
                      ? String(dbv)
                      : props.loading
                        ? 'loading'
                        : 'none (the database gives this chemical no value)'}
                  </p>
                  <div className="fields">
                    <Field
                      label={`Your value for ${label.toLowerCase()}`}
                      value={entry?.value ?? ''}
                      {...(problem !== null ? { describedBy: `${id}-problem` } : {})}
                      onChange={(v) =>
                        v === '' && (entry?.note ?? '') === ''
                          ? edit(chem.id, key, null)
                          : edit(chem.id, key, { value: v, note: entry?.note ?? '' })
                      }
                    />
                    <TextField
                      label={`Source note for ${label.toLowerCase()} (required)`}
                      value={entry?.note ?? ''}
                      {...(problem !== null ? { describedBy: `${id}-problem` } : {})}
                      onChange={(n) =>
                        n === '' && (entry?.value ?? '') === ''
                          ? edit(chem.id, key, null)
                          : edit(chem.id, key, { value: entry?.value ?? '', note: n })
                      }
                    />
                  </div>
                  {problem !== null && (
                    <p id={`${id}-problem`} className="override-problem" role="status">
                      {problem}
                    </p>
                  )}
                  {entry !== undefined && (
                    <button
                      type="button"
                      className="btn"
                      aria-label={`Reset to database value: ${label.toLowerCase()} of ${chem.name}`}
                      onClick={() => edit(chem.id, key, null)}
                    >
                      Reset to database value
                    </button>
                  )}
                </div>
              );
            })}
          </details>
        );
      })}
    </div>
  );
}
