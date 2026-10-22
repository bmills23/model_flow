import { useState } from 'react';
import { Field } from '../ui/controls';
import {
  entryProblem,
  resetField,
  setField,
  type OverrideEntry,
  type OverridesState,
} from '../overrides/model';
import { receptorKey, type ReceptorScreen } from '../overrides/receptors';
import type { PresetId } from './form';
import { editableRows, shownValue as shown, type EditableRow as Row } from './receptorRows';

const noteMessage = 'A source note is required; the value is not used until you add one.';
const noteProblem = (e: OverrideEntry): string | null =>
  entryProblem({ value: '1', note: e.note }) === null ? null : noteMessage;

const problemOf = (text: string): string | null => {
  const t = text.trim();
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? null : 'Enter a number that is not negative.';
};

/**
 * The preset's own exposure factors for one receptor, each editable for this project. An edited factor
 * shows the word "Edited" and a tint, with its own reset; "Reset to preset" clears them all. The edits are
 * kept at project level, so they are saved and reported with the rest of the project.
 */
export function ReceptorEditor(props: {
  screen: ReceptorScreen;
  which: 'a' | 'b';
  tag: string;
  preset: PresetId;
  state: OverridesState;
  onChange: (next: OverridesState) => void;
}) {
  const { state } = props;
  const subject = receptorKey(props.screen, props.which);
  const edits = state.receptors[subject] ?? {};
  const rows = editableRows(props.preset);
  // What is typed but not yet usable (a value without a note, or a note without a value) is held
  // here, not in the project: the project holds only edits that apply.
  const [drafts, setDrafts] = useState<Record<string, OverrideEntry>>({});
  const put = (key: string, entry: OverrideEntry): void => {
    const usable =
      entry.value.trim() !== '' && entry.note.trim() !== '' && problemOf(entry.value) === null;
    const typed = entry.value !== '' || entry.note !== '';
    setDrafts((d) => {
      const rest = Object.fromEntries(Object.entries(d).filter(([k]) => k !== key));
      return usable || !typed ? rest : { ...rest, [key]: entry };
    });
    props.onChange({
      ...state,
      receptors: usable
        ? setField(state.receptors, subject, key, entry)
        : resetField(state.receptors, subject, key),
    });
  };
  const reset = (key: string): void => put(key, { value: '', note: '' });

  const renderRow = (r: Row) => {
    const stored = edits[r.key];
    const entry = drafts[r.key] ?? stored;
    const problem =
      entry === undefined
        ? null
        : (problemOf(entry.value) ?? (entry.value.trim() === '' ? null : noteProblem(entry)));
    const id = `rf-${subject}-${r.key}`;
    return (
      <div key={r.key} className={entry === undefined ? 'override-row' : 'override-row edited'}>
        <Field
          label={`${r.label} (${r.unit})`}
          value={entry?.value ?? ''}
          placeholder={shown(r.preset)}
          hint={`Preset: ${shown(r.preset)} ${r.unit}`}
          onChange={(v) => put(r.key, { value: v, note: entry?.note ?? '' })}
        />
        <label className="field">
          <span className="field-label">{`Source note for ${r.label.toLowerCase()} (required)`}</span>
          <input
            type="text"
            autoComplete="off"
            value={entry?.note ?? ''}
            aria-invalid={problem === noteMessage ? true : undefined}
            aria-describedby={problem === null ? undefined : `${id}-problem`}
            onChange={(e) => put(r.key, { value: entry?.value ?? '', note: e.target.value })}
          />
        </label>
        {stored !== undefined && <span className="edited-mark">Edited</span>}
        {stored !== undefined && stored.note.trim() === '' && drafts[r.key] === undefined && (
          <p className="muted">No note: this edit was saved without a source note.</p>
        )}
        {problem !== null && (
          <p id={`${id}-problem`} className="override-problem" role="status">
            {problem}
          </p>
        )}
        {entry !== undefined && (
          <button
            type="button"
            className="btn"
            aria-label={`Reset to preset: ${r.label.toLowerCase()} of ${props.tag}`}
            onClick={() => reset(r.key)}
          >
            Reset to preset
          </button>
        )}
      </div>
    );
  };

  return (
    <details className="override-panel">
      <summary>
        Edit exposure factors
        {Object.keys(edits).length > 0 ? ` (${Object.keys(edits).length} edited)` : ''}
      </summary>
      <p className="muted">
        A value you enter replaces the preset value for this receptor in this project only. A short
        source note is required, and a value without one is not used. Leave a value blank to keep
        the preset. The legacy method and the modern method each have their own factors; the modern
        ones apply to the named life stage (a mutagen's age segments use the same stage values).
      </p>
      <p className="override-title">Legacy method</p>
      {rows.legacy.map(renderRow)}
      <p className="override-title">Modern method</p>
      {rows.modern.map(renderRow)}
      <p className="override-title">Both methods</p>
      {renderRow(rows.lifetime)}
      {(Object.keys(edits).length > 0 || Object.keys(drafts).length > 0) && (
        <button
          type="button"
          className="btn"
          aria-label={`Reset to preset: all exposure factors of ${props.tag}`}
          onClick={() => {
            setDrafts({});
            props.onChange({
              ...state,
              receptors: Object.fromEntries(
                Object.entries(state.receptors).filter(([k]) => k !== subject),
              ),
            });
          }}
        >
          Reset to preset
        </button>
      )}
    </details>
  );
}
