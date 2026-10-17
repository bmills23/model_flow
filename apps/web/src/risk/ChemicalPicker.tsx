import { useId, useMemo, useState } from 'react';
import { searchChemicals, toxRows, type ChemicalDb } from './chemicalDb';
import { fmtTox } from './format';

/** Search over the lazily loaded RSL list by name or CAS number; each hit shows its sources before it is added. */
export function ChemicalPicker(props: {
  db: ChemicalDb | null;
  error: string | null;
  selected: ReadonlySet<string>;
  onAdd: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const listId = useId();
  const hits = useMemo(
    () => (props.db ? searchChemicals(props.db, query, 12) : []),
    [props.db, query],
  );
  const open = hits.filter((h) => !props.selected.has(h.id));
  const already = hits.length - open.length;
  return (
    <div className="picker">
      <label className="field">
        <span className="field-label">Find a chemical (name or CAS number)</span>
        <input
          type="text"
          inputMode="search"
          autoComplete="off"
          value={query}
          disabled={!props.db}
          placeholder={props.db ? 'benzene, 71-43-2' : 'Loading the chemical list...'}
          aria-controls={listId}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="muted" role="status">
        {props.error
          ? `The chemical list could not be loaded: ${props.error}`
          : props.db
            ? `${props.db.chemicals.length} chemicals, EPA Regional Screening Levels, November 2024.`
            : 'Loading the chemical list...'}
      </p>
      <ul className="hits" id={listId}>
        {open.map((h) => {
          const rows = toxRows(h, props.db!.sourceKeys);
          return (
            <li key={h.id}>
              <button
                type="button"
                className="btn hit"
                onClick={() => {
                  props.onAdd(h.id);
                  setQuery('');
                }}
              >
                <span className="hit-name">
                  Add {h.name}
                  {h.cas ? ` (${h.cas})` : ''}
                </span>
                <span className="hit-tox">
                  {rows.length === 0
                    ? 'no toxicity values in the RSL'
                    : rows.map((r) => `${r.key} ${fmtTox(r.value)} [${r.source}]`).join('; ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {already > 0 && (
        <p className="muted">
          {already === 1 ? 'One match is' : `${already} matches are`} already added.
        </p>
      )}
      {query.trim() !== '' && props.db && hits.length === 0 && (
        <p className="muted">No chemical matches that.</p>
      )}
    </div>
  );
}
