import { useMemo, useState, useSyncExternalStore } from 'react';
import { registry, type Warning } from '@model-flow/engine';
import { formatConcentration } from '../transport/chartData';
import { Field, Group, Seg } from '../ui/controls';
import { getSurfaceWaterFeed, subscribeSurfaceWaterFeed } from '../surfaceWater/feed';
import { getWellFeed, subscribeWellFeed } from '../transport/wellFeed';
import { computeHousehold, volatileVerdict, type Section } from './compute';
import { buildHouseholdFeed } from './feed';
import { setHouseholdFeed } from './feeds';
import {
  DEFAULT_FORM,
  type HouseholdForm,
  type IrrigationWaterSource,
  type ParticulateChoice,
  type ShowerChoice,
  type ShowerWaterSource,
  type VolatileOverride,
} from './form';

const SHOWER_METHODS = [
  { value: 'legacy', id: 'shower.fc-1986', label: 'Stagnant stall' },
  { value: 'little', id: 'shower.little-1992', label: 'Ventilated stall' },
  { value: 'rsl', id: 'shower.rsl-household', label: 'RSL household term' },
] as const;

const PARTICULATE_METHODS = [
  { value: 'box', id: 'particulate.box-emission', label: 'Flux into the outdoor box' },
  { value: 'pef1996', id: 'particulate.ssg-pef-1996', label: 'PEF, 1996 guidance' },
  { value: 'pef2002', id: 'particulate.ssg-pef-2002', label: 'PEF, 2002 guidance' },
] as const;

/** kg/m^3 to mg/m^3 for display. */
const mgm3 = (kgm3: number): string => `${formatConcentration(kgm3 * 1e6)} mg/m3`;

function kindOf(id: string): 'legacy' | 'modern' {
  return registry.get(id).kind === 'legacy' ? 'legacy' : 'modern';
}

