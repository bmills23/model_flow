import { useState } from 'react';
import { DIRECT_PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { Field, Group, Seg } from '../ui/controls';
import { AlertDialog } from '../ui/AlertDialog';
import { useOverrides } from '../overrides/useOverrides';
import { MAX_NAME_LENGTH, receptorKey, type ReceptorScreen } from '../overrides/receptors';
import { ReceptorEditor } from './ReceptorEditor';
import { PATHWAY_LABELS } from './chartData';
import { PRESET_LABELS, type PresetId, type ReceptorForm } from './form';

const PRESETS: PresetId[] = ['resident', 'worker', 'child'];

/** One receptor: scenario preset, the pathways it is exposed by, and the site-specific factors presets leave open. */
export function ReceptorPanel(props: {
  tag: string;
  id: 'a' | 'b';
  /** Which screen's receptor this is; its edits are kept apart from the other screen's. */
  screen: ReceptorScreen;
  form: ReceptorForm;
  onChange: (next: ReceptorForm) => void;
  /** Leave out the pathway switches (the guided flow sets pathways once, in step 4a). */
  hidePathways?: boolean;
  /** Open the site-specific factors (the guided flow opens them when a step names one as missing). */
  openSiteFactors?: boolean;
}) {
  const { form } = props;
  const [overrides, setOverrides] = useOverrides();
  const subject = receptorKey(props.screen, props.id);
  const name = overrides.receptorNames[subject] ?? '';
  const shownTag = name.trim() === '' ? props.tag : name.trim();
  const [pending, setPending] = useState<PresetId | null>(null);
  const factorEdits = Object.keys(overrides.receptors[subject] ?? {}).length;
  const setName = (v: string): void =>
    setOverrides({
      ...overrides,
      receptorNames:
        v.trim() === ''
          ? Object.fromEntries(
              Object.entries(overrides.receptorNames).filter(([k]) => k !== subject),
            )
          : { ...overrides.receptorNames, [subject]: v },
    });
  const choosePreset = (v: PresetId): void => {
    if (v === form.preset) return;
    if (factorEdits > 0) setPending(v);
    else props.onChange({ ...form, preset: v });
  };
  const set = <K extends keyof ReceptorForm>(k: K, v: ReceptorForm[K]): void =>
    props.onChange({ ...form, [k]: v });
  return (
    <fieldset className="receptor">
      <legend>{shownTag}</legend>
      <label className="field">
        <span className="field-label">Receptor name (optional)</span>
        <input
          type="text"
          autoComplete="off"
          maxLength={MAX_NAME_LENGTH}
          value={name}
          placeholder={props.tag}
          onChange={(e) => setName(e.target.value)}
        />
        <small>Used in tables, downloads and the report in place of {props.tag}.</small>
      </label>
      <Seg
        legend="Scenario preset"
        name={`preset-${props.id}`}
        value={form.preset}
        onChange={choosePreset}
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
      {pending !== null && (
        <AlertDialog className="alert" label="Change preset" onCancel={() => setPending(null)}>
          <p>
            <strong>
              {shownTag} has {factorEdits} edited exposure factor{factorEdits === 1 ? '' : 's'}.
            </strong>{' '}
            The edits belong to the {PRESET_LABELS[form.preset].toLowerCase()} preset. Switching to{' '}
            {PRESET_LABELS[pending].toLowerCase()} resets them to that preset's values.
          </p>
          <div className="u-actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                setOverrides({
                  ...overrides,
                  receptors: Object.fromEntries(
                    Object.entries(overrides.receptors).filter(([k]) => k !== subject),
                  ),
                });
                props.onChange({ ...form, preset: pending });
                setPending(null);
              }}
            >
              Switch and reset edits
            </button>
            <button type="button" className="button button-quiet" onClick={() => setPending(null)}>
              Keep {PRESET_LABELS[form.preset].toLowerCase()}
            </button>
          </div>
        </AlertDialog>
      )}
      <ReceptorEditor
        screen={props.screen}
        which={props.id}
        tag={shownTag}
        preset={form.preset}
        state={overrides}
        onChange={setOverrides}
      />
      {props.hidePathways === true ? null : (
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
            A pathway runs only when a chemical has a concentration for its medium. Homegrown
            produce runs only for a chemical that uses the plants and ecology plant factors.
          </p>
        </Group>
      )}
      <Group title="Site-specific factors" open={props.openSiteFactors ?? false}>
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
