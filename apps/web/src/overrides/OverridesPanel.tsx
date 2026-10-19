import type { ChemicalRecord } from '../risk/chemicalDb';
import { fmtTox } from '../risk/format';
import { Field } from '../ui/controls';
import { entryProblem, type OverrideEntry } from './model';
import { TOX_FIELDS } from './toxicity';

/**
 * "Edit values" for one chemical: each toxicity value shown with the database value and its source, and
 * a place to type a value for this project with the source note that justifies it. An edited field is
 * marked with the word "Edited" and a tint, and has its own reset. The edits live at project level, so
 * the exposure and cleanup screens show the same values.
 */
export function OverridesPanel(props: {
  rec: ChemicalRecord;
  sourceKeys: Record<string, string>;
  /** This chemical's edits by field key. */
  edits: Record<string, OverrideEntry> | undefined;
  /** An entry to set a field, or null to reset it. */
  onEdit: (field: string, entry: OverrideEntry | null) => void;
}) {
  const { rec, edits = {} } = props;
  const base = rec.dbTox ?? rec.tox;
  const count = Object.keys(edits).length;
  return (
    <details className="override-panel">
      <summary>Edit values{count > 0 ? ` (${count} edited)` : ''}</summary>
      <p className="muted">
        A value you enter replaces the database value for this project only; the database is not
        changed, and the same value is used on the exposure and cleanup screens. A short source note
        is required, and a value without one is not used. The database holds chronic values; for a
        short-term case enter the reference dose that applies and say so in the note.
      </p>
      {TOX_FIELDS.map(({ key, label, unit }) => {
        const dbv = base[key];
        const entry = edits[key];
        const problem = entry === undefined ? null : entryProblem(entry);
        const id = `ov-${rec.id}-${key}`;
        return (
          <div key={key} className={entry === undefined ? 'override-row' : 'override-row edited'}>
            <p className="override-title">
              {label} <small>{unit}</small>
              {entry !== undefined && <span className="edited-mark">Edited</span>}
            </p>
            <p className="muted">
              Database value:{' '}
              {dbv === undefined
                ? 'none (the database gives this chemical no value)'
                : `${fmtTox(dbv.value)} (${props.sourceKeys[dbv.source] ?? dbv.source})`}
            </p>
            <div className="fields">
              <Field
                label={`Your value for ${label.toLowerCase()}`}
                value={entry?.value ?? ''}
                onChange={(v) =>
                  v === '' && (entry?.note ?? '') === ''
                    ? props.onEdit(key, null)
                    : props.onEdit(key, { value: v, note: entry?.note ?? '' })
                }
              />
              <label className="field">
                <span className="field-label">Source note (required)</span>
                <input
                  id={id}
                  type="text"
                  autoComplete="off"
                  value={entry?.note ?? ''}
                  aria-describedby={problem === null ? undefined : `${id}-problem`}
                  onChange={(e) =>
                    e.target.value === '' && (entry?.value ?? '') === ''
                      ? props.onEdit(key, null)
                      : props.onEdit(key, { value: entry?.value ?? '', note: e.target.value })
                  }
                />
              </label>
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
                aria-label={`Reset to database value: ${label.toLowerCase()} of ${rec.name}`}
                onClick={() => props.onEdit(key, null)}
              >
                Reset to database value
              </button>
            )}
          </div>
        );
      })}
    </details>
  );
}
