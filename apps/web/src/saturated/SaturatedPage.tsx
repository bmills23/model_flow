import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getScreen, setScreen } from '../project/store';
import { convert } from '@model-flow/engine';
import { fedStepLength } from '../transport/compute';
import { Field, Group, Seg } from '../ui/controls';
import { TimeLineChart, type TimeSeries } from '../vadose/TimeLineChart';
import { fmt, regionRows, releaseRows, type Row } from './chartData';
import type { RunSummary, TaggedWarning } from './compute';
import { CrossSection } from './CrossSection';
import {
  getSaturatedFeed,
  setSaturatedFeed,
  subscribeSaturatedFeed,
  type SaturatedMethod,
} from './feed';
import {
  getSaturatedVaporFeed,
  setSaturatedVaporFeed,
  subscribeSaturatedVaporFeed,
} from '../vapor/feeds';
import { saturatedVaporSource } from './vaporFeed';
import { CASE_A, DEFAULT_FORM, isCaseA, toScenario, type SaturatedForm } from './form';
import { FED_MAX_STEPS, saturatedFedSteps } from './steps';
import { DownloadCsv } from '../export/DownloadCsv';
import { saturatedCsvTables } from './csv';
import { useSaturatedResult } from './useSaturatedResult';
import { SATURATED_METHODS as METHODS, saturatedSeries, saturatedVlines } from './timeSeries';

type Setter = <K extends keyof SaturatedForm>(key: K, value: SaturatedForm[K]) => void;

const YR = convert(1, 'yr', 's');
const DAY = 86400;

