import {
  PATHWAYS,
  type DirectLevel,
  type DirectMediumResult,
  type Medium,
  type PathwayId,
  type Warning,
} from '@model-flow/engine';
import { PATHWAY_LABELS } from '../risk/chartData';
import { MEDIA } from '../risk/form';
import { MEDIUM_UNIT, type CleanupLegacyInput, type CleanupModernInput } from './build';
import { fmtLevel } from './format';
import type { CleanupOutcome } from './compute';

type Method = 'legacy' | 'modern';
const METHOD_LABEL: Record<Method, string> = { legacy: 'Legacy', modern: 'Modern' };
const METHOD_BASIS: Record<Method, string> = {
  legacy: 'RAGS Part A and B, 1989 and 1991 factors',
  modern: 'RAGS Parts E and F, 2014 factors',
};

const mediumLabel = (m: Medium): string => MEDIA.find((x) => x.key === m)?.label ?? m;

const fmtScale = (s: number): string => String(Number(s.toPrecision(4)));

function limitingText(lv: DirectLevel): string {
  if (lv.limiting === null) return 'none';
  return lv.limiting;
}

function detailText(lv: DirectLevel): string {
  if (lv.limiting === null) return '';
  const bits: string[] = [];
  if (lv.limiting === 'noncancer' && lv.noncancerGroup !== null) {
    bits.push(`group ${lv.noncancerGroup}`);
  }
  if (lv.limitingReceptor !== null) bits.push(lv.limitingReceptor);
  return bits.join(', ');
}

