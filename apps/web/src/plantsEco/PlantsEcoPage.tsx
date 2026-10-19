import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  EFH_AGE_GROUPS,
  PRODUCE_CLASSES,
  TPH_SURROGATE_IDS,
  registry,
  type EfhAgeGroup,
  type Warning,
} from '@model-flow/engine';
import { loadCleanupProps, type CleanupProps } from '../cleanup/ssg';
import { DownloadCsv } from '../export/DownloadCsv';
import { getScreen, setScreen } from '../project/store';
import { ChemicalPicker } from '../risk/ChemicalPicker';
import { fmtHi } from '../risk/chartData';
import { useChemicalDb } from '../risk/useChemicalDb';
import { formatConcentration } from '../transport/chartData';
import { Field, Group, Seg } from '../ui/controls';
import { plantsEcoCsvTables } from './csv';
import { computeBenchmarks, computeEcossl, ECO_LEGACY_ID, ECO_MODERN_ID } from './eco';
import { loadEcossl, substanceFor, type EcosslSubstance } from './ecossl';
import {
  getProduceFeed,
  getTphFeed,
  setProduceFeed,
  setTphFeed,
  subscribeProduceFeed,
  subscribeTphFeed,
} from './feeds';
import {
  CLASS_LABELS,
  type IntakeMode,
  type PlantsEcoForm,
  type TphFractionRow,
  type TphSet,
  type UptakeChoice,
} from './form';
import { buildProduceFeed, computeProduce, LEGACY_PLANT_ID, MODERN_PLANT_ID } from './produce';
import { buildTphFeed, computeTph, TPH_LEGACY_ID, TPH_MODERN_ID } from './tph';

function kindOf(id: string): 'legacy' | 'modern' {
  return registry.get(id).kind === 'legacy' ? 'legacy' : 'modern';
}

function Kind({ id }: { id: string }) {
  const k = kindOf(id);
  return <span className={`badge badge-${k}`}>{k}</span>;
}

