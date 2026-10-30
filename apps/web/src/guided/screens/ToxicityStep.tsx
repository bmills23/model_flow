import { HelpLink } from '../../docs/HelpLink';
import { useMemo, useSyncExternalStore } from 'react';
import { toxRows, type ChemicalDb } from '../../risk/chemicalDb';
import { useChemicalDb } from '../../risk/useChemicalDb';
import { fmtTox } from '../../risk/format';
import { OverridesPanel } from '../../overrides/OverridesPanel';
import { resetField, setField } from '../../overrides/model';
import { USER_SOURCE } from '../../overrides/toxicity';
import { useEffectiveDb, useOverrides } from '../../overrides/useOverrides';
import { getChemicals, getGuided, subscribeChemicals, subscribeGuided } from '../../project/store';
import { guidedHref } from '../../steps';
import { missingExposureInputs } from '../exposure';
import { inhalationBasis, neededToxFields, toxicityGaps } from '../toxNeeds';

/**
 * Step 4c, toxicity values: only the values the ticked pathways need, per chemical, each with its source.
 * The inhalation basis is text that follows the method chosen in step 3d (no control of its own), with the
 * other basis as the check. What a ticked pathway still lacks is named: a chemical with no value for a
 * route, and an exposure input the receptor does not have (USABILITY M3).
 */
export function ToxicityStep() {
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const chemicals = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const [overrides, setOverrides] = useOverrides();
  const { db: base, error } = useChemicalDb();
  const db: ChemicalDb | null = useEffectiveDb(base, overrides);
  const fields = useMemo(() => neededToxFields(guided), [guided]);
  const refs = useMemo(() => chemicals.map((c) => ({ id: c.id, name: c.name })), [chemicals]);
  const gaps = useMemo(
    () => (db === null ? [] : toxicityGaps(guided, refs, db)),
    [guided, refs, db],
  );
  const exposureGaps = useMemo(() => missingExposureInputs(guided, overrides), [guided, overrides]);
  const inhalation = fields.includes('iur') || fields.includes('rfci');
  const basis = inhalationBasis(guided.run.basis);

  const heading = (
    <>
      <h1 id="guided-tox-heading">Toxicity values</h1>
      <HelpLink target="step/toxicity" />
    </>
  );
  if (chemicals.length === 0) {
    return (
      <section aria-labelledby="guided-tox-heading" className="guided-exposure">
        {heading}
        <p className="muted">
          Add at least one chemical in <a href={guidedHref('chemicals')}>step 1</a> first.
        </p>
      </section>
    );
  }
  if (fields.length === 0) {
    return (
      <section aria-labelledby="guided-tox-heading" className="guided-exposure">
        {heading}
        <p className="muted" role="status">
          No pathway is ticked, so no toxicity value is needed yet.{' '}
          <a href={guidedHref('pathways')}>Tick a pathway in step 4a</a>.
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="guided-tox-heading" className="guided-exposure">
      {heading}
      <p className="muted">
        Only the values the ticked pathways use are listed: the oral values for soil, water and
        swimming{inhalation ? ', and the inhalation values for air' : ''}. Each comes from the EPA
        RSL tables with its source; enter your own for this project with a source note.
      </p>
      {inhalation ? (
        <section className="guided-basis" aria-label="Inhalation basis">
          <h2>Inhalation basis</h2>
          <p>{basis.main}</p>
          <p className="muted">{basis.check}</p>
          <p className="muted">
            Change the method in <a href={guidedHref('run')}>step 3d</a>.
          </p>
        </section>
      ) : null}
      {gaps.length + exposureGaps.length > 0 ? (
        <section className="guided-missing" aria-label="Missing inputs" role="alert">
          <h2>Missing inputs</h2>
          <ul>
            {gaps.map((g) => (
              <li key={`${g.chemicalId}-${g.route}`}>{g.text}</li>
            ))}
            {exposureGaps.map((m) => (
              <li key={`${m.which}-${m.label}`}>
                {m.receptor} has no {m.label.toLowerCase()} ({m.unit}), which{' '}
                {m.pathways.map((p) => p.toLowerCase()).join(', ')} needs. Enter it in{' '}
                <a href={guidedHref('receptors')}>step 4b</a>.
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {error !== null ? (
        <p className="alert" role="alert">
          The chemical database did not load: {error}
        </p>
      ) : db === null ? (
        <p className="muted">Loading the toxicity values...</p>
      ) : (
        refs.map((c) => {
          const rec = db.byId.get(c.id);
          if (rec === undefined) {
            return (
              <fieldset className="chem-card" key={c.id}>
                <legend>{c.name}</legend>
                <p className="muted">This chemical is not in the toxicity tables.</p>
              </fieldset>
            );
          }
          const rows = toxRows(rec, db.sourceKeys).filter((r) => fields.includes(r.key));
          return (
            <fieldset className="chem-card" key={c.id}>
              <legend>
                {rec.name}
                {rec.cas ? ` (${rec.cas})` : ''}
              </legend>
              <div className="sat-wrap">
                <table className="sat tox">
                  <caption className="sr-only">Toxicity values of {rec.name} used here</caption>
                  <thead>
                    <tr>
                      <th scope="col">Value</th>
                      <th scope="col">Used</th>
                      <th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => {
                      const r = rows.find((x) => x.key === f);
                      const label = r?.label ?? FIELD_LABEL[f];
                      return (
                        <tr key={f}>
                          <th scope="row">
                            {label} <small>{r?.unit ?? FIELD_UNIT[f]}</small>
                          </th>
                          <td>{r === undefined ? 'none' : fmtTox(r.value)}</td>
                          <td>
                            {r === undefined
                              ? 'The database gives this chemical no value'
                              : r.sourceKey === USER_SOURCE
                                ? `${r.source} (edited)`
                                : r.source}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <OverridesPanel
                rec={rec}
                sourceKeys={db.sourceKeys}
                edits={overrides.toxicity[c.id]}
                fields={fields}
                onEdit={(field, entry) =>
                  setOverrides({
                    ...overrides,
                    toxicity:
                      entry === null
                        ? resetField(overrides.toxicity, c.id, field)
                        : setField(overrides.toxicity, c.id, field, entry),
                  })
                }
              />
            </fieldset>
          );
        })
      )}
    </section>
  );
}

const FIELD_LABEL = {
  sfo: 'Oral slope factor',
  iur: 'Inhalation unit risk',
  rfdo: 'Oral reference dose',
  rfci: 'Inhalation reference concentration',
} as const;
const FIELD_UNIT = {
  sfo: '(mg/kg-d)^-1',
  iur: '(ug/m3)^-1',
  rfdo: 'mg/kg-d',
  rfci: 'mg/m3',
} as const;
