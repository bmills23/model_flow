import { useId, useSyncExternalStore } from 'react';
import { getChemicals, subscribeChemicals } from '../project/store';

/**
 * The shared select over the project chemical list (`getChemicals`), for a screen that works on one
 * chemical at a time. `value` is a chemical id, blank for "Not set"; `onChange` gets the picked id. A
 * saved id that is no longer in the list stays selectable, marked as such, so opening a screen never
 * changes its choice. With nothing in the list the select is replaced by a pointer to the chemicals
 * screen, where chemicals are added.
 */
export function ProjectChemicalSelect(props: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  /** Text under the control, as the screens' `small` hints. */
  hint?: string;
}) {
  const { label, value, onChange, hint } = props;
  const list = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const id = useId();
  const missing = value !== '' && !list.some((c) => c.id === value);
  const addLink = (
    <>
      Add chemicals to the project on the <a href="#/chemicals">chemicals screen</a>.
    </>
  );
  if (list.length === 0 && !missing) {
    return (
      <div className="field project-chemical-select">
        <span className="field-label">{label}</span>
        <p className="derived">No chemicals in this project yet. {addLink}</p>
        {hint !== undefined && <small>{hint}</small>}
      </div>
    );
  }
  return (
    <div className="field project-chemical-select">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not set</option>
        {missing && <option value={value}>{value} (not in the project list)</option>}
        {list.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {hint !== undefined && <small>{hint}</small>}
      {missing && <small>{addLink}</small>}
    </div>
  );
}