function Needs(props: { errors: string[] }) {
  return (
    <ul className="needs">
      {props.errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

function WarningList(props: { warnings: readonly Warning[] }) {
  if (props.warnings.length === 0) return null;
  return (
    <ul className="warnings">
      {props.warnings.map((w) => (
        <li key={`${w.code}:${w.message}`}>
          <span>{w.message}</span>
          <code>{w.code}</code>
        </li>
      ))}
    </ul>
  );
}

/** Loads a lazily imported value once; null until it arrives. */
function useLoaded<T>(load: () => Promise<T>): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    load().then(
      (v) => live && setValue(v),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [load]);
  return value;
}

const mgkg = (x: number): string => `${formatConcentration(x)} mg/kg`;
const fmtFactor = (x: number): string => x.toExponential(3);

function Select(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PlantsEcoPage() {
  const [form, setForm] = useState<PlantsEcoForm>(() => getScreen('plantsEco').form);
  useEffect(() => setScreen('plantsEco', { form }), [form]);
  const set = <K extends keyof PlantsEcoForm>(k: K, v: PlantsEcoForm[K]): void =>
    setForm((f) => ({ ...f, [k]: v }));
  const text = (k: keyof PlantsEcoForm & string, label: string, hint?: string) => (
    <Field
      label={label}
      value={String(form[k])}
      onChange={(v) => set(k, v as never)}
      {...(hint ? { hint } : {})}
    />
  );

  const { db, error: dbError } = useChemicalDb();
  const props = useLoaded<CleanupProps>(loadCleanupProps);
  const substances = useLoaded<EcosslSubstance[]>(loadEcossl);
  const held = useSyncExternalStore(subscribeProduceFeed, getProduceFeed, getProduceFeed);
  const heldTph = useSyncExternalStore(subscribeTphFeed, getTphFeed, getTphFeed);
  const [sent, setSent] = useState<string | null>(null);
  const [sentTph, setSentTph] = useState<string | null>(null);

  const choose = (id: string): void => {
    const rec = db?.byId.get(id);
    if (!rec) return;
    const p = props?.get(id);
    const s = (v: number | undefined): string => (v === undefined ? '' : String(v));
    setForm((f) => ({
      ...f,
      chemicalId: id,
      chemicalName: rec.name,
      logKow: s(p?.logKow),
      koc: s(p?.koc),
      kd: s(p?.kd),
    }));
    setSent(null);
  };

  const produce = useMemo(() => computeProduce(form), [form]);
  const feedResult = useMemo(() => buildProduceFeed(form, produce), [form, produce]);
  const substance =
    substances && form.chemicalId ? substanceFor(substances, form.chemicalId) : undefined;
  const ecossl = useMemo(() => computeEcossl(form, substance), [form, substance]);
  const benchmarks = useMemo(() => computeBenchmarks(form), [form]);
  const tph = useMemo(() => computeTph(form, props ?? new Map()), [form, props]);
  const csvTables = useMemo(
    () => plantsEcoCsvTables({ produce, ecossl, benchmarks, tph }),
    [produce, ecossl, benchmarks, tph],
  );

  const tphFeedResult = useMemo(() => buildTphFeed(form, tph), [form, tph]);
  const sendTph = (): void => {
    if (!tphFeedResult.ok) return;
    setTphFeed(tphFeedResult.feed);
    setSentTph(tphFeedResult.feed.label);
  };

  const send = (): void => {
    if (!feedResult.ok) return;
    setProduceFeed(feedResult.feed);
    setSent(feedResult.feed.label);
  };

  const surrogateOptions = [
    { value: '', label: 'No surrogate (unmapped)' },
    ...TPH_SURROGATE_IDS.map((id) => ({ value: id, label: db?.byId.get(id)?.name ?? id })),
  ];
  const setFraction = (i: number, next: TphFractionRow): void =>
    set(
      'tphFractions',
      form.tphFractions.map((f, j) => (j === i ? next : f)),
    );
  const startFromSurrogates = (): void =>
    set(
      'tphFractions',
      TPH_SURROGATE_IDS.map((id) => {
        const name = db?.byId.get(id)?.name ?? id;
        return {
          label: name.replace('Total Petroleum Hydrocarbons ', '').replace(/[()]/g, ''),
          family: name.includes('Aromatic') ? 'aromatic' : 'aliphatic',
          massFraction: '',
          surrogate: id,
          level: '',
        } satisfies TphFractionRow;
      }),
    );

  const plantId = form.uptake === 'legacy' ? LEGACY_PLANT_ID : MODERN_PLANT_ID;
  const tphId = form.tphSet === 'tphcwg' ? TPH_LEGACY_ID : TPH_MODERN_ID;
  const prodRow = produce.ok ? produce.row : undefined;

  return (
    <section aria-labelledby="pe-heading" className="plants-eco">
      <h1 id="pe-heading">Plants, ecology and TPH</h1>
      <p className="lede">
        Homegrown produce plant factors for the exposure and risk screen, screening ecological
        hazard quotients, and total petroleum hydrocarbon cleanup levels from a fraction
        composition. Values no primary source supplied are left for you to enter; nothing here is
        defaulted from memory.
      </p>

      <div className="transport-grid">
        <form className="inputs" onSubmit={(e) => e.preventDefault()} aria-label="Scenario inputs">
          <Group title="Chemical and soil">
            <ChemicalPicker
              db={db}
              error={dbError}
              selected={new Set(form.chemicalId ? [form.chemicalId] : [])}
              onAdd={choose}
            />
            <p className="muted" role="status">
              {form.chemicalId
                ? `Chemical: ${form.chemicalName}. Log Kow, Koc and Kd are filled from the RSL where it gives them; edit any of them.`
                : 'Choose a chemical to fill its RSL properties, or type them in.'}
            </p>
            <div className="fields">
              {text('soilConcentration', 'Soil concentration (mg/kg dry weight)')}
              {text('logKow', 'log Kow')}
              {text('koc', 'Koc (L/kg)')}
              {text('kd', 'Kd (L/kg)', 'Blank uses Koc times foc')}
              {text('foc', 'Organic carbon fraction foc')}
              {text('bulkDensity', 'Dry bulk density (kg/L)')}
              {text('waterFilledPorosity', 'Water-filled porosity')}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={form.ionizable}
                onChange={(e) => set('ionizable', e.target.checked)}
              />
              <span>Ionizable at the soil pH (the neutral model is warned)</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.inorganic}
                onChange={(e) => set('inorganic', e.target.checked)}
              />
              <span>Metal or inorganic (needs a bioconcentration factor and Kd)</span>
            </label>
            {form.inorganic && (
              <div className="fields">
                {text(
                  'userBcf',
                  'Bioconcentration factor (kg/kg)',
                  form.uptake === 'legacy'
                    ? 'Plant fresh weight per soil dry weight'
                    : 'Plant dry weight per soil dry weight',
                )}
              </div>
            )}
          </Group>

          <Group title="Plant uptake method">
            <Seg<UptakeChoice>
              legend="Method"
              name="peUptake"
              value={form.uptake}
              onChange={(v) => set('uptake', v)}
              options={[
                { value: 'legacy', label: 'Briggs and one-compartment leaf' },
                { value: 'modern', label: 'EPA HHRAP 2005 equations' },
              ]}
            />
            {form.uptake === 'modern' ? (
              <div className="fields">
                {text(
                  'moistureFraction',
                  'Moisture fraction of the fresh produce',
                  'Converts the dry weight result to fresh weight; not defaulted',
                )}
              </div>
            ) : (
              <div className="fields">
                {text('tscf', 'Transpiration stream concentration factor TSCF (0 to 1)')}
                {text('transpiration', 'Transpiration rate (L/d)')}
                {text('conductance', 'Leaf conductance (m/d)')}
                {text('leafArea', 'Leaf area (m2)')}
                {text('plantMass', 'Plant mass (kg)')}
                {text('kLeafAir', 'Leaf-air partition coefficient (m3/kg)')}
                {text('lossRate', 'Loss rate, growth dilution and metabolism (1/d)')}
                {text('growthPeriod', 'Growing period (d)', 'Blank is steady state')}
              </div>
            )}
          </Group>

          <Group title="Homegrown produce intake">
            <Seg<IntakeMode>
              legend="Intake"
              name="peIntake"
              value={form.intakeMode}
              onChange={(v) => set('intakeMode', v)}
              options={[
                { value: 'efh', label: 'Handbook preset' },
                { value: 'custom', label: 'Enter intake' },
              ]}
            />
            {form.intakeMode === 'efh' ? (
              <Select
                label="Age group (Exposure Factors Handbook, chapter 13)"
                value={form.ageGroup}
                onChange={(v) => set('ageGroup', v as EfhAgeGroup)}
                options={EFH_AGE_GROUPS.map((g) => ({ value: g, label: `${g} years` }))}
              />
            ) : (
              PRODUCE_CLASSES.map((cls) => {
                const c = form.custom[cls];
                const put = (patch: Partial<typeof c>): void =>
                  set('custom', { ...form.custom, [cls]: { ...c, ...patch } });
                return (
                  <fieldset className="receptor" key={cls}>
                    <legend>{CLASS_LABELS[cls]}</legend>
                    <div className="fields">
                      <Field
                        label="Intake (g/kg-day, fresh)"
                        value={c.gPerKgDay}
                        onChange={(v) => put({ gPerKgDay: v })}
                        hint="Blank means not eaten"
                      />
                      <Field
                        label="Preparation loss fraction"
                        value={c.loss}
                        onChange={(v) => put({ loss: v })}
                        hint="Blank is 0"
                      />
                      <Field
                        label="Fraction homegrown"
                        value={c.homegrown}
                        onChange={(v) => put({ homegrown: v })}
                      />
                    </div>
                  </fieldset>
                );
              })
            )}
            <p className="muted">
              The preset is the consumer-only mean home-produced intake net of preparation loss, so
              the homegrown fraction is already 1. It is not attached to any receptor; choose the
              age group that stands for yours.
            </p>
          </Group>

          <Group title="Ecological benchmarks (legacy)" open={false}>
            {form.benchmarks.map((b, i) => (
              <fieldset className="receptor" key={i}>
                <legend>Benchmark {i + 1}</legend>
                <div className="fields">
                  <Field
                    label="Receptor"
                    value={b.receptor}
                    onChange={(v) =>
                      set(
                        'benchmarks',
                        form.benchmarks.map((x, j) => (j === i ? { ...x, receptor: v } : x)),
                      )
                    }
                  />
                  <Field
                    label="Benchmark (mg/kg dry weight)"
                    value={b.value}
                    onChange={(v) =>
                      set(
                        'benchmarks',
                        form.benchmarks.map((x, j) => (j === i ? { ...x, value: v } : x)),
                      )
                    }
                  />
                  <Field
                    label="Citation"
                    value={b.citation}
                    onChange={(v) =>
                      set(
                        'benchmarks',
                        form.benchmarks.map((x, j) => (j === i ? { ...x, citation: v } : x)),
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  className="btn remove"
                  aria-label={`Remove benchmark ${i + 1}`}
                  onClick={() =>
                    set(
                      'benchmarks',
                      form.benchmarks.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="btn"
              onClick={() =>
                set('benchmarks', [...form.benchmarks, { receptor: '', value: '', citation: '' }])
              }
            >
              Add a benchmark
            </button>
          </Group>

          <Group title="TPH composition" open={false}>
            <Seg<TphSet>
              legend="Fraction set"
              name="peTphSet"
              value={form.tphSet}
              onChange={(v) => set('tphSet', v)}
              options={[
                { value: 'tphcwg', label: 'TPHCWG aliphatic and aromatic' },
                { value: 'madep', label: 'MADEP carbon ranges' },
              ]}
            />
            <div className="fields">
              {text(
                'tphTotal',
                'Total TPH in soil (mg/kg)',
                'Optional; gives the forward hazard index',
              )}
              {text('tphTargetHi', 'Target hazard index')}
              {text(
                'tphThetaA',
                'Air-filled porosity',
                'For the saturation check, with the soil inputs above',
              )}
            </div>
            {form.tphFractions.map((f, i) => (
              <fieldset className="receptor" key={i}>
                <legend>{f.label.trim() === '' ? `Fraction ${i + 1}` : f.label}</legend>
                <div className="fields">
                  <Field
                    label="Name"
                    value={f.label}
                    onChange={(v) => setFraction(i, { ...f, label: v })}
                  />
                  <Field
                    label="Mass fraction of the TPH"
                    value={f.massFraction}
                    onChange={(v) => setFraction(i, { ...f, massFraction: v })}
                  />
                  <Field
                    label="Level for a hazard quotient of one (mg/kg)"
                    value={f.level}
                    onChange={(v) => setFraction(i, { ...f, level: v })}
                    hint="From the cleanup levels screen"
                  />
                  <Select
                    label="RSL surrogate record"
                    value={f.surrogate}
                    onChange={(v) => setFraction(i, { ...f, surrogate: v })}
                    options={surrogateOptions}
                  />
                </div>
                <Seg<'aliphatic' | 'aromatic'>
                  legend="Family"
                  name={`peFamily${i}`}
                  value={f.family}
                  onChange={(v) => setFraction(i, { ...f, family: v })}
                  options={[
                    { value: 'aliphatic', label: 'Aliphatic' },
                    { value: 'aromatic', label: 'Aromatic' },
                  ]}
                />
                <button
                  type="button"
                  className="btn remove"
                  aria-label={`Remove fraction ${i + 1}`}
                  onClick={() =>
                    set(
                      'tphFractions',
                      form.tphFractions.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </button>
              </fieldset>
            ))}
            <div className="button-row">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  set('tphFractions', [
                    ...form.tphFractions,
                    { label: '', family: 'aliphatic', massFraction: '', surrogate: '', level: '' },
                  ])
                }
              >
                Add a fraction
              </button>
              <button type="button" className="btn" onClick={startFromSurrogates}>
                Start from the five RSL surrogates
              </button>
            </div>
            <p className="muted">
              No carbon-range table ships: you name each fraction, give its mass fraction and pick
              the RSL surrogate whose toxicity it uses. A fraction without a surrogate is left out.
            </p>
          </Group>
        </form>

        <div className="results">
          <section className="panel" aria-label="Homegrown produce">
            <h2>
              Homegrown produce <Kind id={plantId} />
            </h2>
            {prodRow ? (
              <>
                <table className="compare" aria-label="Plant factors">
                  <thead>
                    <tr>
                      <th scope="col">Produce class</th>
                      <th scope="col">Plant factor (kg/kg per kg/kg)</th>
                      <th scope="col">Plant concentration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prodRow.classes.map((c) => (
                      <tr key={c.cls}>
                        <th scope="row">{c.label}</th>
                        <td>{c.factor === null ? 'not quantified' : fmtFactor(c.factor)}</td>
                        <td>
                          {c.plantMgPerKg === undefined ? '' : `${mgkg(c.plantMgPerKg)} fresh`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted">
                  Intake: {prodRow.intakeLabel}.{' '}
                  {prodRow.omitted.length > 0
                    ? `The handbook withholds ${prodRow.omitted.map((c) => CLASS_LABELS[c].toLowerCase()).join(', ')} for this age group (fewer than 20 observations), so that class is left out.`
                    : ''}{' '}
                  The factors are soil-derived uptake only; vapor and irrigation contributions are
                  not added to the pathway.
                </p>
                <WarningList warnings={prodRow.warnings} />
              </>
            ) : (
              <Needs errors={produce.ok ? [] : produce.errors} />
            )}
            {feedResult.ok && feedResult.notes.length > 0 && (
              <ul className="warnings">
                {feedResult.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <button type="button" className="btn" disabled={!feedResult.ok} onClick={send}>
              Send to exposure and risk
            </button>
            {sent !== null && (
              <p role="status">
                Sent {sent}. On the exposure and risk screen, switch on homegrown produce for the
                receptor and use the plant factors on the chemical.
              </p>
            )}
            {held !== null && sent === null && (
              <p className="muted">A produce result for {held.label} is already held.</p>
            )}
          </section>

          <section className="panel" aria-label="Ecological screening">
            <h2>
              Ecological screening <Kind id={ECO_MODERN_ID} />
            </h2>
            {ecossl.ok ? (
              <>
                <table className="compare" aria-label="Eco-SSL hazard quotients">
                  <thead>
                    <tr>
                      <th scope="col">Receptor group</th>
                      <th scope="col">Eco-SSL (mg/kg)</th>
                      <th scope="col">Hazard quotient</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ecossl.result.rows.map((r) => (
                      <tr key={r.group}>
                        <th scope="row">{r.label}</th>
                        <td>
                          {r.sslMgPerKg !== null
                            ? formatConcentration(r.sslMgPerKg)
                            : r.status === 'procedure'
                              ? 'screening procedure, no number'
                              : r.status === 'NC'
                                ? 'not enough data'
                                : 'not available'}
                        </td>
                        <td>{r.hq === null ? 'none' : fmtHi(r.hq)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted">
                  Substance: {ecossl.result.substance}. Eco-SSLs are screening values, not cleanup
                  levels, so no ecological cleanup level is offered.{' '}
                  {ecossl.result.combined
                    ? 'This value applies to the sum of the related records (for DDT, the sum of DDT, DDE and DDD); enter that sum as the soil concentration.'
                    : ''}
                </p>
                {ecossl.result.note && <p className="muted">{ecossl.result.note}</p>}
                <WarningList warnings={ecossl.result.warnings} />
              </>
            ) : (
              <Needs errors={ecossl.errors} />
            )}
            <h3>
              User-entered benchmarks <Kind id={ECO_LEGACY_ID} />
            </h3>
            {benchmarks.ok ? (
              <>
                <table className="compare" aria-label="Benchmark hazard quotients">
                  <thead>
                    <tr>
                      <th scope="col">Receptor</th>
                      <th scope="col">Benchmark</th>
                      <th scope="col">Citation</th>
                      <th scope="col">Hazard quotient</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarks.rows.map((r, i) => (
                      <tr key={i}>
                        <th scope="row">{r.receptor}</th>
                        <td>{mgkg(r.valueMgPerKg)}</td>
                        <td>{r.citation}</td>
                        <td>{fmtHi(r.hq)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <WarningList warnings={benchmarks.warnings} />
              </>
            ) : (
              <Needs errors={benchmarks.errors} />
            )}
          </section>

          <section className="panel" aria-label="TPH fractions">
            <h2>
              TPH fractions <Kind id={tphId} />
            </h2>
            {tph.ok ? (
              <>
                <dl className="readouts">
                  <div className="readout">
                    <dt>Total TPH level for the target hazard index</dt>
                    <dd>
                      {tph.result.totalMgPerKg === null
                        ? 'no mapped fraction carries mass'
                        : mgkg(tph.result.totalMgPerKg)}
                    </dd>
                  </div>
                  {tph.result.forward && (
                    <div className="readout">
                      <dt>Hazard index at the entered total</dt>
                      <dd>{fmtHi(tph.result.forward.hazardIndex)}</dd>
                    </div>
                  )}
                  {tph.result.saturation && 'index' in tph.result.saturation && (
                    <div className="readout">
                      <dt>Saturation index of the mixture</dt>
                      <dd>
                        {fmtHi(tph.result.saturation.index)}
                        {tph.result.saturation.exceeded ? ' (above 1: separate phase)' : ''}
                      </dd>
                    </div>
                  )}
                </dl>
                {tph.result.forward && (
                  <table className="compare" aria-label="Fraction hazard quotients">
                    <thead>
                      <tr>
                        <th scope="col">Fraction</th>
                        <th scope="col">Soil</th>
                        <th scope="col">Hazard quotient</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tph.result.forward.byFraction.map((b) => (
                        <tr key={b.label}>
                          <th scope="row">{b.label}</th>
                          <td>{mgkg(b.soilMgPerKg)}</td>
                          <td>{fmtHi(b.hazardQuotient)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {tph.result.saturation && 'missing' in tph.result.saturation && (
                  <>
                    <p className="muted">The saturation check needs:</p>
                    <Needs errors={tph.result.saturation.missing} />
                  </>
                )}
                {tph.result.unmapped.length > 0 && (
                  <p className="muted">Left out, no surrogate: {tph.result.unmapped.join(', ')}.</p>
                )}
                <WarningList warnings={tph.result.warnings} />
              </>
            ) : (
              <Needs errors={tph.errors} />
            )}
            <button type="button" className="btn" disabled={!tphFeedResult.ok} onClick={sendTph}>
              Send total level to cleanup
            </button>
            {sentTph !== null && (
              <p role="status">
                Sent {sentTph}. The cleanup levels screen shows it beside the chemical levels.
              </p>
            )}
            {heldTph !== null && sentTph === null && (
              <p className="muted">A total TPH level ({heldTph.methodId}) is already held.</p>
            )}
          </section>
          <DownloadCsv tables={csvTables} />
        </div>
      </div>
    </section>
  );
}
