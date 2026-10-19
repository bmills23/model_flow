import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getScreen, setScreen } from '../project/store';
import { formatReference, references } from '@model-flow/engine';
import { formatConcentration } from '../transport/chartData';
import { getBankFeed, subscribeBankFeed } from '../transport/bankFeed';
import { Field, Group, Seg } from '../ui/controls';
import { CriteriaPanel } from './CriteriaPanel';
import { SedimentChart, SurfaceWaterChart } from './charts';
import {
  getSurfaceWaterFeed,
  setSurfaceWaterFeed,
  subscribeSurfaceWaterFeed,
  type SurfaceWaterFeedMethod,
} from './feed';
import type { SwResult } from './compute';
import { DEFAULT_FORM, LAKE_FORM, R8_PUBLISHED, isR8Case, toRequest, type SwForm } from './inputs';
import { DownloadCsv } from '../export/DownloadCsv';
import { surfaceWaterCsvTables } from './csv';
import { useSurfaceWaterResult } from './useSurfaceWaterResult';

type Setter = <K extends keyof SwForm>(key: K, value: SwForm[K]) => void;

const byKey = new Map(references.map((r) => [r.key, r]));
const sig = (v: number): string => formatConcentration(v);
const DAY = 86400;

function Pair(props: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="readout">
      <dt>{props.term}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

function R8Check({ form, result }: { form: SwForm; result: SwResult }) {
  const which = isR8Case(form);
  if (which === null) return null;
  const pub = R8_PUBLISHED[which];
  const last = result.times.length - 1;
  const sw = result.legacy.surfaceWater[last]! * 1e3;
  const sed = (result.legacy.sediment.concentrations ?? [])[last];
  const flow = result.legacy.groundwaterFlow * DAY;
  const rows: { label: string; ours: number; target: number; tol: number; unit: string }[] = [
    {
      label: 'Groundwater discharge',
      ours: flow,
      target: pub.flowM3PerDay,
      tol: 0.5,
      unit: 'm3/d',
    },
    {
      label: 'Surface water concentration',
      ours: sw,
      target: pub.surfaceMgPerL,
      tol: R8_PUBLISHED.surfaceTolerance,
      unit: 'mg/L',
    },
    ...(sed === undefined
      ? []
      : [
          {
            label: 'Sediment concentration',
            ours: sed * 1e6,
            target: pub.sedimentMgPerKg,
            tol: R8_PUBLISHED.sedimentTolerance,
            unit: 'mg/kg',
          },
        ]),
  ];
  return (
    <section className="panel" aria-label="Comparison with the published values">
      <h2>Comparison with the published values</h2>
      <ul className="checks">
        {rows.map((r) => {
          const ok = Math.abs(r.ours - r.target) <= r.tol;
          return (
            <li key={r.label}>
              <span className={ok ? 'verdict ok' : 'verdict off'}>
                {ok ? 'Within tolerance' : 'Outside tolerance'}
              </span>{' '}
              {r.label}: this run {sig(r.ours)} {r.unit}, published {r.target} {r.unit} (half a unit
              in the last printed digit).
            </li>
          );
        })}
      </ul>
      <p className="muted">
        The review reports exact agreement between the program and its own hand calculation, so this
        reproduces arithmetic; it is not evidence of model accuracy. The benzene Koc is the RISC4
        database value the table does not list.
      </p>
    </section>
  );
}

export function SurfaceWaterScreen() {
  const [form, setForm] = useState<SwForm>(() => getScreen('surfaceWater').form);
  useEffect(() => setScreen('surfaceWater', { form }), [form]);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [showCriteria, setShowCriteria] = useState(false);
  const held = useSyncExternalStore(
    subscribeSurfaceWaterFeed,
    getSurfaceWaterFeed,
    getSurfaceWaterFeed,
  );
  const set: Setter = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const feed = useSyncExternalStore(subscribeBankFeed, getBankFeed, getBankFeed);

  const parsed = useMemo(() => toRequest(form, feed), [form, feed]);
  const request = useMemo(() => (parsed.ok ? parsed.request : null), [parsed]);
  const { outcome, lastGood, computing } = useSurfaceWaterResult(request);

  // An engine input error keeps the last good result on screen.
  const engineError = outcome && !outcome.ok && parsed.ok ? outcome.error : null;
  const result = outcome?.ok ? outcome.result : (lastGood?.result ?? null);
  const river = form.bodyType === 'river';
  const last = result ? result.times.length - 1 : 0;
  const linkedOn = form.linked && feed !== null;

  const sendToRisk = (method: SurfaceWaterFeedMethod): void => {
    if (!result) return;
    const legacy = method === 'well-mixed';
    const values = legacy ? result.legacy.surfaceWater : result.modern.surfaceWater;
    setSurfaceWaterFeed({
      method,
      origin: `surfaceWater.${method}`,
      label: `${legacy ? 'Legacy well-mixed' : 'Modern mass-discharge'} surface water, ${(result.times[last]! / (365.25 * DAY)).toFixed(1)} years`,
      times: [...result.times],
      values: [...values],
    });
  };
  const foc = Number(form.foc);

  const setLinked = (on: boolean): void =>
    setForm((f) => ({
      ...f,
      linked: on,
      bankX: on && f.bankX.trim() === '' && feed ? String(feed.scenario.receptor.x) : f.bankX,
    }));

  return (
    <section aria-labelledby="sw-heading" className="surface-water">
      <h1 id="sw-heading">Surface water and sediment</h1>
      <p className="lede">
        A groundwater plume that reaches a river or lake discharges through the bed. Mix it into the
        water body to get the surface water concentration, find the sediment concentration by
        equilibrium partitioning, and compare the legacy well-mixed box with the modern
        mass-discharge method.
      </p>

      <section className="panel example" aria-label="Table R-8 validation case">
        <h2>Table R-8 validation case</h2>
        <p>
          The inputs below are the benzene river and lake cases of Table R-8 of the review cited
          below: a groundwater concentration of 5 mg/L discharging across a 100 m reach. The benzene
          Koc is the RISC4 chemical database value, which the table does not list; it is a test
          input for these cases, not a chemical database.
        </p>
        <ul className="citations">
          {['arcadis2001', 'spence2001'].map((key) => {
            const ref = byKey.get(key);
            return <li key={key}>{ref ? formatReference(ref) : key}</li>;
          })}
        </ul>
        <p className="muted">
          {isR8Case(form) === null
            ? 'Inputs differ from the Table R-8 cases.'
            : `Inputs match the Table R-8 ${isR8Case(form)} case.`}
        </p>
        <button type="button" className="btn" onClick={() => setForm(DEFAULT_FORM)}>
          Reset to the Table R-8 river case
        </button>{' '}
        <button type="button" className="btn" onClick={() => setForm(LAKE_FORM)}>
          Load the Table R-8 lake case
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
          <Group title="Water body">
            <Seg
              legend="Water body"
              name="swBody"
              value={form.bodyType}
              onChange={(v) => set('bodyType', v)}
              options={[
                { value: 'river', label: 'River or stream' },
                { value: 'lake', label: 'Lake' },
              ]}
            />
            <div className="fields">
              {river ? (
                <Field
                  label="River cross-section (m2)"
                  value={form.crossSection}
                  onChange={(v) => set('crossSection', v)}
                />
              ) : (
                <Field
                  label="Lake volume (m3)"
                  value={form.volume}
                  onChange={(v) => set('volume', v)}
                />
              )}
              <Field
                label="Upstream flow (m3/d)"
                value={form.upstreamFlow}
                onChange={(v) => set('upstreamFlow', v)}
              />
              <Field
                label="Upstream background (mg/L)"
                value={form.background}
                onChange={(v) => set('background', v)}
              />
              <Field
                label="Mixing fraction (-)"
                value={form.mixingFraction}
                onChange={(v) => set('mixingFraction', v)}
                hint="Share of the water body the discharge mixes into."
              />
              <Field
                label="Decay in the water (1/d)"
                value={form.decay}
                onChange={(v) => set('decay', v)}
              />
            </div>
          </Group>

          <Group title="Groundwater discharge">
            <Seg
              legend="Discharge rate"
              name="swDischarge"
              value={form.dischargeMode}
              onChange={(v) => set('dischargeMode', v)}
              options={[
                { value: 'darcy', label: 'Darcy across the bed' },
                { value: 'flow', label: 'Enter the flow' },
              ]}
            />
            <div className="fields">
              {form.dischargeMode === 'darcy' ? (
                <>
                  <Field
                    label="Bed conductivity (m/d)"
                    value={form.bedConductivity}
                    onChange={(v) => set('bedConductivity', v)}
                  />
                  <Field
                    label="Bed gradient (-)"
                    value={form.gradient}
                    onChange={(v) => set('gradient', v)}
                  />
                </>
              ) : (
                <Field
                  label="Groundwater discharge (m3/d)"
                  value={form.flow}
                  onChange={(v) => set('flow', v)}
                  hint="Used by the legacy method; the modern method uses the Darcy flux of the linked run, or this flow when no run is linked."
                />
              )}
              <Field
                label="Discharge thickness (m)"
                value={form.thickness}
                onChange={(v) => set('thickness', v)}
                hint="Measured down from the water table."
              />
            </div>
            <Seg
              legend="Reach length"
              name="swReach"
              value={form.reachMode}
              onChange={(v) => set('reachMode', v)}
              options={[
                { value: 'entered', label: 'Enter the length' },
                { value: 'domenico', label: 'From the Domenico plume width' },
              ]}
            />
            <div className="fields">
              {form.reachMode === 'entered' ? (
                <Field
                  label="Reach length (m)"
                  value={form.reachLength}
                  onChange={(v) => set('reachLength', v)}
                />
              ) : (
                <Field
                  label="Source width (m)"
                  value={form.sourceWidth}
                  onChange={(v) => set('sourceWidth', v)}
                  hint="The reach is the plume width between its 5 percent points at the bank."
                />
              )}
            </div>
          </Group>

          <Group title="Groundwater at the bank">
            {feed ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.linked}
                  onChange={(e) => setLinked(e.target.checked)}
                />
                <span>Use the groundwater transport run ({feed.label})</span>
              </label>
            ) : (
              <p className="derived">
                To use a groundwater run, press &quot;Use as surface water source&quot; on the{' '}
                <a href="#/transport">groundwater transport</a> screen. Until then the concentration
                below is held constant.
              </p>
            )}
            <div className="fields">
              {!linkedOn && (
                <>
                  <Field
                    label="Groundwater concentration (mg/L)"
                    value={form.groundwaterConcentration}
                    onChange={(v) => set('groundwaterConcentration', v)}
                  />
                  <Field
                    label="Run length (yr)"
                    value={form.durationYr}
                    onChange={(v) => set('durationYr', v)}
                  />
                </>
              )}
              <Field
                label="Distance from the source face to the bank (m)"
                value={form.bankX}
                onChange={(v) => set('bankX', v)}
                hint={
                  linkedOn
                    ? 'Where the transport run is read.'
                    : 'Needed only for a reach from the Domenico width.'
                }
              />
              <Field
                label="Solubility (mg/L)"
                value={form.solubility}
                onChange={(v) => set('solubility', v)}
                hint="Blank skips the above-solubility check."
              />
            </div>
          </Group>

          <Group title="Sediment and river receptor">
            <label className="check">
              <input
                type="checkbox"
                checked={form.sedimentOn}
                onChange={(e) => set('sedimentOn', e.target.checked)}
              />
              <span>Compute sediment by equilibrium partitioning</span>
            </label>
            {form.sedimentOn && (
              <>
                <div className="fields">
                  <Field
                    label="Fraction organic carbon (-)"
                    value={form.foc}
                    onChange={(v) => set('foc', v)}
                  />
                  <Field
                    label="Koc (L/kg)"
                    value={form.koc}
                    onChange={(v) => set('koc', v)}
                    hint="Equal to mL/g."
                  />
                  <Field
                    label="Kd (L/kg)"
                    value={form.kd}
                    onChange={(v) => set('kd', v)}
                    hint="Blank uses Koc times the organic carbon fraction."
                  />
                </div>
                <Seg
                  legend="Pore water of the modern method"
                  name="swPore"
                  value={form.poreWater}
                  onChange={(v) => set('poreWater', v)}
                  options={[
                    { value: 'discharge', label: 'Discharging groundwater' },
                    { value: 'centreline', label: 'Plume centreline' },
                    { value: 'surface', label: 'Mixed surface water' },
                  ]}
                />
              </>
            )}
            {river && (
              <div className="fields">
                <Field
                  label="River receptor downstream (m)"
                  value={form.downstream}
                  onChange={(v) => set('downstream', v)}
                  hint="Below the end of the reach; blank for none. Modern method only."
                />
              </div>
            )}
          </Group>
        </form>

        <div className="results" aria-busy={computing} ref={resultsRef}>
          <div className="toolbar">
            <Seg
              legend="Concentration scale"
              name="swScale"
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

          {result && (
            <div className={computing || !parsed.ok || engineError ? 'stale' : undefined}>
              <section
                className="panel"
                aria-label="Surface water and sediment at the end of the run"
              >
                <h2>
                  At the end of the run ({(result.times[last]! / (365.25 * DAY)).toFixed(1)} yr)
                </h2>
                <dl className="readouts">
                  <Pair term="Legacy surface water">
                    {sig(result.legacy.surfaceWater[last]! * 1e3)} mg/L
                  </Pair>
                  <Pair term="Modern surface water">
                    {sig(result.modern.surfaceWater[last]! * 1e3)} mg/L
                  </Pair>
                  {result.modern.downstream && (
                    <Pair term="Modern river receptor">
                      {sig(result.modern.downstream[last]! * 1e3)} mg/L
                    </Pair>
                  )}
                  {result.legacy.sediment.concentrations ? (
                    <Pair term="Legacy sediment">
                      {sig(result.legacy.sediment.concentrations[last]! * 1e6)} mg/kg
                    </Pair>
                  ) : (
                    form.sedimentOn && (
                      <Pair term="Legacy sediment">not quantified (no Koc or Kd)</Pair>
                    )
                  )}
                  {result.modern.sediment.concentrations ? (
                    <Pair term="Modern sediment">
                      {sig(result.modern.sediment.concentrations[last]! * 1e6)} mg/kg
                      {result.modern.sediment.organicCarbonNormalized &&
                        `, ${sig(result.modern.sediment.organicCarbonNormalized[last]! * 1e6)} mg/kg organic carbon`}
                    </Pair>
                  ) : (
                    form.sedimentOn && (
                      <Pair term="Modern sediment">not quantified (no Koc or Kd)</Pair>
                    )
                  )}
                  <Pair term="Legacy discharge">
                    {sig(result.legacy.groundwaterFlow * DAY)} m3/d at{' '}
                    {sig(result.legacy.groundwaterConcentrations[last]! * 1e3)} mg/L, a loading of{' '}
                    {sig(
                      result.legacy.groundwaterFlow *
                        DAY *
                        result.legacy.groundwaterConcentrations[last]! *
                        1e3,
                    )}{' '}
                    g/d
                  </Pair>
                  <Pair term="Modern discharge">
                    {sig(result.modern.groundwaterFlow * DAY)} m3/d at a flux-averaged{' '}
                    {sig(result.modern.fluxAveraged[last]! * 1e3)} mg/L
                  </Pair>
                  <Pair term="Reach length">{sig(result.reachLength)} m</Pair>
                  <Pair term="Residence time of the mixing zone">
                    {sig(result.modern.residenceTime / DAY)} d
                  </Pair>
                </dl>
                {result.linked && (
                  <p className="muted">Groundwater from the transport run: {result.linkLabel}.</p>
                )}
                <DownloadCsv
                  disabled={computing || !parsed.ok || engineError !== null}
                  tables={surfaceWaterCsvTables(result)}
                />
              </section>

              <R8Check form={form} result={result} />

              <SurfaceWaterChart result={result} scale={form.scale} />
              <SedimentChart result={result} scale={form.scale} />

              <section className="panel" aria-label="Criteria and exposure">
                <h2>Criteria and exposure</h2>
                {showCriteria ? (
                  <CriteriaPanel
                    result={result}
                    foc={
                      form.sedimentOn && form.foc.trim() !== '' && Number.isFinite(foc)
                        ? foc
                        : undefined
                    }
                  />
                ) : (
                  <p>
                    <button type="button" className="btn" onClick={() => setShowCriteria(true)}>
                      Compare with water quality criteria and sediment benchmarks
                    </button>
                  </p>
                )}
                <p className="muted">
                  Send the surface water series to the exposure and risk screen as the swimming
                  concentration. Pick the method to send.
                </p>
                <p>
                  <button
                    type="button"
                    className="btn"
                    disabled={computing || !parsed.ok}
                    onClick={() => sendToRisk('well-mixed')}
                  >
                    Use legacy surface water for swimming risk
                  </button>{' '}
                  <button
                    type="button"
                    className="btn"
                    disabled={computing || !parsed.ok}
                    onClick={() => sendToRisk('mass-discharge')}
                  >
                    Use modern surface water for swimming risk
                  </button>
                </p>
                {held && (
                  <p>
                    <span className="muted">Held for the risk screen: {held.label}. </span>
                    <a className="button" href="#/risk">
                      Open exposure and risk
                    </a>
                  </p>
                )}
              </section>

              <section className="panel" aria-label="Warnings and notes">
                <h2>
                  Warnings and notes (
                  {result.legacy.warnings.length +
                    result.modern.warnings.length +
                    (engineError ? 1 : 0)}
                  )
                </h2>
                {result.legacy.warnings.length + result.modern.warnings.length === 0 &&
                !engineError ? (
                  <p className="muted">No warnings.</p>
                ) : (
                  <ul className="warnings">
                    {engineError && (
                      <li key="ui.input-error" className="input-error">
                        <code>ui.input-error</code>
                        <span>Input error, showing the last good result: {engineError}</span>
                      </li>
                    )}
                    {result.legacy.warnings.map((w) => (
                      <li key={`legacy:${w.code}:${w.message}`}>
                        <code>{w.code}</code>
                        <span>
                          <strong>Legacy.</strong> {w.message}
                        </span>
                      </li>
                    ))}
                    {result.modern.warnings.map((w) => (
                      <li key={`modern:${w.code}:${w.message}`}>
                        <code>{w.code}</code>
                        <span>
                          <strong>Modern.</strong> {w.message}
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
