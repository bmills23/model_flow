import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { convert, formatReference, references } from '@model-flow/engine';
import { formatConcentration } from '../transport/chartData';
import { Marker } from '../transport/Marker';
import { Field, Group, Seg } from '../ui/controls';
import { budgetRows, massRateKgPerDay } from './chartData';
import { lastYearMean, type RunSummary, type VadoseMethod } from './compute';
import { DepthProfileChart } from './DepthProfileChart';
import { getVadoseFeed, setVadoseFeed, subscribeVadoseFeed } from './feed';
import { getVadoseVaporFeed, setVadoseVaporFeed, subscribeVadoseVaporFeed } from '../vapor/feeds';
import { vadoseVaporSource } from './vaporFeed';
import {
  DEFAULT_FORM,
  R7_PUBLISHED,
  addLayer,
  isR7Case,
  layerName,
  removeLayer,
  toScenario,
  type LayerForm,
  type Side,
  type VadoseForm,
} from './form';
import { SourceDepletionChart } from './SourceDepletionChart';
import { DownloadCsv } from '../export/DownloadCsv';
import { vadoseCsvTables } from './csv';
import { useVadoseResult } from './useVadoseResult';
import { METHOD_SERIES } from './series';
import { WaterTableFluxChart } from './WaterTableFluxChart';

type Setter = <K extends keyof VadoseForm>(key: K, value: VadoseForm[K]) => void;

const EVALUATION: Record<string, string> = {
  'closed-form': 'Closed-form solution (van Genuchten and Alves case C13)',
  convolution: 'Numerical convolution of the source history (case C13 with a growing source)',
  'analytic-c14': 'Analytic solution (van Genuchten and Alves case C14)',
  'finite-volume': 'Finite volumes in depth (layered column)',
};

const byKey = new Map(references.map((r) => [r.key, r]));

const sig = (v: number): string => formatConcentration(v);
const YR = convert(1, 'yr', 's');

