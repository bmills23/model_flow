import type { EpcRecord, ReceptorRiskSummary, Warning } from '@model-flow/engine';
import { PATHWAY_LABELS, barRows, fmtHi, fmtRisk, type BarRow } from './chartData';
import { TRANSPORT_YEAR_S } from './build';
import type { RiskOutcome } from './compute';
import { StackedBars } from './StackedBars';
import type { PathwayId } from '@model-flow/engine';

type Method = 'legacy' | 'modern';
const METHOD_LABEL: Record<Method, string> = { legacy: 'Legacy', modern: 'Modern' };

const ratio = (modern: number, legacy: number): string =>
  legacy > 0 && modern > 0 ? `${Number((modern / legacy).toPrecision(2))}x` : 'not defined';

function summaries(outcome: RiskOutcome): Record<Method, ReceptorRiskSummary[] | null> {
  return {
    legacy: outcome.legacy.ok ? outcome.legacy.result.summary.receptors : null,
    modern: outcome.modern.ok ? outcome.modern.result.summary.receptors : null,
  };
}

function hiText(s: ReceptorRiskSummary, method: Method): string {
  if (s.headlineGroup === null) return 'not quantified';
  return method === 'legacy'
    ? `${fmtHi(s.hi)} (all target organs)`
    : `${fmtHi(s.hi)} (${s.headlineGroup})`;
}

/** Legacy against modern for each receptor, from the same concentrations. */
export function Comparison(props: { outcome: RiskOutcome; additive: boolean }) {
  const { outcome } = props;
  const s = summaries(outcome);
  const count = Math.max(s.legacy?.length ?? 0, s.modern?.length ?? 0);
  const modernAdd = outcome.modern.ok ? outcome.modern.result.summary.additiveCancerRisk : null;
  const legacyAdd = outcome.legacy.ok ? outcome.legacy.result.summary.additiveCancerRisk : null;
  return (
    <section className="panel" aria-label="Legacy versus modern">
      <h2>Legacy versus modern</h2>
      <p className="muted">
        The same chemicals, concentrations and receptor choices, run through the legacy (RAGS Part
        A, 1991 factors) and the modern (RAGS Parts E and F, 2014 factors) methods.
      </p>
      {Array.from({ length: count }, (_, i) => {
        const l = s.legacy?.[i];
        const m = s.modern?.[i];
        const label = (l ?? m)!.label;
        const groups = m && Object.keys(m.hiByGroup).length > 1 ? m.hiByGroup : null;
        return (
          <div className="sat-wrap" key={label}>
            <table className="sat cmp">
              <caption>{label}</caption>
              <thead>
                <tr>
                  <th scope="col">Quantity</th>
                  <th scope="col">Legacy</th>
                  <th scope="col">Modern</th>
                  <th scope="col">Modern over legacy</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Cancer risk</th>
                  <td>{l ? fmtRisk(l.cancerRisk) : 'did not run'}</td>
                  <td>{m ? fmtRisk(m.cancerRisk) : 'did not run'}</td>
                  <td>{l && m ? ratio(m.cancerRisk, l.cancerRisk) : '-'}</td>
                </tr>
                <tr>
                  <th scope="row">Hazard index</th>
                  <td>{l ? hiText(l, 'legacy') : 'did not run'}</td>
                  <td>{m ? hiText(m, 'modern') : 'did not run'}</td>
                  <td>{l && m ? ratio(m.hi, l.hi) : '-'}</td>
                </tr>
              </tbody>
            </table>
            {groups && (
              <p className="muted">
                Modern life-stage hazard indices, never added:{' '}
                {Object.entries(groups)
                  .map(([g, v]) => `${g} ${fmtHi(v)}`)
                  .join(', ')}
                .
              </p>
            )}
          </div>
        );
      })}
      {props.additive && (
        <p>
          Two receptors added (cancer risk only, hazard indices never added): legacy{' '}
          <strong>{legacyAdd === null ? 'did not run' : fmtRisk(legacyAdd)}</strong>, modern{' '}
          <strong>{modernAdd === null ? 'did not run' : fmtRisk(modernAdd)}</strong>.
        </p>
      )}
    </section>
  );
}

/** The four stacked-bar charts: cancer risk and hazard index, by pathway and by chemical. */
export function Charts(props: { outcome: RiskOutcome; names: Record<string, string> }) {
  const s = summaries(props.outcome);
  const rows = (['legacy', 'modern'] as const).flatMap((method) =>
    (s[method] ?? []).map((summary) => ({
      label: `${summary.label}, ${method}`,
      summary,
    })),
  );
  if (rows.length === 0) return null;
  const make = (measure: 'risk' | 'hi', by: 'pathway' | 'chemical'): BarRow[] =>
    barRows(measure, by, rows, props.names);
  return (
    <>
      <StackedBars
        by="Pathway"
        title="Cancer risk by pathway"
        rows={make('risk', 'pathway')}
        fmt={fmtRisk}
        unit="incremental lifetime cancer risk"
        ariaLabel="Cancer risk by pathway, stacked bars for each receptor and method."
      />
      <StackedBars
        by="Chemical"
        title="Cancer risk by chemical"
        rows={make('risk', 'chemical')}
        fmt={fmtRisk}
        unit="incremental lifetime cancer risk"
        ariaLabel="Cancer risk by chemical, stacked bars for each receptor and method."
      />
      <StackedBars
        by="Pathway"
        title="Hazard index by pathway"
        rows={make('hi', 'pathway')}
        fmt={fmtHi}
        unit="hazard index (the modern headline is the largest life stage)"
        ariaLabel="Hazard index by pathway, stacked bars for each receptor and method."
      />
      <StackedBars
        by="Chemical"
        title="Hazard index by chemical"
        rows={make('hi', 'chemical')}
        fmt={fmtHi}
        unit="hazard index (the modern headline is the largest life stage)"
        ariaLabel="Hazard index by chemical, stacked bars for each receptor and method."
      />
    </>
  );
}