function Table(props: { caption: string; head: string[]; rows: Row[] }) {
  return (
    <div className="sat-wrap">
      <table className="sat">
        <caption className="sr-only">{props.caption}</caption>
        <thead>
          <tr>
            <th scope="col">Quantity</th>
            {props.head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {r.values.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const relDiff = (v: number, target: number): number => Math.abs(v - target) / target;

function CaseCheck(props: {
  legacy?: RunSummary | undefined;
  modern?: RunSummary | undefined;
  seasonal: boolean;
}) {
  const rows = [
    props.legacy && {
      label: 'Initial mass M0 (kg)',
      ours: props.legacy.initialMass,
      target: CASE_A.initialMassKg,
    },
    props.legacy && {
      label: `Legacy depletion time, ${props.seasonal ? 'seasonal' : 'annual mean'} (d)`,
      ours: props.legacy.depletionTime / DAY,
      target: props.seasonal ? CASE_A.seasonalDepletionDays : CASE_A.depletionDays,
    },
    props.modern && {
      label: 'Modern decline constant gamma (1/yr)',
      ours: (props.modern.gamma ?? 0) * YR,
      target: CASE_A.gammaPerYear,
    },
  ].filter((r): r is { label: string; ours: number; target: number } => Boolean(r));
  return (
    <ul className="checks">
      {rows.map((r) => {
        const ok = relDiff(r.ours, r.target) < 1e-6;
        return (
          <li key={r.label}>
            <span className={ok ? 'verdict ok' : 'verdict off'}>{ok ? 'Matches' : 'Differs'}</span>{' '}
            {r.label}: this run {fmt(r.ours)}, hand calculation {fmt(r.target)}.
          </li>
        );
      })}
    </ul>
  );
}

export function SaturatedPage() {
  const [form, setForm] = useState<SaturatedForm>(() => getScreen('saturated').form);
  const [feedMethod, setFeedMethod] = useState<SaturatedMethod>(
    () => getScreen('saturated').method,
  );
  useEffect(() => setScreen('saturated', { form, method: feedMethod }), [form, feedMethod]);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const set: Setter = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const parsed = useMemo(() => toScenario(form), [form]);
  const request = useMemo(() => (parsed.ok ? { scenario: parsed.scenario } : null), [parsed]);
  const { outcome, lastGood, computing } = useSaturatedResult(request);
  const feed = useSyncExternalStore(subscribeSaturatedFeed, getSaturatedFeed, getSaturatedFeed);
  const vaporHeld = useSyncExternalStore(
    subscribeSaturatedVaporFeed,
    getSaturatedVaporFeed,
    getSaturatedVaporFeed,
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
  const caseA = isCaseA(form);

  const wanted: SaturatedMethod[] = form.method === 'both' ? ['legacy', 'modern'] : [form.method];
  const shown = wanted.filter((m) => result?.runs[m]);
  const runs = shown.map((m) => result!.runs[m]!);
  const first = runs[0];
  const horizonYr = scenario ? scenario.input.tEnd / YR : 0;

  const feedable: SaturatedMethod = result?.runs[feedMethod]
    ? feedMethod
    : result?.runs.legacy
      ? 'legacy'
      : 'modern';
  const preview = useMemo(() => {
    if (!scenario || !result?.runs[feedable]) return null;
    try {
      const t = scenario.input.tEnd;
      return saturatedFedSteps(scenario.input, feedable, t, fedStepLength(t), FED_MAX_STEPS);
    } catch {
      return null;
    }
  }, [scenario, result, feedable]);

  const feedHere =
    feed !== null && scenario !== null && feed.input === scenario.input && feed.method === feedable;
  const useAsSource = (): void => {
    if (!scenario || !result?.runs[feedable]) return;
    setSaturatedFeed({
      input: scenario.input,
      method: feedable,
      label: `${caseA ? 'Hand case A' : 'Saturated soil source run'}, ${METHODS[feedable].short} method`,
    });
  };

  const vaporSource = result?.runs[feedable]
    ? saturatedVaporSource(
        result.runs[feedable]!,
        `${caseA ? 'Hand case A' : 'Saturated soil source run'}, ${METHODS[feedable].short} method, pore water above the water table`,
      )
    : null;

  const series = (kind: 'rate' | 'remaining'): TimeSeries[] =>
    saturatedSeries(result!, shown, kind);
  const vlines = saturatedVlines(runs, horizonYr);

  const warnings: TaggedWarning[] = (result?.warnings ?? []).filter((w) =>
    shown.includes(w.method),
  );

  return (
    <section aria-labelledby="saturated-heading" className="vadose saturated">
      <h1 id="saturated-heading">Saturated soil source</h1>
      <p className="lede">
        Chemical in soil that sits at or below the water table dissolves into the groundwater that
        flows through it, and into the infiltration that flushes the part above it. Release it
        either at a constant rate until it is gone (the legacy two-region model) or in proportion to
        the mass left (the modern exponential model), then offer the release to the groundwater
        screen as its source.
      </p>

      <section className="panel example" aria-label="Worked example">
        <h2>Worked example: hand case A</h2>
        <p>
          The inputs below are a 10 m by 10 m, 2 m thick benzene source in a hydrocarbon mixture.
          The water table sits 0.5 m up the source and rises 1 m for a quarter of each year. The
          benzene properties are the values used by the vadose validation case; they are test
          inputs, not a chemical database. No published worked example covers this model, so the
          check is against the hand calculation in the methods note.
        </p>
        {caseA && result ? (
          <CaseCheck
            legacy={result.runs.legacy}
            modern={result.runs.modern}
            seasonal={form.schedule === 'seasonal'}
          />
        ) : (
          <p className="muted">Inputs differ from hand case A.</p>
        )}
        <button type="button" className="btn" onClick={() => setForm(DEFAULT_FORM)}>
          Reset to hand case A
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
          <Group title="Source and water table">
            <div className="fields">
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
              <Field
                label="Source thickness (m)"
                value={form.srcThickness}
                onChange={(v) => set('srcThickness', v)}
              />
              <Field
                label="Minimum saturated thickness (m)"
                value={form.hMin}
                onChange={(v) => set('hMin', v)}
                hint="Thickness below the water table at low water."
              />
              <Field
                label="Water-table fluctuation (m)"
                value={form.dh}
                onChange={(v) => set('dh', v)}
                hint="Rise from low to high water."
              />
              <Field
                label="Fraction of the year at high water (-)"
                value={form.fractionHigh}
                onChange={(v) => set('fractionHigh', v)}
              />
            </div>
          </Group>

          <Group title="Soil">
            <div className="fields">
              <Field
                label="Porosity (-)"
                value={form.porosity}
                onChange={(v) => set('porosity', v)}
                hint="Also the transport porosity (RISC5 choice)."
              />
              <Field
                label="Bulk density (g/cm3)"
                value={form.rhoB}
                onChange={(v) => set('rhoB', v)}
              />
              <Field
                label="Organic carbon fraction (-)"
                value={form.foc}
                onChange={(v) => set('foc', v)}
              />
              <Field
                label="Residual water content (-)"
                value={form.thetaR}
                onChange={(v) => set('thetaR', v)}
                hint="Region 1 moisture only."
              />
              <Field
                label="van Genuchten n (-)"
                value={form.n}
                onChange={(v) => set('n', v)}
                hint="Region 1 moisture only."
              />
            </div>
            <Seg
              legend="Moisture model"
              name="satHydraulicModel"
              value={form.hydraulicModel}
              onChange={(v) => set('hydraulicModel', v)}
              options={[
                { value: 'default', label: 'Method default' },
                { value: 'brooksCorey1964', label: 'Brooks-Corey' },
                { value: 'vanGenuchten1980', label: 'Mualem-van Genuchten' },
              ]}
            />
          </Group>

          <Group title="Aquifer and infiltration">
            <div className="fields">
              <Field
                label="Aquifer conductivity K (m/d)"
                value={form.K}
                onChange={(v) => set('K', v)}
                hint="Also the saturated conductivity for region 1."
              />
              <Field
                label="Hydraulic gradient (m/m)"
                value={form.gradient}
                onChange={(v) => set('gradient', v)}
              />
              <Field
                label="Infiltration (cm/yr)"
                value={form.infiltration}
                onChange={(v) => set('infiltration', v)}
                hint="Flushes region 1 only."
              />
            </div>
          </Group>

          <Group title="Chemical">
            <div className="fields">
              <Field
                label="Chemical in the soil (mg/kg)"
                value={form.F}
                onChange={(v) => set('F', v)}
              />
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
                label="Source decay rate (1/d)"
                value={form.srcDecay}
                onChange={(v) => set('srcDecay', v)}
                hint="Modern method only; zero by default."
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
                  value={form.FT}
                  onChange={(v) => set('FT', v)}
                />
                <Field
                  label="TPH molar mass (g/mol)"
                  value={form.MT}
                  onChange={(v) => set('MT', v)}
                />
              </div>
            )}
          </Group>

          <Group title="Run">
            <div className="fields">
              <Field
                label="Horizon (yr)"
                value={form.horizonYr}
                onChange={(v) => set('horizonYr', v)}
                hint="Length of the charts and of the mass budget."
              />
            </div>
          </Group>
        </form>

        <div className="results" aria-busy={computing} ref={resultsRef}>
          <div className="toolbar">
            <Seg
              legend="Method shown"
              name="satMethod"
              value={form.method}
              onChange={(v) => set('method', v)}
              options={[
                { value: 'both', label: 'Both overlaid' },
                { value: 'legacy', label: 'Legacy two-region' },
                { value: 'modern', label: 'Modern exponential' },
              ]}
            />
            <Seg
              legend="Water-table fluctuation schedule"
              name="satSchedule"
              value={form.schedule}
              onChange={(v) => set('schedule', v)}
              options={[
                { value: 'annual-mean', label: 'Annual mean rate' },
                { value: 'seasonal', label: 'Seasonal (high water part of each year)' },
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

          {result && scenario && first && (
            <div className={stale ? 'stale' : undefined}>
              {(['legacy', 'modern'] as const).map((m) =>
                result.unavailable[m] ? (
                  <p className="note" key={m}>
                    <strong>{METHODS[m].short} method did not run.</strong> {result.unavailable[m]}
                  </p>
                ) : null,
              )}

              <CrossSection
                levels={first.levels}
                thickness={scenario.input.source.thickness}
                length={scenario.input.source.length}
              />

              <TimeLineChart
                title="Release rate to the aquifer versus time"
                timesYr={result.curves.timesYr}
                series={series('rate')}
                yLabel="release rate (kg/d)"
                scale="linear"
                ariaLabel="Release rate to the aquifer over time, as a step for the legacy method and an exponential decline for the modern method."
                tableUnit="kg/d"
                vlines={vlines}
              />
              <TimeLineChart
                title="Mass left in the source versus time"
                timesYr={result.curves.timesYr}
                series={series('remaining')}
                yLabel="remaining mass (kg)"
                scale="linear"
                ariaLabel="Remaining mass in the source over time."
                tableUnit="kg"
                vlines={vlines}
              />
              {form.schedule === 'seasonal' && (
                <p className="muted chart-note">
                  The seasonal schedule releases faster while the water table is high. With no
                  source decay it delivers the same mass as the annual mean at every year end; a
                  source decay makes the two differ, because the faster high-water release leaves
                  less mass to decay.
                </p>
              )}

              <section className="panel" aria-label="Regions and release">
                <h2>Regions and release</h2>
                <h3>Regions at the start (legacy and modern share them)</h3>
                <Table
                  caption="Partitioning in region 1 and region 2"
                  head={['Region 1 (above the water table)', 'Region 2 (below it)']}
                  rows={regionRows(first)}
                />
                <h3>Release</h3>
                <Table
                  caption="Release rates and time scales by method"
                  head={runs.map((r) => METHODS[r.method].short)}
                  rows={releaseRows(runs)}
                />
                <p className="muted">
                  Water table: saturated thickness {fmt(first.levels.hLo)} m at low water and{' '}
                  {fmt(first.levels.hHi)} m at high water
                  {first.levels.capped ? ' (capped at the source thickness)' : ''}. The mass budget
                  closes to the initial mass at the horizon of {fmt(horizonYr)} yr.
                </p>
              </section>

              <section className="panel" aria-label="Download">
                <h2>Download</h2>
                <DownloadCsv disabled={stale} tables={saturatedCsvTables(result)} />
              </section>

              <section className="panel" aria-label="Groundwater coupling">
                <h2>Feed the groundwater screen</h2>
                <p>
                  The groundwater screen can take this release as its source: the mass delivered
                  becomes a stepped mass-release schedule into a box the size of the source, from
                  the water table down to the high-water saturated thickness. The porosity,
                  conductivity, gradient and organic carbon partitioning travel with it, so the flow
                  and retardation there match this screen. The receptor breakthrough curve and the
                  plan-view plume are drawn there.
                </p>
                <Seg
                  legend="Method to feed"
                  name="satFeedMethod"
                  value={feedable}
                  onChange={setFeedMethod}
                  options={[
                    ...(result.runs.legacy
                      ? [{ value: 'legacy' as const, label: 'Feed legacy' }]
                      : []),
                    ...(result.runs.modern
                      ? [{ value: 'modern' as const, label: 'Feed modern' }]
                      : []),
                  ]}
                />
                <p className="muted">
                  Step cap: a modern release is cut into steps of at least a month but never more
                  than {FED_MAX_STEPS} steps, and each step carries exactly the mass delivered over
                  it. A legacy annual mean is one step.
                  {preview &&
                    ` At this horizon the ${METHODS[feedable].short.toLowerCase()} feed has ${preview.steps.length} ${preview.steps.length === 1 ? 'step' : 'steps'}.`}
                </p>
                {form.schedule === 'seasonal' && (
                  <p className="note">
                    {preview?.fallback
                      ? `At the horizon of ${fmt(horizonYr)} years the seasonal schedule needs more steps than the cap allows even at one step per season, so the feed falls back to whole-year steps. `
                      : 'A seasonal schedule is kept in the feed while its seasons fit the cap, with steps lengthened to fit; past about 24 years of release the feed uses whole-year steps instead, and the groundwater screen says so. '}
                    Each whole-year step carries the seasonal schedule's exact mass, so the
                    cumulative mass is exact at every step boundary and only the timing within a
                    step is lost.
                  </p>
                )}
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
                  The vapor screen can take the pore water of the part of the source above the water
                  table (region 1) as its soil source, using the method chosen above. The part below
                  the water table reaches vapor only through the groundwater transport screen.
                </p>
                <p>
                  <button
                    type="button"
                    className="btn"
                    disabled={stale || vaporSource === null}
                    onClick={() => vaporSource && setSaturatedVaporFeed(vaporSource)}
                  >
                    Use as vapor source
                  </button>{' '}
                  {vaporHeld && (
                    <a className="button" href="#/vapor">
                      Open vapor intrusion
                    </a>
                  )}
                </p>
                {vaporSource === null && (
                  <p className="muted">This source has no region above the water table.</p>
                )}
                {vaporHeld && (
                  <p className="muted" role="status">
                    The vapor screen can use: {vaporHeld.label}.
                  </p>
                )}
              </section>

              <section className="panel" aria-label="Warnings and notes">
                <h2>Warnings and notes ({warnings.length + (engineError ? 1 : 0)})</h2>
                {warnings.length === 0 && !engineError ? (
                  <p className="muted">No warnings.</p>
                ) : (
                  <ul className="warnings">
                    {engineError && (
                      <li key="ui.input-error" className="input-error">
                        <code>ui.input-error</code>
                        <span>Input error, showing the last good result: {engineError}</span>
                      </li>
                    )}
                    {warnings.map((w, i) => (
                      <li key={`${w.method}:${w.code}:${i}`}>
                        <code>{w.code}</code>
                        <span>
                          <strong>{METHODS[w.method].short}.</strong> {w.message}
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