function MediumTable(props: { result: DirectMediumResult; names: Record<string, string> }) {
  const { result, names } = props;
  const m = result.medium;
  const unit = MEDIUM_UNIT(m);
  return (
    <div className="cleanup-medium">
      <h3>
        {mediumLabel(m)} <small>({unit})</small>
      </h3>
      <div className="cleanup-table-wrap">
        <table className="sat cleanup-table">
          <caption className="sr-only">
            Cleanup levels in {mediumLabel(m).toLowerCase()}, {unit}
          </caption>
          <thead>
            <tr>
              <th scope="col">Chemical</th>
              <th scope="col">Cleanup level</th>
              <th scope="col">Limiting</th>
              <th scope="col">Cancer level</th>
              <th scope="col">Noncancer level</th>
              <th scope="col">Governed by</th>
            </tr>
          </thead>
          <tbody>
            {result.levels.map((lv) => (
              <tr key={lv.chemical}>
                <th scope="row" data-label="Chemical">
                  {names[lv.chemical] ?? lv.chemical}
                </th>
                <td data-label="Cleanup level" className="level">
                  <strong>{fmtLevel(lv.level, m)}</strong>
                </td>
                <td data-label="Limiting">{limitingText(lv)}</td>
                <td data-label="Cancer level">{fmtLevel(lv.cancerLevel, m)}</td>
                <td data-label="Noncancer level">{fmtLevel(lv.noncancerLevel, m)}</td>
                <td data-label="Governed by">{detailText(lv) || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.allocation === 'cumulative' && (
        <p className="muted">
          {result.scale === null
            ? 'Common scale: not quantified.'
            : `Common scale on your entered concentrations: ${fmtScale(result.scale)} (${result.scaleLimiting} governs). Multiply each entered concentration by it to get the level above.`}
        </p>
      )}
    </div>
  );
}

function PathwayTable(props: { result: DirectMediumResult; names: Record<string, string> }) {
  const { result, names } = props;
  const m = result.medium;
  const rows = result.levels.flatMap((lv) =>
    lv.byReceptor.flatMap((r) =>
      r.byPathway.map((p) => ({ key: `${lv.chemical}|${r.label}|${p.pathway}`, lv, r, p })),
    ),
  );
  if (rows.length === 0) return null;
  return (
    <details className="group cleanup-pathways">
      <summary>
        {mediumLabel(m)}: each pathway alone ({MEDIUM_UNIT(m)})
      </summary>
      <div className="group-body">
        <div className="cleanup-table-wrap">
          <table className="sat cleanup-table">
            <caption className="sr-only">Level from each pathway alone in {mediumLabel(m)}</caption>
            <thead>
              <tr>
                <th scope="col">Chemical</th>
                <th scope="col">Receptor</th>
                <th scope="col">Pathway</th>
                <th scope="col">Cancer level</th>
                <th scope="col">Noncancer level</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, lv, r, p }) => (
                <tr key={key}>
                  <th scope="row" data-label="Chemical">
                    {names[lv.chemical] ?? lv.chemical}
                  </th>
                  <td data-label="Receptor">{r.label}</td>
                  <td data-label="Pathway">{PATHWAY_LABELS[p.pathway]}</td>
                  <td data-label="Cancer level">{fmtLevel(p.cancerLevel, m)}</td>
                  <td data-label="Noncancer level">{fmtLevel(p.noncancerLevel, m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

const ALLOCATION_NOTE: Record<string, string> = {
  individual:
    'Each chemical is solved alone; the lower of its cancer and noncancer levels governs.',
  equal:
    'Each chemical is solved against the target divided equally among the chemicals that carry a cancer or noncancer value, so the mix of levels together stays inside the target.',
  cumulative:
    'All chemicals keep the ratios you entered and one common scale is found so the summed risk and hazard index meet their targets.',
};

export function LevelsSection(props: {
  method: Method;
  outcome: CleanupOutcome['legacy'];
  names: Record<string, string>;
}) {
  const { method, outcome, names } = props;
  if (!outcome.ok) return null;
  const media = outcome.result.media;
  const allocation = media[0]?.allocation ?? 'individual';
  return (
    <section className="panel" aria-label={`Cleanup levels, ${METHOD_LABEL[method]}`}>
      <h2>
        {METHOD_LABEL[method]} <small>{METHOD_BASIS[method]}</small>
      </h2>
      <p className="muted">{ALLOCATION_NOTE[allocation]}</p>
      {media.map((r) => (
        <MediumTable key={r.medium} result={r} names={names} />
      ))}
      {media.map((r) => (
        <PathwayTable key={`p-${r.medium}`} result={r} names={names} />
      ))}
    </section>
  );
}

interface Item {
  key: string;
  method: Method;
  chemical: string;
  where: string;
  what: string;
}

/** What has no level or no endpoint, so a missing value is never read as a zero or as no limit. */
export function NotQuantified(props: {
  outcome: CleanupOutcome;
  inputs: { legacy: CleanupLegacyInput; modern: CleanupModernInput };
  names: Record<string, string>;
}) {
  const items: Item[] = [];
  for (const method of ['legacy', 'modern'] as const) {
    const o = props.outcome[method];
    if (!o.ok) continue;
    const receptors = props.inputs[method].receptors;
    for (const r of o.result.media) {
      for (const lv of r.levels) {
        const name = props.names[lv.chemical] ?? lv.chemical;
        if (lv.level === null) {
          const entered = props.inputs[method].chemicals.find((c) => c.id === lv.chemical)?.entered;
          const zeroEntered = r.allocation === 'cumulative' && entered?.[r.medium] === 0;
          items.push({
            key: `${method}|${r.medium}|${lv.chemical}`,
            method,
            chemical: name,
            where: mediumLabel(r.medium),
            what: zeroEntered
              ? 'no concentration entered (blank or zero) in this medium; with cumulative allocation it has no level, which is not the same as a required level of zero'
              : 'no toxicity value for any switched-on pathway of this medium; no risk-based level',
          });
          continue;
        }
        if (lv.cancerLevel === null) {
          items.push({
            key: `${method}|${r.medium}|${lv.chemical}|c`,
            method,
            chemical: name,
            where: mediumLabel(r.medium),
            what: 'no cancer endpoint; the level rests on the noncancer endpoint alone',
          });
        } else if (lv.noncancerLevel === null) {
          items.push({
            key: `${method}|${r.medium}|${lv.chemical}|n`,
            method,
            chemical: name,
            where: mediumLabel(r.medium),
            what: 'no noncancer endpoint; the level rests on the cancer endpoint alone',
          });
        }
        // pathways switched on for the medium that did not compute (individual and equal only)
        if (r.allocation !== 'cumulative') {
          lv.byReceptor.forEach((rl, ri) => {
            const on = receptors[ri]?.pathways ?? [];
            const present = new Set(rl.byPathway.map((p) => p.pathway));
            for (const p of on as readonly PathwayId[]) {
              if (PATHWAYS[p].medium === r.medium && !present.has(p)) {
                items.push({
                  key: `${method}|${lv.chemical}|${rl.label}|${p}`,
                  method,
                  chemical: name,
                  where: `${PATHWAY_LABELS[p]}, ${rl.label}`,
                  what: 'an exposure input or chemical value is missing (see the warnings)',
                });
              }
            }
          });
        }
      }
    }
  }
  return (
    <section className="panel" aria-label="Not quantified">
      <h2>Not quantified ({items.length})</h2>
      {items.length === 0 ? (
        <p className="muted">Every chemical and pathway switched on was quantified.</p>
      ) : (
        <>
          <p className="muted">
            These add nothing to the level above and are not counted as unlimited.
          </p>
          <ul className="warnings">
            {items.map((i) => (
              <li key={i.key}>
                <code>{METHOD_LABEL[i.method]}</code>
                <span>
                  <strong>{i.chemical}</strong>, {i.where}: {i.what}.
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function WarningsList(props: { outcome: CleanupOutcome; notes: string[] }) {
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
