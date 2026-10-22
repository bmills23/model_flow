import type { AttenuationMedium } from '@model-flow/engine';
import { formatConcentration } from '../transport/chartData';
import { Field, Seg } from '../ui/controls';
import { DataTable } from '../vadose/DataTable';
import type { SourceKind } from './form';
import type { OutdoorForm, OutdoorOutcome } from './outdoor';
import { AF_LABEL, afMediaFor, type AfOptions, type Outcome, type PviForm } from './screening';
import type { SourceSeries, VaporEpcs } from './series';
import type { AttenuationFactorResult, PviResult } from '@model-flow/engine';

const sig = (v: number): string => formatConcentration(v);
const MGM3 = 1e-6; // kg/m3 per mg/m3
const YR = 365.25 * 86400;
const FT = 0.3048;

function Pair(props: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="readout">
      <dt>{props.term}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

export function OutdoorPanel(props: {
  value: OutdoorForm;
  onChange: (patch: Partial<OutdoorForm>) => void;
  result: OutdoorOutcome | null;
}) {
  const { value, onChange, result } = props;
  return (
    <section className="panel" aria-label="Outdoor air">
      <h2>Outdoor air</h2>
      <p>
        The same source also emits to the open air above it, with no building. The legacy method
        puts the steady diffusion flux through the whole soil column into a ventilated box; the
        modern method applies the Soil Screening Guidance factor to a soil source.
      </p>
      <div className="fields">
        <Field
          label="Wind speed (m/s)"
          value={value.windSpeed}
          onChange={(v) => onChange({ windSpeed: v })}
        />
        <Field
          label="Mixing height (m)"
          value={value.mixingHeight}
          onChange={(v) => onChange({ mixingHeight: v })}
        />
        <Field
          label="Box length along the wind (m)"
          value={value.boxLength}
          onChange={(v) => onChange({ boxLength: v })}
        />
        <Field
          label="Box width across the wind (m)"
          value={value.boxWidth}
          onChange={(v) => onChange({ boxWidth: v })}
          hint="Does not change the box result for an emission over the whole footprint."
        />
        <Field
          label="Q/C (g/(m2 s) per kg/m3)"
          value={value.qOverC}
          onChange={(v) => onChange({ qOverC: v })}
          hint="Modern method; 68.81 is the guidance default for a 0.5 acre source."
        />
      </div>
      {result && (
        <div className="table-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col">Outdoor air (mg/m3)</th>
                <th scope="col">Basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Legacy box</th>
                <td>{result.legacy.ok ? sig(result.legacy.concentration / MGM3) : 'n/a'}</td>
                <td>
                  {result.legacy.ok
                    ? `flux ${sig(result.legacy.flux / MGM3)} mg/(m2 s) into a ${result.legacy.box.length} m box`
                    : result.legacy.error}
                </td>
              </tr>
              <tr>
                <th scope="row">Soil Screening Guidance volatilization factor</th>
                <td>{result.modern.ok ? sig(result.modern.concentration / MGM3) : 'n/a'}</td>
                <td>
                  {result.modern.ok
                    ? `factor ${sig(result.modern.vf)} m3/kg${result.modern.massLimited ? ', mass limited' : ''}`
                    : result.modern.error}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {result?.modern.ok && (
        <ul className="warnings">
          {result.modern.warnings.map((w) => (
            <li key={w.code}>
              <code className="warn-code">{w.code}</code>
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AttenuationPanel(props: {
  source: SourceKind;
  options: AfOptions;
  onChange: (patch: Partial<AfOptions>) => void;
  /** Depth of the source below the foundation, m, from the indoor air run. */
  indoor: { legacy?: number | undefined; modern?: number | undefined };
  result: Outcome<AttenuationFactorResult> | null;
}) {
  const media = afMediaFor(props.source);
  const { options, result } = props;
  const chosen: AttenuationMedium = media.some((m) => m.value === options.medium)
    ? options.medium
    : (media[0]?.value ?? options.medium);
  return (
    <section className="panel" aria-label="Attenuation factor">
      <h2>Empirical attenuation factor</h2>
      {media.length === 0 ? (
        <p className="muted">
          The generic factors act on a soil gas or groundwater concentration. Choose one of those
          sources; a soil source has no generic factor.
        </p>
      ) : (
        <>
          <p>
            EPA&apos;s 2015 guide multiplies the soil gas (or the equilibrium vapor over the
            groundwater) by a fixed factor. No building, soil or chemical enters except Henry&apos;s
            constant.
          </p>
          <label className="field" htmlFor="af-medium">
            <span className="field-label">Factor</span>
            <select
              id="af-medium"
              value={chosen}
              onChange={(e) => props.onChange({ medium: e.target.value as AttenuationMedium })}
            >
              {media.map((m) => (
                <option key={m.value} value={m.value}>
                  {AF_LABEL[m.value]}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={options.preferential}
              onChange={(e) => props.onChange({ preferential: e.target.checked })}
            />
            <span>Preferential pathways are present</span>
          </label>
          {result?.ok && (
            <dl className="readouts">
              <Pair term="Indoor air from the factor">
                <strong>{sig(result.result.indoorAir / MGM3)}</strong> mg/m3
              </Pair>
              <Pair term="Factor applied">
                <strong>{sig(result.result.factor)}</strong> to{' '}
                {sig(result.result.sourceVapor / MGM3)} mg/m3 of vapor
              </Pair>
              {props.indoor.legacy !== undefined && (
                <Pair term="Against legacy J&E">
                  {sig(result.result.indoorAir / props.indoor.legacy)} times its indoor air
                </Pair>
              )}
              {props.indoor.modern !== undefined && (
                <Pair term="Against modern EPA">
                  {sig(result.result.indoorAir / props.indoor.modern)} times its indoor air
                </Pair>
              )}
            </dl>
          )}
          {result && !result.ok && <p className="note">{result.error}</p>}
          {result?.ok && result.result.warnings.length > 0 && (
            <ul className="warnings">
              {result.result.warnings.map((w) => (
                <li key={w.code}>
                  <code className="warn-code">{w.code}</code>
                  <span>{w.message}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function PviPanel(props: {
  value: PviForm;
  onChange: (patch: Partial<PviForm>) => void;
  result: Outcome<PviResult> | null;
}) {
  const { value, onChange, result } = props;
  const flag = (
    key: 'preferential' | 'leadScavengers' | 'surfaceCover' | 'contactsBuilding',
    label: string,
  ) => (
    <label className="check" key={key}>
      <input
        type="checkbox"
        checked={value[key]}
        onChange={(e) => onChange({ [key]: e.target.checked })}
      />
      <span>{label}</span>
    </label>
  );
  return (
    <section className="panel" aria-label="Petroleum vapor screen">
      <h2>Petroleum vertical separation screen</h2>
      <p>
        For a petroleum release, EPA&apos;s 2015 guide screens a building out when enough clean,
        biologically active soil separates it from the contamination: 6 ft for a dissolved source,
        15 ft for a separate-phase source under a building with a side shorter than 66 ft. It gives
        a verdict, not a concentration.
      </p>
      <div className="fields">
        <Field
          label="Soil benzene (mg/kg)"
          value={value.soilBenzene}
          onChange={(v) => onChange({ soilBenzene: v })}
        />
        <Field
          label="Soil TPH (mg/kg)"
          value={value.soilTph}
          onChange={(v) => onChange({ soilTph: v })}
        />
        <Field
          label="Groundwater benzene (mg/L)"
          value={value.gwBenzene}
          onChange={(v) => onChange({ gwBenzene: v })}
        />
        <Field
          label="Groundwater TPH (mg/L)"
          value={value.gwTph}
          onChange={(v) => onChange({ gwTph: v })}
        />
        <Field
          label="Clean soil separation (m)"
          value={value.separation}
          onChange={(v) => onChange({ separation: v })}
          hint="Blank takes the source to building distance of the indoor air run."
        />
        <Field
          label="Shortest building side (m)"
          value={value.smallestDimension}
          onChange={(v) => onChange({ smallestDimension: v })}
          hint="Blank takes the side of a square floor of the entered area."
        />
        <Field
          label="Ethanol volume fraction (-)"
          value={value.ethanol}
          onChange={(v) => onChange({ ethanol: v })}
          hint="0.2 is E20 and precludes the screen."
        />
      </div>
      <div className="fields">
        <label className="field" htmlFor="pvi-source">
          <span className="field-label">Source type</span>
          <select
            id="pvi-source"
            value={value.sourceType}
            onChange={(e) => onChange({ sourceType: e.target.value as PviForm['sourceType'] })}
          >
            <option value="auto">From the concentrations</option>
            <option value="dissolved">Dissolved</option>
            <option value="lnapl">Separate phase (LNAPL)</option>
          </select>
        </label>
        <label className="field" htmlFor="pvi-fuel">
          <span className="field-label">Fuel (soil TPH threshold)</span>
          <select
            id="pvi-fuel"
            value={value.fuel}
            onChange={(e) => onChange({ fuel: e.target.value as PviForm['fuel'] })}
          >
            <option value="unweathered">Unweathered gasoline</option>
            <option value="weathered">Weathered gasoline or diesel</option>
          </select>
        </label>
      </div>
      {flag('preferential', 'Preferential pathways are present')}
      {flag('leadScavengers', 'Lead scavengers are present')}
      {flag('surfaceCover', 'Extensive impermeable surface cover')}
      {flag('contactsBuilding', 'The contamination is in contact with the building')}
      {result && !result.ok && <p className="note">{result.error}</p>}
      {result?.ok && (
        <>
          <p className="verdict-line" role="status">
            <strong>
              {result.result.verdict === 'screened-out'
                ? 'Screened out'
                : 'Further assessment needed'}
            </strong>
            : {result.result.sourceType === 'lnapl' ? 'separate-phase' : 'dissolved'} source,{' '}
            {sig(result.result.separation / FT)} ft of separation against{' '}
            {sig(result.result.requiredSeparation / FT)} ft recommended.
          </p>
          {result.result.lnaplIndicators.length > 0 && (
            <>
              <p>Classified as separate phase by:</p>
              <ul>
                {result.result.lnaplIndicators.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </>
          )}
          {result.result.precluding.length > 0 && (
            <>
              <p>Precluding factors:</p>
              <ul>
                {result.result.precluding.map((i) => (
                  <li key={i}>
                    <code>{i}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
          {result.result.information.map((i) => (
            <p className="muted" key={i}>
              {i}
            </p>
          ))}
        </>
      )}
    </section>
  );
}

export type SourceChoice = 'entered' | 'vadose' | 'waterTable' | 'saturated';

export function SourcePanel(props: {
  choice: SourceChoice;
  onChoice: (c: SourceChoice) => void;
  held: { choice: Exclude<SourceChoice, 'entered'>; source: SourceSeries }[];
  /** Held sources this screen refuses: another chemical, or none recorded in a multi-chemical project. */
  problems: { choice: Exclude<SourceChoice, 'entered'>; message: string }[];
  epcs: VaporEpcs | null;
  active: SourceSeries | null;
}) {
  const { held, epcs, active } = props;
  const series = active && 'series' in active ? active.series : null;
  const row = (e: VaporEpcs['indoor'][keyof VaporEpcs['indoor']], i: number): number | null => {
    if (!e) return null;
    return e.kind === 'series' ? (e.series.values[i] ?? null) : e.value;
  };
  const cell = (v: number | null): string => (v === null ? 'n/a' : sig(v / MGM3));
  return (
    <section className="panel" aria-label="Source from another screen">
      <h2>Source from another screen</h2>
      {props.problems.map((p) => (
        <div key={p.choice} className="alert" role="alert">
          {p.message}
        </div>
      ))}
      {held.length === 0 ? (
        props.problems.length === 0 ? (
          <p className="muted">
            No other screen has offered a source. Groundwater transport can offer the water table
            under a building, vadose leaching its source pore water, and the saturated soil source
            its region above the water table.
          </p>
        ) : null
      ) : (
        <>
          <p>
            Run the steady vapor methods at each time of a source another screen produced. The
            tables and charts above keep using the source entered on this screen.
          </p>
          <Seg
            legend="Source"
            name="vaporSourceChoice"
            value={props.choice}
            onChange={props.onChoice}
            options={[
              { value: 'entered' as const, label: 'Entered source' },
              ...held.map((h) => ({ value: h.choice, label: h.source.label })),
            ]}
          />
        </>
      )}
      {active && epcs && (
        <>
          {series === null && (
            <p>
              One value ({sig(('constant' in active ? active.constant : 0) * 1e3)} mg/L of pore
              water) gives one indoor air concentration per method:
            </p>
          )}
          <div className="table-wrap">
            <table className="compare">
              <caption className="sr-only">Indoor air over time</caption>
              <thead>
                <tr>
                  <th scope="col">{series ? 'Time (yr)' : 'Quantity'}</th>
                  <th scope="col">Legacy indoor (mg/m3)</th>
                  <th scope="col">Modern indoor (mg/m3)</th>
                  <th scope="col">Legacy outdoor (mg/m3)</th>
                </tr>
              </thead>
              <tbody>
                {(series ? series.times : [0]).map((t, i) => (
                  <tr key={t}>
                    <th scope="row">{series ? sig(t / YR) : 'Result'}</th>
                    <td>{cell(row(epcs.indoor.legacy, i))}</td>
                    <td>{cell(row(epcs.indoor.modern, i))}</td>
                    <td>{cell(row(epcs.outdoor.legacy, i))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.entries(epcs.errors).map(([k, m]) => (
            <p className="note" key={k}>
              <strong>
                {k === 'outdoor' ? 'Outdoor box' : k === 'legacy' ? 'Legacy' : 'Modern'} did not
                run.
              </strong>{' '}
              {m}
            </p>
          ))}
          {epcs.warnings.length > 0 && (
            <ul className="warnings">
              {epcs.warnings.map((w) => (
                <li key={w.code}>
                  <code className="warn-code">{w.code}</code>
                  <span>{w.message}</span>
                </li>
              ))}
            </ul>
          )}
          {series && (
            <DataTable
              caption="Source series"
              columns={['Time (yr)', 'Source (mg/L)']}
              rows={series.times.map((t, i) => [sig(t / YR), sig(series.values[i]! * 1e3)])}
            />
          )}
        </>
      )}
    </section>
  );
}

export function RiskFeedPanel(props: {
  chemicalName: string | null;
  canSend: boolean;
  reason: string | null;
  onSend: () => void;
  held: string | null;
  mode: string;
}) {
  return (
    <section className="panel" aria-label="Exposure and risk">
      <h2>Use the air concentrations for exposure and risk</h2>
      <p>
        The exposure and risk screen can take this screen&apos;s indoor and outdoor air for{' '}
        {props.chemicalName ?? 'a chemical from the database'} as its indoor and outdoor air
        concentrations, for the method shown in detail: {props.mode}.
      </p>
      <p>
        <button type="button" className="btn" disabled={!props.canSend} onClick={props.onSend}>
          Send to exposure and risk
        </button>{' '}
        {props.held && (
          <a className="button" href="#/risk">
            Open exposure and risk
          </a>
        )}
      </p>
      {props.reason && <p className="muted">{props.reason}</p>}
      {props.held && (
        <p className="muted" role="status">
          Exposure and risk can use: {props.held}.
        </p>
      )}
    </section>
  );
}