function Needs(props: { section: Section<object> }) {
  if (props.section.ok) return null;
  return (
    <ul className="needs">
      {props.section.errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
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

function Kind({ id }: { id: string }) {
  const k = kindOf(id);
  return <span className={`badge badge-${k}`}>{k}</span>;
}

/** An error that is a typo or range problem, not just a missing entry. */
const isInvalid = (e: string): boolean => !e.endsWith('is required');

export function HouseholdPage() {
  const [form, setForm] = useState<HouseholdForm>(DEFAULT_FORM);
  const set = <K extends keyof HouseholdForm>(k: K, v: HouseholdForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const text = (k: keyof HouseholdForm, label: string, hint?: string) => (
    <Field
      label={label}
      value={String(form[k])}
      onChange={(v) => set(k, v as never)}
      {...(hint ? { hint } : {})}
    />
  );

  const well = useSyncExternalStore(subscribeWellFeed, getWellFeed, getWellFeed);
  const surface = useSyncExternalStore(
    subscribeSurfaceWaterFeed,
    getSurfaceWaterFeed,
    getSurfaceWaterFeed,
  );
  const [sent, setSent] = useState<string | null>(null);

  const out = useMemo(() => computeHousehold(form, { well, surface }), [form, well, surface]);
  const feedResult = useMemo(
    () => buildHouseholdFeed(form, { well, surface }),
    [form, well, surface],
  );
  const send = (): void => {
    if (!feedResult.ok) return;
    setHouseholdFeed(feedResult.feed);
    setSent(feedResult.feed.label);
  };
  const { shower, irrigation, particulate } = out;

  const invalid = useMemo(() => {
    const all: string[] = [];
    for (const s of [
      shower.legacy,
      shower.little,
      shower.rsl,
      irrigation,
      particulate.box,
      particulate.pef1996,
      particulate.pef2002,
    ]) {
      if (!s.ok) all.push(...s.errors.filter(isInvalid));
    }
    return [...new Set(all)];
  }, [shower, irrigation, particulate]);

  const warnings = useMemo(() => {
    const seen = new Map<string, { origin: string; w: Warning }>();
    const add = (origin: string, s: Section<{ warnings: Warning[] }>) => {
      if (!s.ok) return;
      for (const w of s.warnings) {
        const prior = seen.get(w.code);
        seen.set(w.code, { origin: prior ? `${prior.origin}, ${origin}` : origin, w });
      }
    };
    add('shower.fc-1986', shower.legacy);
    add('shower.little-1992', shower.little);
    add('shower.rsl-household', shower.rsl);
    add('irrigation.sprinkler-fc', irrigation);
    add('particulate.box-emission', particulate.box);
    add('particulate.ssg-pef-1996', particulate.pef1996);
    add('particulate.ssg-pef-2002', particulate.pef2002);
    return [...seen.values()];
  }, [shower, irrigation, particulate]);

  const showerRows = { legacy: shower.legacy, little: shower.little, rsl: shower.rsl };
  const shownShower = showerRows[form.showerMethod];
  const partRows = {
    box: particulate.box,
    pef1996: particulate.pef1996,
    pef2002: particulate.pef2002,
  };
  const shownPart = partRows[form.particulateMethod];

  return (
    <section aria-labelledby="hh-heading" className="household">
      <h1 id="hh-heading">Shower, irrigation and particulates</h1>
      <p className="lede">
        Household exposure from tap and irrigation water and from surface soil: shower air,
        sprinkler spray and irrigation contact, and windblown particulates. Each process has a
        legacy and a modern method side by side. Values that no primary source supplied are left for
        you to enter, and the ones taken as RISC5 choices are warned.
      </p>

      <div className="transport-grid">
        <form className="inputs" onSubmit={(e) => e.preventDefault()} aria-label="Scenario inputs">
          <Group title="Water, soil and chemical">
            <div className="fields">
              {text('chemicalName', 'Chemical name')}
              {text(
                'chemicalId',
                'Chemical id (CAS number)',
                'Only to send results to the risk and cleanup screens, for example 71-43-2',
              )}
              {text('waterConcentration', 'Tap and irrigation water concentration (mg/L)')}
              {text('soilConcentration', 'Surface soil concentration (mg/kg)')}
              {text('henry', 'Henry constant (dimensionless, air over water)')}
              {text('molecularWeight', 'Molecular weight (g/mol)')}
            </div>
            <Seg<ShowerWaterSource>
              legend="Tap water source"
              name="hhShowerWater"
              value={form.showerWaterSource}
              onChange={(v) => set('showerWaterSource', v)}
              options={[
                { value: 'entered', label: 'Entered concentration' },
                { value: 'well', label: 'Well series' },
              ]}
            />
            <Seg<IrrigationWaterSource>
              legend="Irrigation water source"
              name="hhIrrigationWater"
              value={form.irrigationWaterSource}
              onChange={(v) => set('irrigationWaterSource', v)}
              options={[
                { value: 'entered', label: 'Entered concentration' },
                { value: 'well', label: 'Well series' },
                { value: 'surface', label: 'Surface water series' },
              ]}
            />
            <p className="muted">
              {form.showerWaterSource === 'well' || form.irrigationWaterSource === 'well'
                ? well
                  ? `Well series: ${well.label}.`
                  : 'No transport well result is held.'
                : ''}{' '}
              {form.irrigationWaterSource === 'surface'
                ? surface
                  ? `Surface water series: ${surface.label}.`
                  : 'No surface water result is held.'
                : ''}
              {form.showerWaterSource === 'well' || form.irrigationWaterSource !== 'entered'
                ? ' A held series is shown here at its peak; the full series goes to the risk screen.'
                : ''}
            </p>
            <div className="fields">
              {text('henryAtm', 'Henry (atm m3/mol) for the RSL criterion')}
              {text('vaporPressure', 'Vapor pressure (mm Hg) for the RSL criterion')}
            </div>
            <Seg<VolatileOverride>
              legend="Volatility verdict"
              name="volatile-override"
              value={form.volatileOverride}
              options={[
                { value: 'auto', label: 'From the RSL criterion' },
                { value: 'volatile', label: 'Force volatile' },
                { value: 'nonvolatile', label: 'Force not volatile' },
              ]}
              onChange={(v) => set('volatileOverride', v)}
            />
            <p className="muted">{volatileVerdict(form).note}</p>
          </Group>

          <Group title="Shower">
            <div className="fields">
              {text('showerDropletDiameter', 'Shower droplet diameter (mm)')}
              {text('showerFallTime', 'Shower droplet fall time (s)')}
              {text('showerFlow', 'Shower water flow (L/min)')}
              {text('showerMinutes', 'Shower duration (min)')}
              {text('stallVolume', 'Stall volume (m3)')}
              {text(
                'ventilation',
                'Stall ventilation (m3/min)',
                'Ventilated stall only; 0 allowed',
              )}
              {text(
                'postShowerMinutes',
                'Time after the water is off (min)',
                'Ventilated stall only; blank is 0',
              )}
              {text(
                'householdFactor',
                'Household transfer factor K (L water per m3 air)',
                'RSL term only; entered, not defaulted',
              )}
            </div>
            <div className="fields">
              {text(
                'filmGas',
                'Gas film reference (cm/h)',
                'Blank in both film fields uses the RISC5 choice, with a warning',
              )}
              {text('filmLiquid', 'Liquid film reference (cm/h)')}
            </div>
          </Group>

          <Group title="Irrigation">
            <div className="fields">
              {text('sprayDropletDiameter', 'Sprinkler droplet diameter (mm)')}
              {text('sprayFallTime', 'Sprinkler droplet fall time (s)')}
              {text('sprinklerFlow', 'Sprinkler flow (L/min)')}
              {text(
                'applicationRate',
                'Application rate (mm/h)',
                'Optional; for the plant uptake handoff',
              )}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={form.alsoPotable}
                onChange={(e) => set('alsoPotable', e.target.checked)}
              />
              <span>The irrigation water is also the potable supply</span>
            </label>
          </Group>

          <Group title="Outdoor box">
            <div className="fields">
              {text('windSpeed', 'Wind speed (m/s)')}
              {text('mixingHeight', 'Mixing height (m)')}
              {text('boxLength', 'Box length (m)', 'Along the wind')}
              {text(
                'boxWidth',
                'Box width (m)',
                'Blank gives the 1 m RISC5 width for the sprinkler (warned)',
              )}
            </div>
          </Group>

          <Group title="Particulates">
            <div className="fields">
              {text('vegetativeCover', 'Vegetative cover fraction')}
              {text('meanWind', 'Mean annual wind speed (m/s)')}
              {text('thresholdWind', 'Threshold wind speed at 7 m (m/s)')}
              {text('fx', 'F(x)', 'Entered; the preset is the printed guidance value')}
              {text(
                'qOverC',
                'Q/C (g/(m2 s) per kg/m3)',
                "Blank uses each method's guidance default",
              )}
              {text(
                'pm10Flux',
                'PM10 flux (g/(m2 s))',
                'Box method only; blank uses the wind erosion flux',
              )}
            </div>
          </Group>
        </form>

        <div className="results">
          {invalid.length > 0 && (
            <div className="alert" role="alert">
              <strong>Fix these inputs to update the results:</strong>
              <ul>
                {invalid.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="panel" aria-label="Shower air">
            <h2>Shower air</h2>
            <Seg<ShowerChoice>
              legend="Method shown"
              name="hhShower"
              value={form.showerMethod}
              onChange={(v) => set('showerMethod', v)}
              options={SHOWER_METHODS.map((m) => ({ value: m.value, label: m.label }))}
            />
            <section
              aria-label={`${SHOWER_METHODS.find((m) => m.value === form.showerMethod)!.label} details`}
            >
              {shownShower.ok ? (
                <dl className="readouts">
                  <Pair term="Exposure-average air">{mgm3(shownShower.concentration)}</Pair>
                  <Pair term="Air per unit water concentration">
                    {formatConcentration(shownShower.coefficient)}
                  </Pair>
                  {'endConcentration' in shownShower && (
                    <Pair term="Air at the end of the shower">
                      {mgm3(shownShower.endConcentration as number)}
                    </Pair>
                  )}
                </dl>
              ) : (
                <Needs section={shownShower} />
              )}
            </section>
            <section aria-label="Shower method comparison">
              <table className="compare">
                <thead>
                  <tr>
                    <th scope="col">Method</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Air</th>
                  </tr>
                </thead>
                <tbody>
                  {SHOWER_METHODS.map((m) => {
                    const s = showerRows[m.value];
                    return (
                      <tr key={m.id} aria-current={m.value === form.showerMethod || undefined}>
                        <th scope="row">{m.label}</th>
                        <td>
                          <Kind id={m.id} />
                        </td>
                        <td>{s.ok ? mgm3(s.concentration) : 'needs inputs'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </section>

          <section className="panel" aria-label="Irrigation">
            <h2>Irrigation</h2>
            {irrigation.ok ? (
              <dl className="readouts">
                <Pair term="Incidental ingestion water">
                  {formatConcentration(irrigation.ingestion * 1e3)} mg/L
                </Pair>
                <Pair term="Dermal contact water">
                  {formatConcentration(irrigation.dermal * 1e3)} mg/L
                </Pair>
                <Pair term="Spray inhalation air">{mgm3(irrigation.sprayAir)}</Pair>
                <Pair term="Air per unit water concentration">
                  {formatConcentration(irrigation.sprayCoefficient)}
                </Pair>
              </dl>
            ) : (
              <Needs section={irrigation} />
            )}
          </section>

          <section className="panel" aria-label="Particulate air">
            <h2>Particulate air</h2>
            <Seg<ParticulateChoice>
              legend="Method shown"
              name="hhParticulate"
              value={form.particulateMethod}
              onChange={(v) => set('particulateMethod', v)}
              options={PARTICULATE_METHODS.map((m) => ({ value: m.value, label: m.label }))}
            />
            <section
              aria-label={`${PARTICULATE_METHODS.find((m) => m.value === form.particulateMethod)!.label} details`}
            >
              {shownPart.ok ? (
                <dl className="readouts">
                  <Pair term="Outdoor air">{mgm3(shownPart.concentration)}</Pair>
                  <Pair term="Particulate flux">
                    {formatConcentration(shownPart.flux * 1000)} g/(m2 s)
                  </Pair>
                  {shownPart.pef !== undefined && (
                    <Pair term="Particulate emission factor">
                      {shownPart.pef.toExponential(2)} m3/kg
                    </Pair>
                  )}
                </dl>
              ) : (
                <Needs section={shownPart} />
              )}
            </section>
            <section aria-label="Particulate method comparison">
              <table className="compare">
                <thead>
                  <tr>
                    <th scope="col">Method</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Air</th>
                    <th scope="col">PEF (m3/kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {PARTICULATE_METHODS.map((m) => {
                    const s = partRows[m.value];
                    return (
                      <tr key={m.id} aria-current={m.value === form.particulateMethod || undefined}>
                        <th scope="row">{m.label}</th>
                        <td>
                          <Kind id={m.id} />
                        </td>
                        <td>{s.ok ? mgm3(s.concentration) : 'needs inputs'}</td>
                        <td>{s.ok && s.pef !== undefined ? s.pef.toExponential(2) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </section>

          <section className="panel" aria-label="Send results">
            <h2>Send to risk and cleanup</h2>
            <p className="muted">
              Sends the shown shower method, the sprinkler spray air and the shown particulate
              method as exposure point concentrations, each tagged with its method, to the exposure
              and risk screen, and their model coefficients to the cleanup screen. Irrigation
              ingestion and dermal contact have no exposure pathway there and are not sent.
            </p>
            {!feedResult.ok && (
              <ul className="warnings">
                {feedResult.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {feedResult.ok && feedResult.notes.length > 0 && (
              <ul className="warnings">
                {feedResult.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <button type="button" className="btn" disabled={!feedResult.ok} onClick={send}>
              Send to risk and cleanup
            </button>
            {sent !== null && (
              <p role="status">
                Sent {sent}. Open the exposure and risk or cleanup screen to use it.
              </p>
            )}
          </section>

          <section className="panel" aria-label="Warnings and notes">
            <h2>Warnings</h2>
            {warnings.length === 0 ? (
              <p className="muted">
                No warnings. Enter inputs to see the results and their caveats.
              </p>
            ) : (
              <ul className="warnings">
                {warnings.map(({ origin, w }) => (
                  <li key={w.code}>
                    <span>{w.message}</span>
                    <code>
                      {w.code} ({origin})
                    </code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
