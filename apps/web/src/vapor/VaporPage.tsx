import { useEffect, useMemo, useState } from 'react';
import { formatReference, references } from '@model-flow/engine';
import { formatConcentration } from '../transport/chartData';
import { Field, Group, Seg } from '../ui/controls';
import { chemicalFields, loadVaporChemicals, type VaporChemicalRow } from './chemicals';
import { runVapor, type VaporOutcome } from './compute';
import {
  DEFAULT_FORM,
  FOUNDATIONS,
  R3_PUBLISHED,
  RISC4_BENZENE,
  RISC4_BENZENE_ID,
  TEXTURE_OPTIONS,
  applyTexture,
  isR3Case,
  newLayer,
  toInputs,
  type LayerForm,
  type TextureChoice,
  type VaporForm,
} from './form';

const byKey = new Map(references.map((r) => [r.key, r]));
const sig = (v: number): string => formatConcentration(v);
const MGM3 = 1e-6; // kg/m3 per mg/m3
const METHOD_LABEL = { legacy: 'Legacy Johnson and Ettinger', modern: 'Modern EPA' } as const;

type Setter = <K extends keyof VaporForm>(key: K, value: VaporForm[K]) => void;

function LayerFields(props: {
  index: number;
  layer: LayerForm;
  onChange: (patch: Partial<LayerForm>) => void;
  onTexture: (t: TextureChoice) => void;
  onRemove?: (() => void) | undefined;
}) {
  const { layer, onChange } = props;
  const id = `texture-${props.index}`;
  return (
    <fieldset className="layer">
      <legend>{layer.name || `Stratum ${props.index + 1}`}</legend>
      <div className="fields">
        <label className="field" htmlFor={id}>
          <span className="field-label">Texture preset</span>
          <select
            id={id}
            value={layer.texture}
            onChange={(e) => props.onTexture(e.target.value as TextureChoice)}
          >
            {TEXTURE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Thickness (m)"
          value={layer.thickness}
          onChange={(v) => onChange({ thickness: v })}
        />
        <Field
          label="Porosity (-)"
          value={layer.porosity}
          onChange={(v) => onChange({ porosity: v })}
        />
        <Field
          label="Water-filled porosity (-)"
          value={layer.moisture}
          onChange={(v) => onChange({ moisture: v })}
        />
        <Field
          label="Bulk density (g/cm3)"
          value={layer.bulkDensity}
          onChange={(v) => onChange({ bulkDensity: v })}
        />
        <Field
          label="Organic carbon fraction (-)"
          value={layer.foc}
          onChange={(v) => onChange({ foc: v })}
        />
      </div>
      {props.onRemove && (
        <button type="button" className="btn" onClick={props.onRemove}>
          Remove {layer.name || `stratum ${props.index + 1}`}
        </button>
      )}
    </fieldset>
  );
}

function Pair(props: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="readout">
      <dt>{props.term}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

interface Row {
  label: string;
  legacy: string;
  modern: string;
}

function comparisonRows(out: VaporOutcome): Row[] {
  const l = out.legacy.ok ? out.legacy.result : null;
  const m = out.modern.ok ? out.modern.result : null;
  const f = (v: number | undefined, scale = 1): string =>
    v === undefined ? 'n/a' : sig(v / scale);
  return [
    {
      label: 'Indoor air (mg/m3)',
      legacy: f(l?.concentration, MGM3),
      modern: f(m?.concentration, MGM3),
    },
    {
      label: 'Indoor air (ug/m3)',
      legacy: f(l?.concentration, 1e-9),
      modern: f(m?.concentration, 1e-9),
    },
    { label: 'Attenuation coefficient (-)', legacy: f(l?.alpha), modern: f(m?.alpha) },
    {
      label: 'Source vapor (mg/m3)',
      legacy: f(l?.sourceVapor, MGM3),
      modern: f(m?.sourceVapor, MGM3),
    },
    { label: 'Source to building distance (m)', legacy: f(l?.LT), modern: f(m?.LT) },
    {
      label: 'Soil gas flow into the building (L/min)',
      legacy: f(l ? l.Qsoil * 6e4 : undefined),
      modern: f(m ? m.Qsoil * 6e4 : undefined),
    },
    { label: 'Crack Peclet number (-)', legacy: f(l?.xi), modern: f(m?.xi) },
    {
      label: 'Diffusion only (mg/m3)',
      legacy: f(l?.concentrationDiffusionOnly, MGM3),
      modern: 'n/a',
    },
  ];
}

export function VaporPage() {
  const [form, setForm] = useState<VaporForm>(DEFAULT_FORM);
  const [chemicals, setChemicals] = useState<VaporChemicalRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    let live = true;
    loadVaporChemicals().then(
      (rows) => {
        if (live) setChemicals(rows);
      },
      () => {
        if (live) setLoadError(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const set: Setter = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setLayer = (index: number, patch: Partial<LayerForm>): void =>
    setForm((f) => ({
      ...f,
      layers: f.layers.map((l, k) => (k === index ? { ...l, ...patch } : l)),
    }));

  const parsed = useMemo(() => toInputs(form), [form]);
  const outcome = useMemo(() => (parsed.ok ? runVapor(parsed) : null), [parsed]);
  // An input the form refuses keeps the last good result on screen.
  const [lastGood, setLastGood] = useState<VaporOutcome | null>(null);
  if (outcome && outcome !== lastGood) setLastGood(outcome);
  const shown = outcome ?? lastGood;
  const stale = !parsed.ok;
  const r3 = isR3Case(form);
  const method = form.method;

  const pickChemical = (id: string): void => {
    if (id === RISC4_BENZENE_ID) {
      setForm((f) => ({
        ...f,
        chemicalId: id,
        ...RISC4_BENZENE,
        TB: '',
        TC: '',
        dHvb: '',
      }));
      return;
    }
    const row = chemicals.find((c) => c.id === id);
    if (row) setForm((f) => ({ ...f, ...chemicalFields(row) }));
  };

  const warnings = shown
    ? (['legacy', 'modern'] as const).flatMap((m) => {
        const o = shown[m];
        return o.ok ? o.result.warnings.map((w) => ({ method: m, ...w })) : [];
      })
    : [];

  return (
    <section aria-labelledby="vapor-heading" className="vapor">
      <h1 id="vapor-heading">Vapor intrusion screen</h1>
      <p className="lede">
        Chemical vapors from soil, soil gas or groundwater diffuse up through the soil and enter a
        building through its foundation. Compare the legacy and the modern Johnson and Ettinger
        methods on one set of inputs.
      </p>

      <section className="panel example" aria-label="Table R-3 validation case">
        <h2>Table R-3 validation case</h2>
        <p>
          The inputs below are benzene in soil under a building with a 0.15 m foundation, 2.8 m
          above the water table. The soil, source and building come from Table R-3 of the review
          cited below; the benzene properties are the RISC4 chemical database values the table does
          not list. They are test inputs for this case, not a chemical database.
        </p>
        <ul className="citations">
          {R3_PUBLISHED.citations.map((key) => {
            const ref = byKey.get(key);
            return <li key={key}>{ref ? formatReference(ref) : key}</li>;
          })}
        </ul>
        <p className="muted">
          {r3 ? 'Inputs match the Table R-3 case.' : 'Inputs differ from the Table R-3 case.'}
        </p>
        <button type="button" className="btn" onClick={() => setForm(DEFAULT_FORM)}>
          Reset to the Table R-3 case
        </button>
      </section>

      <div className="transport-grid">
        <form className="inputs" onSubmit={(e) => e.preventDefault()} aria-label="Scenario inputs">
          <Group title="Chemical">
            <label className="field" htmlFor="vapor-chemical">
              <span className="field-label">Chemical</span>
              <select
                id="vapor-chemical"
                value={form.chemicalId}
                onChange={(e) => pickChemical(e.target.value)}
              >
                <option value={RISC4_BENZENE_ID}>Benzene, RISC4 values (Table R-3)</option>
                {chemicals.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
              <small>
                {loadError
                  ? 'The chemical database did not load; enter the properties by hand.'
                  : 'Picking a chemical fills the fields below from the EPA RSL tables; every value can be changed.'}
              </small>
            </label>
            <div className="fields">
              <Field label="Molar mass (g/mol)" value={form.M} onChange={(v) => set('M', v)} />
              <Field label="Solubility (mg/L)" value={form.S} onChange={(v) => set('S', v)} />
              <Field
                label="Henry's constant (-)"
                value={form.H}
                onChange={(v) => set('H', v)}
                hint="Air over water, dimensionless, at 25 deg C."
              />
              <Field label="Koc (mL/g)" value={form.Koc} onChange={(v) => set('Koc', v)} />
              <Field
                label="Diffusion in air (cm2/s)"
                value={form.Da}
                onChange={(v) => set('Da', v)}
              />
              <Field
                label="Diffusion in water (cm2/s)"
                value={form.Dw}
                onChange={(v) => set('Dw', v)}
              />
              <Field
                label="Soil temperature (deg C)"
                value={form.temperature}
                onChange={(v) => set('temperature', v)}
                hint="Modern method only: corrects Henry's constant."
              />
              <Field
                label="Boiling point (K)"
                value={form.TB}
                onChange={(v) => set('TB', v)}
                hint="Optional, with the next two."
              />
              <Field
                label="Critical temperature (K)"
                value={form.TC}
                onChange={(v) => set('TC', v)}
              />
              <Field
                label="Enthalpy of vaporization (cal/mol)"
                value={form.dHvb}
                onChange={(v) => set('dHvb', v)}
              />
            </div>
          </Group>

          <Group title="Source">
            <Seg
              legend="Source kind"
              name="vaporSource"
              value={form.source}
              onChange={(v) => set('source', v)}
              options={[
                { value: 'soil', label: 'Soil' },
                { value: 'soilGas', label: 'Soil gas' },
                { value: 'groundwater', label: 'Groundwater' },
              ]}
            />
            {form.source === 'soil' && (
              <>
                <div className="fields">
                  <Field
                    label="Chemical in the soil (mg/kg)"
                    value={form.soilConc}
                    onChange={(v) => set('soilConc', v)}
                    hint="The source soil is the deepest stratum below."
                  />
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={form.tphOn}
                    onChange={(e) => set('tphOn', e.target.checked)}
                  />
                  <span>Source is a hydrocarbon mixture (Raoult&apos;s law with TPH)</span>
                </label>
                {form.tphOn && (
                  <div className="fields">
                    <Field
                      label="TPH in the soil (mg/kg)"
                      value={form.tph}
                      onChange={(v) => set('tph', v)}
                    />
                    <Field
                      label="TPH molar mass (g/mol)"
                      value={form.tphMolarMass}
                      onChange={(v) => set('tphMolarMass', v)}
                    />
                  </div>
                )}
              </>
            )}
            {form.source === 'soilGas' && (
              <div className="fields">
                <Field
                  label="Soil gas concentration (mg/m3)"
                  value={form.soilGas}
                  onChange={(v) => set('soilGas', v)}
                />
              </div>
            )}
            {form.source === 'groundwater' && (
              <>
                <div className="fields">
                  <Field
                    label="Groundwater concentration (mg/L)"
                    value={form.cgw}
                    onChange={(v) => set('cgw', v)}
                  />
                  <Field
                    label="Capillary zone thickness (m)"
                    value={form.capHeight}
                    onChange={(v) => set('capHeight', v)}
                    hint="Legacy: the fringe is used only when all three are entered. Modern: blank = from the texture of the deepest stratum."
                  />
                  <Field
                    label="Capillary zone porosity (-)"
                    value={form.capPorosity}
                    onChange={(v) => set('capPorosity', v)}
                  />
                  <Field
                    label="Capillary zone water-filled porosity (-)"
                    value={form.capMoisture}
                    onChange={(v) => set('capMoisture', v)}
                  />
                </div>
              </>
            )}
          </Group>

          <Group title="Soil strata (from the ground surface down)">
            <div className="fields">
              <Field
                label="Depth of the floor below grade (m)"
                value={form.floorDepth}
                onChange={(v) => set('floorDepth', v)}
                hint="The soil between the floor and the source is what the vapor crosses."
              />
            </div>
            {form.layers.map((layer, i) => (
              <LayerFields
                key={i}
                index={i}
                layer={layer}
                onChange={(patch) => setLayer(i, patch)}
                onTexture={(t) =>
                  setForm((f) => ({
                    ...f,
                    layers: f.layers.map((l, k) => (k === i ? applyTexture(l, t) : l)),
                  }))
                }
                onRemove={
                  form.layers.length <= 1
                    ? undefined
                    : () => setForm((f) => ({ ...f, layers: f.layers.filter((_, k) => k !== i) }))
                }
              />
            ))}
            <button
              type="button"
              className="btn"
              onClick={() =>
                setForm((f) => ({ ...f, layers: [...f.layers, newLayer(f.layers.length)] }))
              }
            >
              Add a stratum at the bottom
            </button>
          </Group>

          <Group title="Building">
            <label className="field" htmlFor="vapor-foundation">
              <span className="field-label">Foundation (modern method)</span>
              <select
                id="vapor-foundation"
                value={form.foundation}
                onChange={(e) => set('foundation', e.target.value as VaporForm['foundation'])}
              >
                {FOUNDATIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="fields">
              <Field
                label="Floor area (m2)"
                value={form.floorArea}
                onChange={(v) => set('floorArea', v)}
              />
              <Field
                label="Enclosed volume (m3)"
                value={form.volume}
                onChange={(v) => set('volume', v)}
              />
              <Field
                label="Air exchange rate (1/h)"
                value={form.airExchange}
                onChange={(v) => set('airExchange', v)}
              />
              <Field
                label="Crack fraction (-)"
                value={form.crackFraction}
                onChange={(v) => set('crackFraction', v)}
              />
              <Field
                label="Foundation thickness (m)"
                value={form.foundationThickness}
                onChange={(v) => set('foundationThickness', v)}
              />
              <Field
                label="Foundation porosity (-)"
                value={form.foundationPorosity}
                onChange={(v) => set('foundationPorosity', v)}
                hint="Legacy method: the crack is a soil-like layer."
              />
              <Field
                label="Foundation water-filled porosity (-)"
                value={form.foundationMoisture}
                onChange={(v) => set('foundationMoisture', v)}
              />
            </div>
            <Seg
              legend="Soil gas flow into the building"
              name="vaporFlow"
              value={form.soilGasMode}
              onChange={(v) => set('soilGasMode', v)}
              options={[
                { value: 'pressure', label: 'From the pressure difference' },
                { value: 'entered', label: 'Entered' },
              ]}
            />
            {form.soilGasMode === 'pressure' ? (
              <div className="fields">
                <Field
                  label="Indoor-outdoor pressure difference (Pa)"
                  value={form.dP}
                  onChange={(v) => set('dP', v)}
                />
                <Field
                  label="Soil vapor permeability (cm2)"
                  value={form.kv}
                  onChange={(v) => set('kv', v)}
                />
                <Field
                  label="Crack seam length (m)"
                  value={form.seam}
                  onChange={(v) => set('seam', v)}
                />
                <Field
                  label="Air viscosity (g/(cm s))"
                  value={form.viscosity}
                  onChange={(v) => set('viscosity', v)}
                />
              </div>
            ) : (
              <div className="fields">
                <Field
                  label="Soil gas flow (L/min)"
                  value={form.qsoil}
                  onChange={(v) => set('qsoil', v)}
                />
              </div>
            )}
          </Group>
        </form>

        <div className="results" aria-busy={stale}>
          <div className="toolbar">
            <Seg
              legend="Method shown in detail"
              name="vaporMethod"
              value={method}
              onChange={(v) => set('method', v)}
              options={[
                { value: 'legacy', label: 'Legacy J&E' },
                { value: 'modern', label: 'Modern EPA' },
              ]}
            />
          </div>

          {!parsed.ok && (
            <div className="alert" role="alert">
              <strong>Fix these inputs to update the results:</strong>
              <ul>
                {parsed.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {shown && (
            <div className={stale ? 'stale' : undefined}>
              <section className="panel" aria-label="Method comparison">
                <h2>Indoor air concentration</h2>
                <div className="table-wrap">
                  <table className="compare">
                    <thead>
                      <tr>
                        <th scope="col">Quantity</th>
                        <th scope="col">Legacy</th>
                        <th scope="col">Modern</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows(shown).map((r) => (
                        <tr key={r.label}>
                          <th scope="row">{r.label}</th>
                          <td>{r.legacy}</td>
                          <td>{r.modern}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(['legacy', 'modern'] as const).map((m) => {
                  const o = shown[m];
                  return o.ok ? null : (
                    <p className="note" key={m}>
                      <strong>{METHOD_LABEL[m]} did not run.</strong> {o.error}
                    </p>
                  );
                })}
              </section>

              {r3 && shown.legacy.ok && (
                <section className="panel" aria-label="Published value">
                  <h2>Check against the published value</h2>
                  {(() => {
                    const ours = shown.legacy.result.concentration / MGM3;
                    const diff = ours / R3_PUBLISHED.riscMgPerM3 - 1;
                    const within = Math.abs(diff) < R3_PUBLISHED.tolerance;
                    return (
                      <p>
                        Table R-3 case A prints {R3_PUBLISHED.riscMgPerM3} mg/m3. The legacy method
                        gives <strong>{sig(ours)}</strong> mg/m3 ({diff >= 0 ? '+' : ''}
                        {(100 * diff).toFixed(2)} percent): {within ? 'within' : 'outside'} the{' '}
                        {100 * R3_PUBLISHED.tolerance} percent tolerance.
                      </p>
                    );
                  })()}
                </section>
              )}

              {(() => {
                const o = shown[method];
                if (!o.ok) return null;
                const r = o.result;
                return (
                  <section
                    className="panel"
                    aria-label={`${method === 'legacy' ? 'Legacy J&E' : 'Modern EPA'} details`}
                  >
                    <h2>{METHOD_LABEL[method]} details</h2>
                    <dl className="readouts">
                      <Pair term="Indoor air">
                        <strong>{sig(r.concentration / MGM3)}</strong> mg/m3
                      </Pair>
                      <Pair term="Source vapor">
                        <strong>{sig(r.sourceVapor / MGM3)}</strong> mg/m3
                      </Pair>
                      <Pair term="Attenuation coefficient">
                        <strong>{sig(r.alpha)}</strong>
                      </Pair>
                      <Pair term="Effective diffusion through the soil">
                        <strong>{sig(r.DT * 1e4)}</strong> cm2/s over {sig(r.LT)} m
                      </Pair>
                      <Pair term="Building ventilation">
                        <strong>{sig(r.QB * 1e3)}</strong> L/s
                      </Pair>
                      <Pair term="Soil gas entry">
                        <strong>{sig(r.Qsoil * 6e4)}</strong> L/min, Peclet number {sig(r.xi)}
                      </Pair>
                      <Pair term="Entry rate">
                        <strong>{sig(r.entryRate * 1e6)}</strong> mg/s
                      </Pair>
                      {'Hprime' in r && (
                        <Pair term="Henry's constant at the soil temperature">
                          <strong>{sig(r.Hprime)}</strong>
                        </Pair>
                      )}
                    </dl>
                  </section>
                );
              })()}

              <section className="panel" aria-label="Warnings and notes">
                <h2>Warnings and notes ({warnings.length})</h2>
                {warnings.length === 0 ? (
                  <p className="muted">No warnings.</p>
                ) : (
                  <ul className="warnings">
                    {warnings.map((w) => (
                      <li key={`${w.method}:${w.code}`}>
                        <code className="warn-code">{w.code}</code>
                        <span>
                          <strong>{w.method === 'legacy' ? 'Legacy' : 'Modern'}.</strong>{' '}
                          {w.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
