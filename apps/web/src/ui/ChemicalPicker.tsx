import type { VaporChemicalRow } from '../vapor/chemicals';

/**
 * A chemical select for the fate screens. Picking a row fills the form (the caller decides which
 * fields); the blank choice keeps whatever is typed. `note` says what the database does not supply.
 */
export function ChemicalPicker(props: {
  id: string;
  rows: VaporChemicalRow[];
  failed: boolean;
  value: string;
  onPick: (row: VaporChemicalRow | null) => void;
  note: string;
}) {
  const { id, rows, failed, value, onPick, note } = props;
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">Fill from the chemical database</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onPick(rows.find((c) => c.id === e.target.value) ?? null)}
      >
        <option value="">Entered by hand</option>
        {rows.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.id})
          </option>
        ))}
      </select>
      <small>
        {failed
          ? 'The chemical database did not load; enter the properties by hand.'
          : `Source: the EPA RSL chemical tables. Every filled value stays editable. ${note}`}
      </small>
    </label>
  );
}
