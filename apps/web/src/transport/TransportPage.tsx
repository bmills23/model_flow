import { useMemo, useState, useSyncExternalStore } from 'react';
import { convert } from '@model-flow/engine';
import { BreakthroughChart } from './BreakthroughChart';
import { Marker } from './Marker';
import { SERIES } from './series';
import { formatConcentration } from './chartData';
import type { ComputeRequest, MethodKey } from './compute';
import { DEFAULT_FORM, toScenario, type StepRow, type TransportForm } from './form';
import { PlumeMap } from './PlumeMap';
import { Field, Group, Seg } from '../ui/controls';
import { useTransportResult } from './useTransportResult';
import { getSaturatedFeed, subscribeSaturatedFeed } from '../saturated/feed';
import { getVadoseFeed, subscribeVadoseFeed } from '../vadose/feed';
import { getBankFeed, setBankFeed, subscribeBankFeed } from './bankFeed';
import { getWellFeed, setWellFeed, subscribeWellFeed } from './wellFeed';
import { getTransportFeed, setTransportFeed, subscribeTransportFeed } from './chainFeed';
import { getWaterTableFeed, setWaterTableFeed, subscribeWaterTableFeed } from '../vapor/feeds';
import { waterTableSource } from './vaporFeed';

type Setter = <K extends keyof TransportForm>(key: K, value: TransportForm[K]) => void;

