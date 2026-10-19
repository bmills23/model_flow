import { DIRECT_PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { Field, Group, Seg } from '../ui/controls';
import { PATHWAY_LABELS } from './chartData';
import { PRESET_LABELS, type PresetId, type ReceptorForm } from './form';

const PRESETS: PresetId[] = ['resident', 'worker', 'child'];

/** One receptor: scenario preset, the pathways it is exposed by, and the site-specific factors presets leave open. */
export function ReceptorPanel(props: {
  tag: string;
  id: string;
  form: ReceptorForm;
  onChange: (next: ReceptorForm) => void;
}) {
  const { form } = props;
  const set = <K extends keyof ReceptorForm>(k: K, v: ReceptorForm[K]): void =>
    props.onChange({ ...form, [k]: v });
  return (
    <fieldset className="receptor">
      <legend>{props.tag}</legend>
      <Seg
        legend="Scenario preset"
        name={`preset-${props.id}`}
        value={form.preset}
        onChange={(v) => set('preset', v)}
        options={PRESETS.map((p) => ({ value: p, label: PRESET_LABELS[p] }))}
      />
      <p className="muted">
        {form.preset === 'resident' &&
          'Legacy: an adult for 24 years (1991 default factors). Modern: a child for 6 years then an adult for 20, with the age-dependent adjustment for mutagens.'}
        {form.preset === 'worker' &&
          'Legacy: 250 days a year for 25 years, 70 kg. Modern: the composite worker, 80 kg.'}
        {form.preset === 'child' &&
          'Legacy: a 6-year child, 15 kg. Modern: the resident child stage alone.'}
      </p>
      <Group title="Pathways">
        {DIRECT_PATHWAY_IDS.map((p: PathwayId) => (
          <label className="check" key={p}>
            <input
              type="checkbox"
              checked={form.pathways[p]}
              onChange={(e) => set('pathways', { ...form.pathways, [p]: e.target.checked })}
            />
            <span>{PATHWAY_LABELS[p]}</span>
          </label>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={form.produce}
            onChange={(e) => set('produce', e.target.checked)}
          />
          <span>
            {PATHWAY_LABELS.produce} (intake and plant factors from the plants and ecology screen)
          </span>
        </label>
        <p className="muted">
          A pathway runs only when a chemical has a concentration for its medium. Homegrown produce
          runs only for a chemical that uses the plants and ecology plant factors.
        </p>
      </Group>
      <Group title="Site-specific factors" open={false}>
        <p className="muted">
          Neither method gives these a default. Left blank, the pathways that need them are not
          quantified and the warnings say so.
        </p>
        <div className="fields">
          <Field
            label="Soil skin area (cm2)"
            value={form.soilSkinArea}
            onChange={(v) => set('soilSkinArea', v)}
          />
          <Field
            label="Soil adherence (mg/cm2)"
            value={form.soilAdherence}
            onChange={(v) => set('soilAdherence', v)}
          />
          <Field
            label="Drinking water (L/day)"
            value={form.waterIngestion}
            onChange={(v) => set('waterIngestion', v)}
          />
          <Field
            label="Skin area for water (cm2)"
            value={form.waterSkinArea}
            onChange={(v) => set('waterSkinArea', v)}
            hint="Bathing and swimming."
          />
          <Field
            label="Breathing rate (m3/h)"
            value={form.inhalationRate}
            onChange={(v) => set('inhalationRate', v)}
            hint="Legacy method only; the modern method works from air concentration."
          />
          <Field
            label="Bathing time (h/day)"
            value={form.bathTime}
            onChange={(v) => set('bathTime', v)}
            hint="Dermal water and shower air."
          />
          <Field
            label="Swimming time (h/day)"
            value={form.swimTime}
            onChange={(v) => set('swimTime', v)}
          />
          <Field
            label="Swimming (days/yr)"
            value={form.swimDays}
            onChange={(v) => set('swimDays', v)}
          />
          <Field
            label="Outdoor air time (h/day)"
            value={form.outdoorTime}
            onChange={(v) => set('outdoorTime', v)}
          />
        </div>
      </Group>
    </fieldset>
  );
}
