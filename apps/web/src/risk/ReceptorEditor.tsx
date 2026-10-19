import { Field } from '../ui/controls';
import { resetField, setField, type OverridesState } from '../overrides/model';
import { receptorKey, type ReceptorScreen } from '../overrides/receptors';
import type { PresetId } from './form';
import { editableRows, shownValue as shown, type EditableRow as Row } from './receptorRows';

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
  const set = (key: string, value: string): void =>
    props.onChange({
      ...state,
      receptors:
        value === ''
          ? resetField(state.receptors, subject, key)
          : setField(state.receptors, subject, key, { value, note: '' }),
    });

  const renderRow = (r: Row) => {
    const entry = edits[r.key];
    const problem = entry === undefined ? null : problemOf(entry.value);
    const id = `rf-${subject}-${r.key}`;
    return (
      <div key={r.key} className={entry === undefined ? 'override-row' : 'override-row edited'}>
        <Field
          label={`${r.label} (${r.unit})`}
          value={entry?.value ?? ''}
          placeholder={shown(r.preset)}
          hint={`Preset: ${shown(r.preset)} ${r.unit}`}
          onChange={(v) => set(r.key, v)}
        />
        {entry !== undefined && <span className="edited-mark">Edited</span>}
        {problem !== null && (
          <p id={`${id}-problem`} className="override-problem" role="status">
            {problem}
          </p>
        )}
        {entry !== undefined && (
          <button
            type="button"
            className="btn"
            aria-label={`Reset ${r.label.toLowerCase()} of ${props.tag} to the preset`}
            onClick={() => set(r.key, '')}
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
        A value you enter replaces the preset value for this receptor in this project only. Leave a
        box blank to keep the preset. The legacy method and the modern method each have their own
        factors; the modern ones apply to the named life stage (a mutagen's age segments use the
        same stage values).
      </p>
      <h4 className="override-title">Legacy method</h4>
      {rows.legacy.map(renderRow)}
      <h4 className="override-title">Modern method</h4>
      {rows.modern.map(renderRow)}
      <h4 className="override-title">Both methods</h4>
      {renderRow(rows.lifetime)}
      {Object.keys(edits).length > 0 && (
        <button
          type="button"
          className="btn"
          aria-label={`Reset all exposure factors of ${props.tag} to the preset`}
          onClick={() =>
            props.onChange({
              ...state,
              receptors: Object.fromEntries(
                Object.entries(state.receptors).filter(([k]) => k !== subject),
              ),
            })
          }
        >
          Reset to preset
        </button>
      )}
    </details>
  );
}