function StepsTable({ form, set }: { form: TransportForm; set: Setter }) {
  const update = (i: number, patch: Partial<StepRow>): void =>
    set(
      'steps',
      form.steps.map((r, k) => (k === i ? { ...r, ...patch } : r)),
    );
  return (
    <div className="steps-table">
      {form.steps.map((row, i) => (
        <div className="step-row" key={i}>
          <Field
            label={`Step ${i + 1} start (yr)`}
            value={row.start}
            onChange={(v) => update(i, { start: v })}
          />
          <Field
            label={`Step ${i + 1} end (yr)`}
            value={row.end}
            onChange={(v) => update(i, { end: v })}
          />
          <Field
            label={`Step ${i + 1} factor`}
            value={row.factor}
            onChange={(v) => update(i, { factor: v })}
          />
          <button
            type="button"
            className="btn"
            onClick={() =>
              set(
                'steps',
                form.steps.filter((_, k) => k !== i),
              )
            }
          >
            Remove step {i + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => set('steps', [...form.steps, { start: '0', end: '1', factor: '1' }])}
      >
        Add step
      </button>
    </div>
  );
}

const fmtAlpha = (v: number): string => String(Number(v.toPrecision(3)));

export function TransportPage() {
  const [form, setForm] = useState<TransportForm>(DEFAULT_FORM);
  const set: Setter = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const [wellMethod, setWellMethod] = useState<MethodKey>('modern');
  const wellHeld = useSyncExternalStore(subscribeWellFeed, getWellFeed, getWellFeed);
  const chainHeld = useSyncExternalStore(
    subscribeTransportFeed,
    getTransportFeed,
    getTransportFeed,
  );
  const tableHeld = useSyncExternalStore(
    subscribeWaterTableFeed,
    getWaterTableFeed,
    getWaterTableFeed,
  );

  const bankHeld = useSyncExternalStore(subscribeBankFeed, getBankFeed, getBankFeed);
  const feed = useSyncExternalStore(subscribeVadoseFeed, getVadoseFeed, getVadoseFeed);
  const satFeed = useSyncExternalStore(subscribeSaturatedFeed, getSaturatedFeed, getSaturatedFeed);
  const satOn = form.feedFromSaturated && satFeed !== null;
  const fedOn = (form.feedFromVadose && feed !== null) || satOn;
  const parsed = useMemo(() => toScenario(form, feed, satFeed), [form, feed, satFeed]);
  const request = useMemo<ComputeRequest | null>(
    () =>
      parsed.ok
        ? { scenario: parsed.scenario, mapMethod: form.mapMethod, domenico: form.showDomenico }
        : null,
    [parsed, form.mapMethod, form.showDomenico],
  );
  const { outcome, lastGood, computing } = useTransportResult(request);
  // An engine input error keeps the last good result (and the scenario it belongs to) on screen.
  const engineError = outcome && !outcome.ok && parsed.ok ? outcome.error : null;
  const scenario = parsed.ok
    ? engineError && lastGood
      ? lastGood.scenario
      : parsed.scenario
    : null;
  const result = outcome?.ok ? outcome.result : engineError ? (lastGood?.result ?? null) : null;
  const keys = (['legacy', 'modern', 'domenico'] as const).filter(
    (k) => result?.readouts[k] !== undefined,
  );

  const mapMethodLabel =
    form.mapMethod === 'legacy' ? 'legacy AT123D-class method' : 'modern Wexler (1992) method';
  const depthLabel =
    scenario && scenario.receptorDepths.bottom > scenario.receptorDepths.top
      ? `screen average ${scenario.receptorDepths.top} to ${scenario.receptorDepths.bottom} m depth`
      : `at ${scenario?.receptorDepths.top ?? 0} m depth`;

  return (
    <section aria-labelledby="transport-heading" className="transport">
      <h1 id="transport-heading">Groundwater transport</h1>
      <p className="lede">
        Dissolved plume from a finite source in uniform groundwater flow, with retardation and
        first-order decay. Compare the legacy AT123D-class method with the modern Wexler (1992)
        exact solution at a receptor and across the site.
      </p>
      <div className="transport-grid">
        <form className="inputs" onSubmit={(e) => e.preventDefault()} aria-label="Scenario inputs">
          <Group title="Aquifer">
            <Seg
              legend="Flow input"
              name="aquiferMode"
              value={form.aquiferMode}
              onChange={(v) => set('aquiferMode', v)}
              options={[
                { value: 'darcy', label: 'K, gradient' },
                { value: 'velocity', label: 'Seepage velocity' },
              ]}
            />
            <div className="fields">
              {form.aquiferMode === 'darcy' ? (
                <>
                  <Field
                    label="Hydraulic conductivity K (m/d)"
                    value={form.K}
                    disabled={satOn}
                    onChange={(v) => set('K', v)}
                  />
                  <Field
                    label="Hydraulic gradient (m/m)"
                    value={form.gradient}
                    disabled={satOn}
                    onChange={(v) => set('gradient', v)}
                  />
                </>
              ) : (
                <Field
                  label="Seepage velocity (m/yr)"
                  value={form.velocityYr}
                  disabled={satOn}
                  onChange={(v) => set('velocityYr', v)}
                />
              )}
              <Field
                label="Porosity (-)"
                value={form.porosity}
                disabled={satOn}
                onChange={(v) => set('porosity', v)}
              />
            </div>
            {scenario && (
              <p className="derived">
                Seepage velocity {fmtAlpha(convert(scenario.velocity, 'm/s', 'm/yr'))} m/yr,
                retardation {fmtAlpha(scenario.retardation)}.
              </p>
            )}
            <Seg
              legend="Aquifer thickness"
              name="thicknessMode"
              value={form.thicknessMode}
              onChange={(v) => set('thicknessMode', v)}
              options={[
                { value: 'infinite', label: 'Infinite' },
                { value: 'finite', label: 'Finite' },
              ]}
            />
            {form.thicknessMode === 'finite' && (
              <div className="fields">
                <Field
                  label="Thickness (m)"
                  value={form.thickness}
                  onChange={(v) => set('thickness', v)}
                />
                <Field
                  label="Aquifer width (m)"
                  value={form.width}
                  onChange={(v) => set('width', v)}
                  hint="Blank = infinite. A width selects the finite PATCHF solution for the modern method."
                />
              </div>
            )}
            <Seg
              legend="Retardation"
              name="retardMode"
              value={form.retardMode}
              onChange={(v) => set('retardMode', v)}
              options={[
                { value: 'factor', label: 'Factor R' },
                { value: 'kd', label: 'From Kd' },
              ]}
            />
            <div className="fields">
              {form.retardMode === 'factor' ? (
                <Field
                  label="Retardation factor R (-)"
                  value={form.retardation}
                  disabled={satOn}
                  onChange={(v) => set('retardation', v)}
                />
              ) : (
                <>
                  <Field
                    label="Kd (L/kg)"
                    value={form.kd}
                    disabled={satOn}
                    onChange={(v) => set('kd', v)}
                  />
                  <Field
                    label="Bulk density (kg/L)"
                    value={form.bulkDensity}
                    disabled={satOn}
                    onChange={(v) => set('bulkDensity', v)}
                  />
                </>
              )}
              <Field
                label="Decay half-life (yr)"
                value={form.halfLifeYr}
                onChange={(v) => set('halfLifeYr', v)}
                hint="Blank or 0 = no decay."
              />
            </div>
          </Group>

          <Group title="Source">
            {feed && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.feedFromVadose && !satOn}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      feedFromVadose: e.target.checked,
                      feedFromSaturated: e.target.checked ? false : f.feedFromSaturated,
                    }))
                  }
                />
                <span>Feed the source from the vadose leaching result ({feed.label})</span>
              </label>
            )}
            {satFeed && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.feedFromSaturated}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      feedFromSaturated: e.target.checked,
                      feedFromVadose: e.target.checked ? false : f.feedFromVadose,
                    }))
                  }
                />
                <span>Feed the source from the saturated soil source ({satFeed.label})</span>
              </label>
            )}
            {satOn && satFeed && (
              <p className="derived">
                The release of the {satFeed.input.source.length} m by {satFeed.input.source.width} m
                saturated source sets the loading schedule. Length, width, strength and loading come
                from it, and so do the porosity, conductivity, gradient and retardation of the
                aquifer. The box is as deep as the high-water saturated thickness when the source
                reaches below the water table; otherwise the thickness below is the mixing depth.{' '}
                <a href="#/saturated">Open saturated soil source</a>
              </p>
            )}
            {fedOn && !satOn && feed && (
              <p className="derived">
                The mass reaching the water table over the {feed.scenario.source.length} m by{' '}
                {feed.scenario.source.width} m vadose source sets the release schedule. Length,
                width, strength and loading come from it; the thickness below is the mixing depth.{' '}
                <a href="#/vadose">Open vadose leaching</a>
              </p>
            )}
            <div className="fields">
              {!fedOn && (
                <>
                  <Field
                    label="Source length along flow (m)"
                    value={form.srcLength}
                    onChange={(v) => set('srcLength', v)}
                  />
                  <Field
                    label="Source width across flow (m)"
                    value={form.srcWidth}
                    onChange={(v) => set('srcWidth', v)}
                  />
                </>
              )}
              <Field
                label="Source thickness (m)"
                value={form.srcDepth}
                onChange={(v) => set('srcDepth', v)}
                hint="Below the water table."
              />
            </div>
            {!fedOn && (
              <>
                <Seg
                  legend="Source strength"
                  name="sourceMode"
                  value={form.sourceMode}
                  onChange={(v) => set('sourceMode', v)}
                  options={[
                    { value: 'concentration', label: 'Concentration' },
                    { value: 'massRate', label: 'Mass rate' },
                  ]}
                />
                <div className="fields">
                  {form.sourceMode === 'concentration' ? (
                    <Field
                      label="Source concentration (mg/L)"
                      value={form.c0}
                      onChange={(v) => set('c0', v)}
                    />
                  ) : (
                    <Field
                      label="Mass release rate (g/d)"
                      value={form.massRate}
                      onChange={(v) => set('massRate', v)}
                    />
                  )}
                </div>
                <Seg
                  legend="Loading"
                  name="loading"
                  value={form.loading}
                  onChange={(v) => set('loading', v)}
                  options={[
                    { value: 'continuous', label: 'Continuous' },
                    { value: 'pulse', label: 'Pulse' },
                    { value: 'steps', label: 'Steps' },
                  ]}
                />
                {form.loading === 'pulse' && (
                  <div className="fields">
                    <Field
                      label="Pulse duration (yr)"
                      value={form.pulseYr}
                      onChange={(v) => set('pulseYr', v)}
                    />
                  </div>
                )}
                {form.loading === 'steps' && <StepsTable form={form} set={set} />}
              </>
            )}
          </Group>

          <Group title="Dispersivity">
            <Seg
              legend="Dispersivity law"
              name="dispLaw"
              value={form.dispLaw}
              onChange={(v) => set('dispLaw', v)}
              options={[
                { value: 'legacy', label: 'Gelhar 1985 + API 1987' },
                { value: 'modern', label: 'Xu & Eckstein 1995' },
                { value: 'schulze-makuch', label: 'Schulze-Makuch 2005' },
              ]}
            />
            {scenario && (
              <dl className="alphas" aria-label="Dispersivity used">
                <div>
                  <dt>Longitudinal</dt>
                  <dd>{fmtAlpha(scenario.alphaL)} m</dd>
                </div>
                <div>
                  <dt>Transverse</dt>
                  <dd>{fmtAlpha(scenario.alphaT)} m</dd>
                </div>
                <div>
                  <dt>Vertical</dt>
                  <dd>{fmtAlpha(scenario.alphaV)} m</dd>
                </div>
              </dl>
            )}
            <p className="derived">
              The law is evaluated at the receptor distance
              {scenario ? ` (${fmtAlpha(scenario.dispersivityDistance)} m)` : ''}. Override any
              value below.
            </p>
            <div className="fields">
              <Field
                label="Override longitudinal (m)"
                value={form.alphaLOverride}
                onChange={(v) => set('alphaLOverride', v)}
                placeholder={scenario ? fmtAlpha(scenario.lawAlphas.alphaL) : ''}
              />
              <Field
                label="Override transverse (m)"
                value={form.alphaTOverride}
                onChange={(v) => set('alphaTOverride', v)}
                placeholder={scenario ? fmtAlpha(scenario.lawAlphas.alphaT) : ''}
              />
              <Field
                label="Override vertical (m)"
                value={form.alphaVOverride}
                onChange={(v) => set('alphaVOverride', v)}
                placeholder={scenario ? fmtAlpha(scenario.lawAlphas.alphaV) : ''}
              />
            </div>
          </Group>

          <Group title="Receptor">
            <div className="fields">
              <Field
                label="x downgradient (m)"
                value={form.rx}
                onChange={(v) => set('rx', v)}
                hint="From the downgradient edge of the source."
              />
              <Field label="y across flow (m)" value={form.ry} onChange={(v) => set('ry', v)} />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={form.screen}
                onChange={(e) => set('screen', e.target.checked)}
              />
              <span>Well screen (average over depth)</span>
            </label>
            <div className="fields">
              {form.screen ? (
                <>
                  <Field
                    label="Screen top (m depth)"
                    value={form.screenTop}
                    onChange={(v) => set('screenTop', v)}
                  />
                  <Field
                    label="Screen bottom (m depth)"
                    value={form.screenBottom}
                    onChange={(v) => set('screenBottom', v)}
                  />
                </>
              ) : (
                <Field
                  label="Depth below water table (m)"
                  value={form.rDepth}
                  onChange={(v) => set('rDepth', v)}
                />
              )}
            </div>
          </Group>

          <Group title="Evaluation and map">
            <div className="fields">
              <Field
                label="Evaluation time (yr)"
                value={form.timeYr}
                onChange={(v) => set('timeYr', v)}
              />
              <Field label="Map x min (m)" value={form.xMin} onChange={(v) => set('xMin', v)} />
              <Field label="Map x max (m)" value={form.xMax} onChange={(v) => set('xMax', v)} />
              <Field
                label="Map half-width in y (m)"
                value={form.yHalf}
                onChange={(v) => set('yHalf', v)}
              />
            </div>
          </Group>
        </form>

        <div className="results" aria-busy={computing}>
          <div className="toolbar">
            <Seg
              legend="Map method"
              name="mapMethod"
              value={form.mapMethod}
              onChange={(v) => set('mapMethod', v)}
              options={[
                { value: 'legacy', label: 'Legacy: AT123D-class' },
                { value: 'modern', label: 'Modern: Wexler 1992' },
              ]}
            />
            <Seg
              legend="Concentration scale"
              name="scale"
              value={form.scale}
              onChange={(v) => set('scale', v)}
              options={[
                { value: 'linear', label: 'Linear' },
                { value: 'log', label: 'Log' },
              ]}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={form.showDomenico}
                onChange={(e) => set('showDomenico', e.target.checked)}
              />
              <span>
                Show Domenico comparison (a BIOSCREEN/RBCA-compatible comparison, not a recommended
                method)
              </span>
            </label>
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

          {result && scenario && (
            <div className={computing || !parsed.ok ? 'stale' : undefined}>
              <PlumeMap
                result={result}
                scenario={scenario}
                scale={form.scale}
                methodLabel={mapMethodLabel}
                timeLabel={`at ${form.timeYr} years`}
                depthLabel={depthLabel}
              />
              <BreakthroughChart result={result} scale={form.scale} />
              <section className="panel" aria-label="Receptor concentration at the evaluation time">
                <h2>Receptor concentration at {form.timeYr} years</h2>
                <dl className="readouts">
                  {keys.map((k: MethodKey) => (
                    <div key={k} className="readout">
                      <dt>
                        <svg width="14" height="14" aria-hidden="true">
                          <Marker k={k} x={7} y={7} />
                        </svg>{' '}
                        {SERIES[k].label}
                      </dt>
                      <dd>
                        <strong>{formatConcentration(result.readouts[k]! * 1e3)}</strong> mg/L
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="panel" aria-label="Exposure and risk">
                <h2>Use the well result for exposure and risk</h2>
                <p>
                  The receptor concentration history above can be the drinking-water and bathing
                  concentration of the exposure and risk screen. Pick the method whose curve to
                  send; the screen averages it over the exposure windows.
                </p>
                <Seg
                  legend="Method to send"
                  name="wellMethod"
                  value={keys.includes(wellMethod) ? wellMethod : 'modern'}
                  onChange={setWellMethod}
                  options={keys.map((k) => ({ value: k, label: SERIES[k].label }))}
                />
                <p>
                  <button
                    type="button"
                    className="btn"
                    disabled={computing || !parsed.ok}
                    onClick={() => {
                      const k = keys.includes(wellMethod) ? wellMethod : 'modern';
                      const values = result.series[k];
                      if (!values) return;
                      setWellFeed({
                        method: k,
                        label: `Receptor well, ${SERIES[k].label}, ${form.timeYr} years`,
                        times: [...result.times],
                        values: [...values],
                      });
                    }}
                  >
                    Use as exposure well concentration
                  </button>{' '}
                  {wellHeld && (
                    <a className="button" href="#/risk">
                      Open exposure and risk
                    </a>
                  )}
                </p>
                {wellHeld && (
                  <p className="muted" role="status">
                    Exposure and risk can use: {wellHeld.label}.
                  </p>
                )}
                <h2>Use this aquifer for cleanup levels</h2>
                <p>
                  The cleanup levels screen can solve for the source concentration (a dissolved
                  groundwater source, or a soil source fed by the vadose or saturated screens) whose
                  breakthrough at this receptor well just meets a target. It takes the aquifer,
                  source box, receptor and evaluation time from this screen; the source strength is
                  replaced by the one it solves for.
                </p>
                <p>
                  <button
                    type="button"
                    className="btn"
                    disabled={computing || !parsed.ok}
                    onClick={() => {
                      if (!scenario) return;
                      setTransportFeed({
                        scenario,
                        label: `${form.timeYr} years, receptor at ${form.rx} m`,
                      });
                    }}
                  >
                    Use for cleanup levels
                  </button>{' '}
                  {chainHeld && (
                    <a className="button" href="#/cleanup">
                      Open cleanup levels
                    </a>
                  )}
                </p>
                {chainHeld && (
                  <p className="muted" role="status">
                    Cleanup levels can use: {chainHeld.label}.
                  </p>
                )}
              </section>
              <section className="panel" aria-label="Vapor intrusion">
                <h2>Use the water table concentration for vapor intrusion</h2>
                <p>
                  The vapor intrusion screen can take the groundwater concentration at the water
                  table as its source, with the building standing at the receptor point: the
                  solution is evaluated at that point at the water table, not averaged over the well
                  screen. It uses the method chosen above.
                </p>
                <p>
                  <button
                    type="button"
                    className="btn"
                    disabled={computing || !parsed.ok}
                    onClick={() => {
                      if (!parsed.ok) return;
                      const k = keys.includes(wellMethod) ? wellMethod : 'modern';
                      setWaterTableFeed(
                        waterTableSource(
                          parsed.scenario,
                          k,
                          `Water table under the receptor point, ${SERIES[k].label}, ${form.timeYr} years`,
                        ),
                      );
                    }}
                  >
                    Use as vapor groundwater source
                  </button>{' '}
                  {tableHeld && (
                    <a className="button" href="#/vapor">
                      Open vapor intrusion
                    </a>
                  )}
                </p>
                {tableHeld && (
                  <p className="muted" role="status">
                    The vapor screen can use: {tableHeld.label}.
                  </p>
                )}
              </section>
              <section className="panel" aria-label="Surface water">
                <h2>Use the plume for surface water and sediment</h2>
                <p>
                  The surface water screen can take this run as the plume that discharges at a river
                  or lake bank. It reads the legacy AT123D-class solution at the bank for both of
                  its methods, whichever method the map shows.
                </p>
                <p>
                  <button
                    type="button"
                    className="btn"
                    disabled={computing || !scenario}
                    onClick={() => {
                      if (!scenario) return;
                      const { zOf: _zOf, ...plain } = scenario;
                      void _zOf;
                      setBankFeed({
                        scenario: plain,
                        label: `Groundwater transport run, ${form.timeYr} years`,
                      });
                    }}
                  >
                    Use as surface water source
                  </button>{' '}
                  {bankHeld && (
                    <a className="button" href="#/surface-water">
                      Open surface water and sediment
                    </a>
                  )}
                </p>
                {bankHeld && (
                  <p className="muted" role="status">
                    Surface water and sediment can use: {bankHeld.label}.
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
                      <li key={w.code}>
                        <code>{w.code}</code>
                        <span>{w.message}</span>
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
