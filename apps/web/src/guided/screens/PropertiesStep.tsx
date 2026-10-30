import { HelpLink } from '../../docs/HelpLink';
import { useId, useMemo, useSyncExternalStore } from 'react';
import { getGuided, setGuided, subscribeGuided } from '../../project/store';
import { Field } from '../../ui/controls';
import { TEXTURE_OPTIONS, type TextureChoice } from '../../vapor/form';
import { chain } from '../chain';
import {
  propertyView,
  setProperty,
  setSoilType,
  type PropertyFieldView,
  type PropertyGroupView,
  type SoilTypeView,
} from '../propertyCatalog';
import { PROVENANCE_TEXT, type Provenance } from '../provenance';

/**
 * Step 3a, site properties: the site values the models chosen in step 2 read, in a few groups, each
 * value tagged with where it came from. A value typed once is written to every model it stands for.
 */

const withUnit = (label: string, unit: string): string =>
  unit === '' ? label : `${label} (${unit})`;

const MIXED_NOTE = 'The layers or models hold different values; a value typed here sets them all.';

function hintOf(tag: Provenance, mixed: boolean, extra?: string): string {
  return [PROVENANCE_TEXT[tag], mixed ? MIXED_NOTE : '', extra ?? ''].filter((x) => x).join('. ');
}

function PropertyInput({ view }: { view: PropertyFieldView }) {
  const { field } = view;
  const save = (value: string, index?: number): void =>
    setGuided(setProperty(getGuided(), field.id, value, index));
  if (view.items !== null) {
    return (
      <fieldset className="guided-prop-layers">
        <legend>{withUnit(field.label, field.unit)}</legend>
        <div className="fields">
          {view.items.map((item) => (
            <div key={item.index} className="guided-prop" data-tag={item.tag}>
              <Field
                label={withUnit(item.label, field.unit)}
                value={item.value}
                onChange={(v) => save(v, item.index)}
                hint={PROVENANCE_TEXT[item.tag]}
              />
            </div>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <div className="guided-prop" data-tag={view.tag}>
      <Field
        label={withUnit(field.label, field.unit)}
        value={view.value}
        onChange={(v) => save(v)}
        hint={hintOf(view.tag, view.mixed, field.hint)}
      />
    </div>
  );
}

const SOIL_TYPE_LABEL = {
  unsaturated: 'Soil type of the unsaturated zone',
  saturated: 'Soil type below the water table',
} as const;

function SoilTypeSelect({ view }: { view: SoilTypeView }) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="field guided-soil-type">
      <label className="field-label" htmlFor={id}>
        {SOIL_TYPE_LABEL[view.id]}
      </label>
      <select
        id={id}
        value={view.value}
        aria-describedby={hintId}
        onChange={(e) =>
          setGuided(setSoilType(getGuided(), view.id, e.target.value as TextureChoice))
        }
      >
        {view.value === '' ? (
          <option value="" disabled>
            Differs between layers
          </option>
        ) : null}
        {TEXTURE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value === 'custom' ? 'None: values entered by hand' : o.label}
          </option>
        ))}
      </select>
      <small id={hintId}>
        A soil type fills the porosity, water content, conductivity and bulk density of every layer
        with the EPA class averages. Thickness and organic carbon stay as they are, and every filled
        value can still be changed.
      </small>
    </div>
  );
}

function Group({ group }: { group: PropertyGroupView }) {
  const headingId = useId();
  const single = group.fields.filter((f) => f.items === null);
  const layered = group.fields.filter((f) => f.items !== null);
  return (
    <section className="guided-prop-group" aria-labelledby={headingId}>
      <h2 id={headingId}>{group.label}</h2>
      <p className="muted">{group.intro}</p>
      {group.soilType === null ? null : <SoilTypeSelect view={group.soilType} />}
      {single.length === 0 ? null : (
        <div className="fields">
          {single.map((f) => (
            <PropertyInput key={f.field.id} view={f} />
          ))}
        </div>
      )}
      {layered.map((f) => (
        <PropertyInput key={f.field.id} view={f} />
      ))}
    </section>
  );
}

export function PropertiesStep() {
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const sound = useMemo(() => chain(guided.site).problems.length === 0, [guided.site]);
  const view = useMemo(() => propertyView(guided), [guided]);

  return (
    <section aria-labelledby="guided-properties-heading" className="guided-properties">
      <h1 id="guided-properties-heading">Site properties</h1>
      <HelpLink target="step/properties" />
      <p className="muted">
        The site values the models from step 2 read, for every chemical at once. Each value says
        where it came from; a value one of those models needs and nobody entered is marked as
        needed. A value typed once is used by every model it describes.
      </p>
      {!sound ? (
        <p>
          The answers in step 2 do not work together yet, so there are no models to describe.{' '}
          <a href="#/step/site">Finish the site model</a> first; this step then lists the values its
          models need.
        </p>
      ) : view.groups.length === 0 ? (
        <p>
          Nothing to enter here: with the answers in step 2 no model runs, so the concentrations you
          enter in step 3b are used as they are.
        </p>
      ) : (
        <>
          <p role="status" className="guided-prop-summary">
            {view.needed === 0
              ? 'Every value the chosen models need has an entry.'
              : `${view.needed} ${view.needed === 1 ? 'value is' : 'values are'} still needed, each marked "Needed" below.`}
          </p>
          {view.groups.map((g) => (
            <Group key={g.id} group={g} />
          ))}
        </>
      )}
    </section>
  );
}
