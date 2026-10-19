import type { Medium } from '@model-flow/engine';
import type { DermalForm } from '@model-flow/data/rsl-types';
import { Field, Seg } from '../ui/controls';
import type { WellFeed } from '../transport/wellFeed';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { HouseholdRiskFeed } from '../household/feeds';
import type { ProduceRiskFeed } from '../plantsEco/feeds';
import { toxRows, type ChemicalDb, type ChemicalRecord } from './chemicalDb';
import { MEDIA, type ChemicalRow, type HouseholdOutdoor } from './form';
import { fmtTox } from './format';

/** One chemical: its RSL toxicity values with sources, then the concentration entered for each medium. */
export function ChemicalCard(props: {
  row: ChemicalRow;
  rec: ChemicalRecord;
  db: ChemicalDb;
  well: WellFeed | null;
  /** Default true. The cleanup screen shows the concentration fields only where the ratios matter. */
  showConcentrations?: boolean;
  concentrationNote?: string;
  vapor: VaporRiskFeed | null;
  surface: SurfaceWaterFeed | null;
  household: HouseholdRiskFeed | null;
  /** The plants and ecology screen's produce result; absent where the screen has no produce pathway. */
  produce?: ProduceRiskFeed | null;
  /** Offer the plant-factor switch even where concentrations are hidden (the cleanup screen). */
  showProduce?: boolean;
  /** Replaces the explanation beside the plant-factor switch. */
  produceNote?: string;
  onChange: (next: ChemicalRow) => void;
  onRemove: () => void;
}) {
  const { row, rec, db, well, vapor, surface, household } = props;
  const showConc = props.showConcentrations ?? true;
  const vaporHere = vapor !== null && vapor.chemicalId === row.id;
  const householdHere = household !== null && household.chemicalId === row.id;
  const produceHere = props.produce != null && props.produce.chemicalId === row.id;
  const rows = toxRows(rec, db.sourceKeys);
  const t = rec.tox;
  const setConc = (m: Medium, v: string): void =>
    props.onChange({ ...row, conc: { ...row.conc, [m]: v } });
  const facts = [
    t.mutagen ? 'Mutagen: the age-dependent adjustment applies to the modern cancer dose.' : '',
    t.volatile ? 'Volatile.' : '',
    t.giabs !== undefined ? `Gastrointestinal absorption ${fmtTox(t.giabs)}.` : '',
    t.absd !== undefined ? `Dermal soil absorption ${fmtTox(t.absd)}.` : '',
    t.special
      ? `RSL special case (${t.special}); computed here as an ordinary chemical, see the warnings.`
      : '',
  ].filter(Boolean);
  return (
    <fieldset className="chem-card">
      <legend>
        {rec.name}
        {rec.cas ? ` (${rec.cas})` : ''}
      </legend>
      <div className="sat-wrap">
        <table className="sat tox">
          <caption className="sr-only">Toxicity values of {rec.name} with their sources</caption>
          <thead>
            <tr>
              <th scope="col">Quantity</th>
              <th scope="col">Value</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">
                  {r.label}
                  <small className="tox-unit">{r.unit}</small>
                </th>
                <td className="tox-value">{fmtTox(r.value)}</td>
                <td>
                  <span className="source-tag">{r.source}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="note">
          The RSL gives this chemical no cancer or noncancer toxicity value, so no risk can be
          quantified for it.
        </p>
      )}
      {facts.length > 0 && <p className="muted">{facts.join(' ')}</p>}

      {showConc && props.concentrationNote && <p className="muted">{props.concentrationNote}</p>}
      {showConc && (
        <div className="fields">
          {MEDIA.map((m) =>
            m.key === 'groundwater' && row.groundwaterFromWell ? (
              <p className="muted well-note" key={m.key}>
                Groundwater concentration: {well ? well.label : 'no well result held'}.
              </p>
            ) : (m.key === 'bathroomAir' && row.bathroomFromHousehold) ||
              (m.key === 'indoorAir' && row.indoorFromHousehold) ||
              (m.key === 'outdoorAir' && row.outdoorFromHousehold !== '') ? (
              <p className="muted well-note" key={m.key}>
                {m.label} concentration:{' '}
                {householdHere ? household.label : 'no household result held for this chemical'}.
              </p>
            ) : (m.key === 'indoorAir' && row.indoorFromVapor) ||
              (m.key === 'outdoorAir' && row.outdoorFromVapor) ? (
              <p className="muted well-note" key={m.key}>
                {m.label} concentration:{' '}
                {vaporHere ? vapor.label : 'no vapor result held for this chemical'}.
              </p>
            ) : m.key === 'surfaceWater' && row.surfaceWaterFromModel ? (
              <p className="muted well-note" key={m.key}>
                Surface water concentration:{' '}
                {surface ? surface.label : 'no surface water result held'}.
              </p>
            ) : (
              <Field
                key={m.key}
                label={`${m.label} (${m.unit})`}
                value={row.conc[m.key] ?? ''}
                onChange={(v) => setConc(m.key, v)}
              />
            ),
          )}
        </div>
      )}
      {showConc && (well !== null || row.groundwaterFromWell) && (
        <label className="check">
          <input
            type="checkbox"
            checked={row.groundwaterFromWell}
            onChange={(e) => props.onChange({ ...row, groundwaterFromWell: e.target.checked })}
          />
          <span>Use the transport well result for the groundwater concentration</span>
        </label>
      )}
      {showConc && (householdHere || row.bathroomFromHousehold) && (
        <label className="check">
          <input
            type="checkbox"
            checked={row.bathroomFromHousehold}
            onChange={(e) => props.onChange({ ...row, bathroomFromHousehold: e.target.checked })}
          />
          <span>Use the household shower air for the bathroom air concentration</span>
        </label>
      )}
      {showConc &&
        ((householdHere && household?.indoorAir !== undefined) || row.indoorFromHousehold) && (
          <label className="check">
            <input
              type="checkbox"
              checked={row.indoorFromHousehold}
              onChange={(e) =>
                props.onChange({
                  ...row,
                  indoorFromHousehold: e.target.checked,
                  indoorFromVapor: e.target.checked ? false : row.indoorFromVapor,
                })
              }
            />
            <span>
              Use the household whole-house air (RSL term) for the indoor air concentration
            </span>
          </label>
        )}
      {showConc && (householdHere || row.outdoorFromHousehold !== '') && (
        <Seg<HouseholdOutdoor>
          legend="Outdoor air from the household screen"
          name={`household-outdoor-${row.id}`}
          value={row.outdoorFromHousehold}
          options={[
            { value: '', label: 'None' },
            { value: 'sprinkler', label: 'Sprinkler spray' },
            { value: 'particulate', label: 'Windblown particulates' },
          ]}
          onChange={(v) =>
            props.onChange({
              ...row,
              outdoorFromHousehold: v,
              outdoorFromVapor: v === '' ? row.outdoorFromVapor : false,
            })
          }
        />
      )}
      {(vaporHere || row.indoorFromVapor) && (
        <label className="check">
          <input
            type="checkbox"
            checked={row.indoorFromVapor}
            onChange={(e) =>
              props.onChange({
                ...row,
                indoorFromVapor: e.target.checked,
                indoorFromHousehold: e.target.checked ? false : row.indoorFromHousehold,
              })
            }
          />
          <span>Use the vapor screen indoor air for the indoor air concentration</span>
        </label>
      )}
      {(vaporHere || row.outdoorFromVapor) && (
        <label className="check">
          <input
            type="checkbox"
            checked={row.outdoorFromVapor}
            onChange={(e) =>
              props.onChange({
                ...row,
                outdoorFromVapor: e.target.checked,
                outdoorFromHousehold: e.target.checked ? '' : row.outdoorFromHousehold,
              })
            }
          />
          <span>Use the vapor screen outdoor air for the outdoor air concentration</span>
        </label>
      )}
      {(showConc || props.showProduce === true) && (produceHere || row.produceFromPlantsEco) && (
        <label className="check">
          <input
            type="checkbox"
            checked={row.produceFromPlantsEco}
            onChange={(e) => props.onChange({ ...row, produceFromPlantsEco: e.target.checked })}
          />
          <span>
            {props.produceNote ??
              'Use the plants and ecology plant factors for homegrown produce (driven by the soil concentration; receptors switch the pathway on)'}
          </span>
        </label>
      )}
      {(surface !== null || row.surfaceWaterFromModel) && (
        <label className="check">
          <input
            type="checkbox"
            checked={row.surfaceWaterFromModel}
            onChange={(e) => props.onChange({ ...row, surfaceWaterFromModel: e.target.checked })}
          />
          <span>Use the surface water result for the swimming concentration</span>
        </label>
      )}
      {rec.phys?.values.kp !== undefined && (
        <div>
          <Seg
            legend="Dermal contact with water (modern method)"
            name={`dermal-form-${row.id}`}
            value={row.dermalForm ?? ''}
            options={[
              { value: 'organic', label: 'Organic lag-time model' },
              { value: 'inorganic', label: 'Inorganic, permeability times time' },
              { value: '', label: 'Not set' },
            ]}
            onChange={(v) =>
              props.onChange({ ...row, dermalForm: v === '' ? undefined : (v as DermalForm) })
            }
          />
          <small>
            {rec.phys.dermalForm === undefined
              ? 'The RSL publishes no dermal water value for this analyte, so the form is not known. Dermal water is not quantified until you choose one.'
              : `Set from the RSL's published dermal water values (${rec.phys.dermalForm}).`}
          </small>
        </div>
      )}
      <div className="card-actions">
        <button
          type="button"
          className="btn remove"
          aria-label={`Remove ${rec.name}`}
          onClick={props.onRemove}
        >
          Remove
        </button>
      </div>
    </fieldset>
  );
}