function LayerFields(props: {
  legend: string;
  layer: LayerForm;
  onChange: (patch: Partial<LayerForm>) => void;
  onRemove?: (() => void) | undefined;
  removeLabel?: string;
}) {
  const { layer, onChange } = props;
  return (
    <fieldset className="layer">
      <legend>{props.legend}</legend>
      <div className="fields">
        <Field
          label="Thickness (m)"
          value={layer.thickness}
          onChange={(v) => onChange({ thickness: v })}
        />
        <Field
          label="Porosity (-)"
          value={layer.thetaS}
          onChange={(v) => onChange({ thetaS: v })}
        />
        <Field
          label="Residual water content (-)"
          value={layer.thetaR}
          onChange={(v) => onChange({ thetaR: v })}
        />
        <Field label="van Genuchten n (-)" value={layer.n} onChange={(v) => onChange({ n: v })} />
        <Field
          label="Saturated conductivity Ks (m/d)"
          value={layer.Ks}
          onChange={(v) => onChange({ Ks: v })}
        />
        <Field
          label="Bulk density (g/cm3)"
          value={layer.rhoB}
          onChange={(v) => onChange({ rhoB: v })}
        />
        <Field
          label="Organic carbon fraction (-)"
          value={layer.foc}
          onChange={(v) => onChange({ foc: v })}
        />
      </div>
      {props.onRemove && (
        <button type="button" className="btn" onClick={props.onRemove}>
          {props.removeLabel}
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

function peakRate(run: RunSummary): { kgPerDay: number; atYr: number } {
  let best = 0;
  run.series.massRate.forEach((r, k) => {
    if (r > run.series.massRate[best]!) best = k;
  });
  return {
    kgPerDay: massRateKgPerDay(run.series.massRate[best] ?? 0),
    atYr: convert(run.series.times[best] ?? 0, 's', 'yr'),
  };
}

function relDiff(value: number, target: number): number {
  return (value - target) / target;
}

const pct = (x: number): string => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)} percent`;

export function VadosePage() {
  const [form, setForm] = useState<VadoseForm>(DEFAULT_FORM);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const set: Setter = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setLayer = (side: Side, index: number, patch: Partial<LayerForm>): void =>
    setForm((f) => ({
      ...f,
      [side]: f[side].map((l, k) => (k === index ? { ...l, ...patch } : l)),
    }));

  const parsed = useMemo(() => toScenario(form), [form]);
  const request = useMemo(() => (parsed.ok ? { scenario: parsed.scenario } : null), [parsed]);
  const { outcome, lastGood, computing } = useVadoseResult(request);
  const feed = useSyncExternalStore(subscribeVadoseFeed, getVadoseFeed, getVadoseFeed);
  const vaporHeld = useSyncExternalStore(
    subscribeVadoseVaporFeed,
    getVadoseVaporFeed,
    getVadoseVaporFeed,
  );

  // An engine input error keeps the last good result (and the scenario it belongs to) on screen.
  const engineError = outcome && !outcome.ok && parsed.ok ? outcome.error : null;
  const scenario = parsed.ok
    ? engineError && lastGood
      ? lastGood.scenario
      : parsed.scenario
    : (lastGood?.scenario ?? null);
  const result = outcome?.ok ? outcome.result : (lastGood?.result ?? null);
  const stale = computing || !parsed.ok || engineError !== null;

  const wanted: VadoseMethod = form.method;
  const other: VadoseMethod = wanted === 'legacy' ? 'modern' : 'legacy';
  const run: RunSummary | undefined = result?.runs[wanted] ?? result?.runs[other];
  const shown: VadoseMethod = run?.method ?? wanted;
  const r7 = isR7Case(form);

  const feedHere =
    feed !== null && scenario !== null && feed.scenario === scenario && feed.method === shown;

  const useAsSource = (): void => {
    if (!scenario || !run) return;
    setVadoseFeed({
      scenario,
      method: run.method,
      label: `${r7 ? 'Table R-7 validation case' : 'Vadose leaching run'}, ${METHOD_SERIES[run.method].label}`,
    });
  };

  const useAsVaporSource = (): void => {
    if (!run) return;
    setVadoseVaporFeed(
      vadoseVaporSource(
        run,
        `${r7 ? 'Table R-7 validation case' : 'Vadose leaching run'}, ${METHOD_SERIES[run.method].label}, source pore water`,
      ),
    );
  };

  const sourceStats = (r: RunSummary) => {
    const gammaYr = r.gamma * YR;
    return { gammaYr, halfLifeYr: gammaYr > 0 ? Math.LN2 / gammaYr : Infinity };
  };

  return (
    <section aria-labelledby="vadose-heading" className="vadose">
      <h1 id="vadose-heading">Vadose zone leaching</h1>
      <p className="lede">
        A source in unsaturated soil loses chemical to the air and to infiltrating water. Follow the
        leachate down to the water table with the legacy VADSAT-type model or the modern layered
        model, and offer the result to the groundwater screen as its source.
      </p>

      <section className="panel example" aria-label="Table R-7 validation case">
        <h2>Table R-7 validation case</h2>
        <p>
          The inputs below are a benzene source in a hydrocarbon mixture under a 4 m cover that
          includes a 0.2 m lens, 2.8 m above the water table. The soil, source and loading come from
          Table R-7 of the review cited below; the benzene properties are the RISC4 chemical
          database values the table does not list. They are test inputs for this case, not a
          chemical database.
        </p>
        <ul className="citations">
          {R7_PUBLISHED.citations.map((key) => {
            const ref = byKey.get(key);
            return <li key={key}>{ref ? formatReference(ref) : key}</li>;
          })}
        </ul>
        {r7 ? (
          <p className="muted">Inputs match the Table R-7 case.</p>
        ) : (
          <p className="muted">Inputs differ from the Table R-7 case.</p>
        )}
        <button type="button" className="btn" onClick={() => setForm(DEFAULT_FORM)}>
          Reset to the Table R-7 case
        </button>{' '}
        <button
          type="button"
          className="btn jump"
          onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          Jump to results
        </button>
      </section>

      <div className="transport-grid">
        <form className="inputs" onSubmit={(e) => e.preventDefault()} aria-label="Scenario inputs">
          <Group title="Infiltration and run">
            <div className="fields">
              <Field
                label="Infiltration (cm/yr)"
                value={form.infiltration}
                onChange={(v) => set('infiltration', v)}
                hint="Steady flux through the whole column."
              />
              <Field
                label="Run length (yr)"
                value={form.durationYr}
                onChange={(v) => set('durationYr', v)}
              />
              <Field
                label="Longitudinal dispersivity (m)"
                value={form.alphaL}
                onChange={(v) => set('alphaL', v)}
                hint="Blank = the regression at the water-table depth."
              />
            </div>
            <Seg
              legend="Moisture model"
              name="hydraulicModel"
              value={form.hydraulicModel}
              onChange={(v) => set('hydraulicModel', v)}
              options={[
                { value: 'default', label: 'Method default' },
                { value: 'brooksCorey1964', label: 'Brooks-Corey' },
                { value: 'vanGenuchten1980', label: 'Mualem-van Genuchten' },
              ]}
            />
            <p className="derived">
              The method default is Brooks-Corey for the legacy method and Mualem-van Genuchten for
              the modern method.
            </p>
          </Group>

          <Group title="Chemical">
            <div className="fields">
              <Field label="Molar mass (g/mol)" value={form.M} onChange={(v) => set('M', v)} />
              <Field label="Solubility (mg/L)" value={form.S} onChange={(v) => set('S', v)} />
              <Field
                label="Henry's constant (-)"
                value={form.H}
                onChange={(v) => set('H', v)}
                hint="Air over water, dimensionless."
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
                label="Decay in the leachate (1/d)"
                value={form.mu}
                onChange={(v) => set('mu', v)}
                hint="Dissolved phase below the source only."
              />
            </div>
          </Group>

          <Group title="Source">
            <LayerFields
              legend="Source soil"
              layer={form.source}
              onChange={(patch) => set('source', { ...form.source, ...patch })}
            />
            <div className="fields">
              <Field
                label="Source length (m)"
                value={form.srcLength}
                onChange={(v) => set('srcLength', v)}
              />
              <Field
                label="Source width (m)"
                value={form.srcWidth}
                onChange={(v) => set('srcWidth', v)}
              />
              <Field
                label="Chemical in the soil (mg/kg)"
                value={form.srcF}
                onChange={(v) => set('srcF', v)}
              />
              <Field
                label="Source decay rate (1/d)"
                value={form.srcDecay}
                onChange={(v) => set('srcDecay', v)}
                hint="Zero by default (RISC5 choice)."
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
                  value={form.srcFT}
                  onChange={(v) => set('srcFT', v)}
                />
                <Field
                  label="TPH molar mass (g/mol)"
                  value={form.srcMT}
                  onChange={(v) => set('srcMT', v)}
                />
              </div>
            )}
          </Group>

          {(['above', 'below'] as const).map((side) => (
            <Group
              key={side}
              title={
                side === 'above'
                  ? 'Soil above the source (from the surface down)'
                  : 'Soil below the source (to the water table)'
              }
            >
              {form[side].length === 0 && (
                <p className="derived">No clean soil above the source.</p>
              )}
              {form[side].map((layer, i) => (
                <LayerFields
                  key={i}
                  legend={layerName(side, i)}
                  layer={layer}
                  onChange={(patch) => setLayer(side, i, patch)}
                  onRemove={
                    side === 'below' && form.below.length <= 1
                      ? undefined
                      : () => setForm((f) => removeLayer(f, side, i))
                  }
                  removeLabel={`Remove ${layerName(side, i).toLowerCase()}`}
                />
              ))}
              <button
                type="button"
                className="btn"
                onClick={() => setForm((f) => addLayer(f, side))}
              >
                Add layer {side === 'above' ? 'above' : 'below'} the source
              </button>
            </Group>
          ))}
        </form>

        <div className="results" aria-busy={computing} ref={resultsRef}>
          <div className="toolbar">
            <Seg
              legend="Method shown"
              name="vadoseMethod"
              value={form.method}
              onChange={(v) => set('method', v)}
              options={[
                { value: 'legacy', label: 'Legacy VADSAT-type' },
                { value: 'modern', label: 'Modern layered' },
              ]}
            />
            <Seg
              legend="Water-table chart shows"
              name="vadoseMeasure"
              value={form.measure}
              onChange={(v) => set('measure', v)}
              options={[
                { value: 'concentration', label: 'Concentration' },
                { value: 'flux', label: 'Mass flux' },
              ]}
            />
            <Seg
              legend="Concentration scale"
              name="vadoseScale"
              value={form.scale}
              onChange={(v) => set('scale', v)}
              options={[
                { value: 'linear', label: 'Linear' },
                { value: 'log', label: 'Log' },
              ]}
            />
            <p className={computing ? 'status on' : 'status'} role="status">
              {computing ? 'Computing...' : 'Up to date'}
            </p>
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
          {engineError && !result && (
            <div className="alert" role="alert">
              Input error: {engineError}
            </div>
          )}

          {result && scenario && run && (
            <div className={stale ? 'stale' : undefined}>
              {(['legacy', 'modern'] as const).map((m) =>
                result.unavailable[m] ? (
                  <p className="note" key={m}>
                    <strong>{METHOD_SERIES[m].label} did not run.</strong> {result.unavailable[m]}
                  </p>
                ) : null,
              )}
              {run.method !== wanted && (
                <p className="note">
                  Showing the {METHOD_SERIES[run.method].label} method instead of{' '}
                  {METHOD_SERIES[wanted].label}.
                </p>
              )}

              <section className="panel" aria-label="Source and leaching">
                <h2>Source and leaching ({METHOD_SERIES[shown].label})</h2>
                <dl className="readouts">
                  <Pair term="Source pore water at the start">
                    <strong>{sig(run.series.sourcePoreWater[0]! * 1e3)}</strong> mg/L
                  </Pair>
                  <Pair term="Separate phase">
                    {run.partition.residual
                      ? `Yes: Raoult's law limits it to ${sig(run.partition.effS * 1e3)} mg/L`
                      : 'No: pore water is in equilibrium with the soil'}
                  </Pair>
                  <Pair term="Source depletion rate">
                    <strong>{sig(sourceStats(run).gammaYr)}</strong> per year
                    {Number.isFinite(sourceStats(run).halfLifeYr) &&
                      ` (half-life ${sig(sourceStats(run).halfLifeYr)} yr)`}
                  </Pair>
                  <Pair term="Share of the source loss that leaches">
                    <strong>{(100 * run.leachedShare).toFixed(1)}</strong> percent
                  </Pair>
                  <Pair term="Infiltration carried">
                    <strong>{sig(convert(run.q, 'm/s', 'm/yr') * 100)}</strong> cm/yr
                    {run.clamped && ' (reduced to the smallest Ks)'}
                  </Pair>
                  <Pair term="Transport solution">
                    {EVALUATION[run.evaluation] ?? run.evaluation}
                  </Pair>
                </dl>
              </section>

              <section className="panel" aria-label="At the water table">
                <h2>At the water table after {form.durationYr} years</h2>
                <dl className="readouts">
                  {(['legacy', 'modern'] as const).map((m) => {
                    const r = result.runs[m];
                    if (!r) return null;
                    const end = r.series.waterTable[r.series.waterTable.length - 1]! * 1e3;
                    const mean = lastYearMean(r.series.waterTable);
                    const peak = peakRate(r);
                    return (
                      <div key={m} className="readout">
                        <dt>
                          <svg width="14" height="14" aria-hidden="true">
                            <Marker k={m} x={7} y={7} />
                          </svg>{' '}
                          {METHOD_SERIES[m].label}
                        </dt>
                        <dd>
                          <strong>{sig(end)}</strong> mg/L at the end
                          {mean !== null && (
                            <>
                              <br />
                              <strong>{sig(mean * 1e3)}</strong> mg/L mean of the last 12 month-ends
                            </>
                          )}
                          <br />
                          Peak mass rate <strong>{sig(peak.kgPerDay)}</strong> kg/d at{' '}
                          {sig(peak.atYr)} yr
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                <DownloadCsv disabled={stale} tables={vadoseCsvTables(result)} />
              </section>

              {r7 && result.runs.legacy && <R7Check legacy={result.runs.legacy} />}

              <DepthProfileChart run={run} scale={form.scale} />
              {run.method === 'legacy' && (
                <p className="muted chart-note">
                  The legacy method evaluates the dispersivity at each depth (RISC5 choice), so
                  every depth is its own solution and a curve can bend where the dispersivity
                  changes. The modern method uses one dispersivity for the whole column.
                </p>
              )}
              <WaterTableFluxChart runs={result.runs} measure={form.measure} scale={form.scale} />
              <SourceDepletionChart run={run} scale={form.scale} />

              <section className="panel" aria-label="Mass budget">
                <h2>Mass budget after {form.durationYr} years</h2>
                <table className="budget">
                  <thead>
                    <tr>
                      <th scope="col">Part</th>
                      <th scope="col">kg</th>
                      <th scope="col">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetRows(run).map((row) => (
                      <tr key={row.key} className={row.level === 1 ? 'sub' : undefined}>
                        <th scope="row">
                          {row.label}
                          {row.note && <small>{row.note}</small>}
                        </th>
                        <td>{sig(row.kg)}</td>
                        <td>{row.percent.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted">
                  The source parts add up to the initial mass to{' '}
                  {run.budget.closure.toExponential(1)} relative.
                </p>
              </section>

              <section className="panel" aria-label="Layers">
                <h2>Layers, moisture and transport</h2>
                <ul className="layer-cards">
                  {run.layers.map((l) => (
                    <li key={l.name} className="layer-card">
                      <h3>{l.name}</h3>
                      <dl className="alphas">
                        <div>
                          <dt>Thickness</dt>
                          <dd>{sig(l.thickness)} m</dd>
                        </div>
                        <div>
                          <dt>Water content</dt>
                          <dd>{sig(l.theta)}</dd>
                        </div>
                        <div>
                          <dt>Seepage velocity</dt>
                          <dd>{sig(convert(l.v, 'm/s', 'm/yr'))} m/yr</dd>
                        </div>
                        {l.retardation !== undefined && (
                          <div>
                            <dt>Retardation</dt>
                            <dd>{sig(l.retardation)}</dd>
                          </div>
                        )}
                        {l.dispersion !== undefined && (
                          <div>
                            <dt>Dispersion</dt>
                            <dd>{sig(l.dispersion * YR)} m2/yr</dd>
                          </div>
                        )}
                      </dl>
                    </li>
                  ))}
                </ul>
                <p className="muted">
                  Dispersivity at the water table {sig(run.dispersivity)} m; vapour path{' '}
                  {sig(run.diffusionPath)} m from the ground surface to the middle of the source.
                </p>
              </section>

              <section className="panel" aria-label="Groundwater coupling">
                <h2>Feed the groundwater screen</h2>
                <p>
                  The groundwater screen can take this result as its source: the mass crossing the
                  water table over the source footprint becomes a stepped mass-release schedule.
                  Choose a finite aquifer thickness there, or an infinitely deep aquifer, which is
                  then given a no-flux water table.
                </p>
                <p>
                  <button type="button" className="btn" onClick={useAsSource} disabled={stale}>
                    Use as groundwater source
                  </button>{' '}
                  {feed && (
                    <a className="button" href="#/transport">
                      Open groundwater transport
                    </a>
                  )}
                </p>
                {feed && (
                  <p className="muted" role="status">
                    {feedHere
                      ? `Groundwater transport can use: ${feed.label}.`
                      : `Groundwater transport holds an earlier snapshot (${feed.label}). Press the button to update it.`}
                  </p>
                )}
              </section>

              <section className="panel" aria-label="Vapor coupling">
                <h2>Feed the vapor intrusion screen</h2>
                <p>
                  The vapor screen can take the pore water of this source as its soil source: the
                  vapor concentration at each time is Henry&apos;s constant times the source pore
                  water, run through the steady vapor methods.
                </p>
                <p>
                  <button type="button" className="btn" onClick={useAsVaporSource} disabled={stale}>
                    Use as vapor source
                  </button>{' '}
                  {vaporHeld && (
                    <a className="button" href="#/vapor">
                      Open vapor intrusion
                    </a>
                  )}
                </p>
                {vaporHeld && (
                  <p className="muted" role="status">
                    The vapor screen can use: {vaporHeld.label}.
                  </p>
                )}
              </section>

              <section className="panel" aria-label="Warnings and notes">
                <h2>Warnings and notes ({result.warnings.length + (engineError ? 1 : 0)})</h2>
                {result.warnings.length === 0 && !engineError ? (
                  <p className="muted">No warnings.</p>
                ) : (
                  <ul className="warnings">
                    {engineError && (
                      <li key="ui.input-error" className="input-error">
                        <code>ui.input-error</code>
                        <span>Input error, showing the last good result: {engineError}</span>
                      </li>
                    )}
                    {result.warnings.map((w) => (
                      <li key={`${w.method}:${w.code}`}>
                        <code>{w.code}</code>
                        <span>
                          <strong>{METHOD_SERIES[w.method].short}.</strong> {w.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
          {!result && parsed.ok && <p className="muted">Computing the first result...</p>}
        </div>
      </div>
    </section>
  );
}

function R7Check({ legacy }: { legacy: RunSummary }) {
  const cs0 = legacy.series.sourcePoreWater[0]! * 1e3;
  const mean = lastYearMean(legacy.series.waterTable);
  const meanMgL = mean === null ? null : mean * 1e3;
  const rows = [
    {
      label: 'Source pore water',
      ours: cs0,
      target: R7_PUBLISHED.sourceMgPerL,
      tol: R7_PUBLISHED.sourceTolerance,
    },
    ...(meanMgL === null
      ? []
      : [
          {
            label: 'Water table, mean of year 10 month-ends',
            ours: meanMgL,
            target: R7_PUBLISHED.yearTenMgPerL,
            tol: R7_PUBLISHED.yearTenTolerance,
          },
        ]),
  ];
  return (
    <section className="panel" aria-label="Comparison with the published values">
      <h2>Comparison with the published values</h2>
      <ul className="checks">
        {rows.map((r) => {
          const d = relDiff(r.ours, r.target);
          const ok = Math.abs(d) <= r.tol;
          return (
            <li key={r.label}>
              <span className={ok ? 'verdict ok' : 'verdict off'}>
                {ok ? 'Within tolerance' : 'Outside tolerance'}
              </span>{' '}
              {r.label}: this run {sig(r.ours)} mg/L, published {r.target} mg/L ({pct(d)}; tolerance{' '}
              {100 * r.tol} percent).
            </li>
          );
        })}
      </ul>
      <p className="muted">
        The published values are legacy-method results, so the comparison uses the legacy method.
        The modern method conserves mass at the inlet and is not expected to match them. This screen
        counts years of 365.25 days; the published table counts 365.
      </p>
    </section>
  );
}