const WHAT: Record<'cancer' | 'noncancer' | 'inputs', string> = {
  cancer: 'no cancer toxicity value for this route',
  noncancer: 'no noncancer toxicity value for this route',
  inputs: 'an exposure input or chemical property is missing (see the warnings)',
};

/** What is left out of the totals, so a missing value is never read as a zero. */
export function NotQuantified(props: { outcome: RiskOutcome; names: Record<string, string> }) {
  const s = summaries(props.outcome);
  const items = (['legacy', 'modern'] as const).flatMap((method) =>
    (s[method] ?? []).flatMap((r) =>
      r.notQuantified.map((n) => ({
        key: `${method}:${r.label}:${n.chemical}:${n.pathway}`,
        method,
        receptor: r.label,
        chemical: props.names[n.chemical] ?? n.chemical,
        pathway: PATHWAY_LABELS[n.pathway as PathwayId],
        what: n.what.map((w) => WHAT[w]).join('; '),
      })),
    ),
  );
  return (
    <section className="panel" aria-label="Not quantified">
      <h2>Not quantified ({items.length})</h2>
      {items.length === 0 ? (
        <p className="muted">Every chemical and pathway switched on was quantified.</p>
      ) : (
        <>
          <p className="muted">These are left out of the totals above, not counted as zero.</p>
          <ul className="warnings">
            {items.map((i) => (
              <li key={i.key}>
                <code>
                  {METHOD_LABEL[i.method]}, {i.receptor}
                </code>
                <span>
                  <strong>{i.chemical}</strong>, {i.pathway}: {i.what}.
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Where each concentration came from and how it was reduced. */
export function EpcTable(props: { outcome: RiskOutcome; names: Record<string, string> }) {
  const { outcome } = props;
  const base = outcome.legacy.ok
    ? outcome.legacy.result
    : outcome.modern.ok
      ? outcome.modern.result
      : null;
  if (base === null) return null;
  const labels = base.receptors.map((r) => r.label);
  const starts = outcome.modern.ok ? outcome.modern.result.startTimes : [];
  return (
    <section className="panel" aria-label="Exposure point concentrations">
      <h2>Exposure point concentrations</h2>
      <div className="sat-wrap">
        <table className="sat">
          <caption className="sr-only">Exposure point concentrations and their origin</caption>
          <thead>
            <tr>
              <th scope="col">Receptor</th>
              <th scope="col">Chemical</th>
              <th scope="col">Pathway</th>
              <th scope="col">Origin</th>
              <th scope="col">Kind</th>
            </tr>
          </thead>
          <tbody>
            {base.epcs.flatMap((records: EpcRecord[], i: number) =>
              records.map((e) => (
                <tr key={`${i}:${e.chemical}:${e.pathway}`}>
                  <th scope="row">{labels[i]}</th>
                  <td>{props.names[e.chemical] ?? e.chemical}</td>
                  <td>{PATHWAY_LABELS[e.pathway]}</td>
                  <td>{e.origin}</td>
                  <td>{e.kind === 'series' ? 'time series, windowed' : 'constant'}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      {starts.some((t) => t !== null) && (
        <p className="muted">
          Modern exposure start (the time that maximizes the cancer risk):{' '}
          {starts
            .map((t, i) =>
              t === null
                ? null
                : `${labels[i]} year ${Number((t / TRANSPORT_YEAR_S).toPrecision(3))}`,
            )
            .filter(Boolean)
            .join('; ')}
          . A series is averaged over each exposure window; the legacy method takes the largest
          window average.
        </p>
      )}
    </section>
  );
}

export function WarningsList(props: { outcome: RiskOutcome; notes: string[] }) {
  const items: { key: string; code: string; method: string; message: string }[] = [];
  const add = (method: Method, ws: readonly Warning[]) =>
    ws.forEach((w, i) =>
      items.push({
        key: `${method}:${w.code}:${i}`,
        code: w.code,
        method: METHOD_LABEL[method],
        message: w.message,
      }),
    );
  if (props.outcome.legacy.ok) add('legacy', props.outcome.legacy.result.warnings);
  if (props.outcome.modern.ok) add('modern', props.outcome.modern.result.warnings);
  const total = items.length + props.notes.length;
  return (
    <section className="panel" aria-label="Warnings and notes">
      <h2>Warnings and notes ({total})</h2>
      {total === 0 ? (
        <p className="muted">No warnings.</p>
      ) : (
        <ul className="warnings">
          {props.notes.map((n) => (
            <li key={n}>
              <code>ui.pathway-skipped</code>
              <span>{n}</span>
            </li>
          ))}
          {items.map((w) => (
            <li key={w.key}>
              <code>{w.code}</code>
              <span>
                <strong>{w.method}.</strong> {w.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
