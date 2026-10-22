import type { VaporChemicalRow } from '../vapor/chemicals';
import { getChemicals } from '../project/store';
import { ProjectChemicalSelect } from './ProjectChemicalSelect';

/**
 * The chemical select of the fate screens (transport, vadose, saturated): the project chemical list,
 * with the screen's properties filled from the fate data when the chosen chemical is in it. The fate
 * data covers the chemicals of the vapor database (RSL rows with a temperature-correction or
 * biodegradation record); a project chemical outside it is shown as unavailable here, with the reason,
 * and the typed properties stay as they are. `onPick` gets the id and the matching row, if any.
 */
export function FateChemicalSelect(props: {
  value: string;
  rows: VaporChemicalRow[];
  failed: boolean;
  onPick: (id: string, row: VaporChemicalRow | null) => void;
  /** What the database does not supply on this screen. */
  note: string;
}) {
  const { value, rows, failed, onPick, note } = props;
  const row = rows.find((c) => c.id === value) ?? null;
  const name = getChemicals().find((c) => c.id === value)?.name ?? value;
  return (
    <>
      <ProjectChemicalSelect
        label="Chemical"
        value={value}
        onChange={(id) => onPick(id, rows.find((c) => c.id === id) ?? null)}
        hint={
          failed
            ? 'The chemical database did not load; enter the properties by hand.'
            : `Properties are filled from the EPA RSL chemical tables and stay editable. ${note}`
        }
      />
      {value !== '' && !failed && rows.length > 0 && row === null && (
        <p className="derived">
          {name} is not in the fate property data (the chemicals with a temperature-correction or
          biodegradation record), so nothing was filled. Enter the properties by hand.
        </p>
      )}
    </>
  );
}
