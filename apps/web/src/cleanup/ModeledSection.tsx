import type { ModeledEndpoint, Warning } from '@model-flow/engine';
import { MEDIUM_UNIT } from './build';
import { fmtLevel } from './format';
import { ModeledChart } from './ModeledChart';
import type { ModeledMethodOutcome, ModeledOutcome, ModeledRun } from './modeledTypes';

type Method = 'legacy' | 'modern';
const LABEL: Record<Method, string> = { legacy: 'Legacy', modern: 'Modern' };
const BASIS: Record<Method, string> = {
  legacy: 'RAGS Part A and B factors, AT123D-class transport, VADSAT and two-region sources',
  modern: 'RAGS Parts E and F factors, Wexler (1992) transport, layered and exponential sources',
};
const ENDPOINT_TEXT: Record<ModeledEndpoint, string> = {
  cancer: 'cancer',
  noncancer: 'noncancer',
  concentration: 'concentration at the well',
};

const METHOD_TEXT = {
  linear: 'linear shortcut, verified',
  brent: "Brent's method",
  cap: 'the search cap',
  none: 'no solution',
};

const sci = (x: number): string =>
  Number.isFinite(x) ? Number(x.toPrecision(3)).toExponential(1) : 'n/a';
const fmtTarget = (run: ModeledRun): string => {
  const t = run.shown.target;
  if (run.shown.endpoint === 'concentration') return `${Number((t * 1e3).toPrecision(3))} mg/L`;
  return String(Number(t.toPrecision(3)));
};

function Convergence({ run, nested }: { run: ModeledRun; nested: boolean }) {
  const H = nested ? 'h4' : 'h3';
  const c = run.convergence;
  const lv = run.result.levels[0]!;
  return (
    <div>
      <H>Convergence</H>
      <dl className="converge">
        <div>
          <dt>Solved by</dt>
          <dd>{METHOD_TEXT[c.method]}</dd>
        </div>
        <div>
          <dt>Forward runs</dt>
          <dd>{c.evaluations}</dd>
        </div>
        <div>
          <dt>Brent iterations</dt>
          <dd>{c.iterations}</dd>
        </div>
        <div>
          <dt>Residual</dt>
          <dd>
            {sci(Math.abs(c.residual))} (accepted up to {sci(c.acceptance)})
          </dd>
        </div>
        {c.secant && (
          <div>
            <dt>Secant parity</dt>
            <dd>
              {c.secant.converged
                ? `agrees to ${sci(Math.abs(c.secant.level - (lv.level ?? c.secant.level)) / (lv.level ?? c.secant.level))} in ${c.secant.iterations} iterations`
                : `did not converge in ${c.secant.iterations} iterations`}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function MethodSection(props: {
  method: Method;
  outcome: ModeledMethodOutcome;
  medium: ModeledOutcome['medium'];
  name: string;
  /** Name the chemical in the section label (several chemicals on the screen). */
  named?: boolean;
}) {
  const { method, outcome, medium, name } = props;
  // under a chemical's own heading (several chemicals) the sections sit one level lower
  const H = props.named ? 'h3' : 'h2';
  if (!outcome.ok) {
    return (
      <div className="alert" role="alert">
        {LABEL[method]} method did not run{props.named ? ` for ${name}` : ''}: {outcome.error}
      </div>
    );
  }
  const run = outcome.run;
  const lv = run.result.levels[0]!;
  const unit = MEDIUM_UNIT(medium);
  const sourceText = medium === 'soil' ? 'in the source soil' : 'in the source groundwater';
  return (
    <section
      className="panel"
      aria-label={`Modeled cleanup level, ${LABEL[method]}${props.named ? `, ${name}` : ''}`}
    >
      <H>
        {LABEL[method]} <small>{BASIS[method]}</small>
      </H>
      <div className="cleanup-table-wrap">
        <table className="sat cleanup-table">
          <caption className="sr-only">
            Modeled cleanup level {sourceText}, {unit}
          </caption>
          <thead>
            <tr>
              <th scope="col">Chemical</th>
              <th scope="col">Cleanup level</th>
              <th scope="col">Limiting</th>
              <th scope="col">Cancer level</th>
              <th scope="col">Noncancer level</th>
              <th scope="col">Target</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" data-label="Chemical">
                {name}
              </th>
              <td data-label="Cleanup level" className="level">
                <strong>{lv.level === null ? 'not reached' : fmtLevel(lv.level, medium)}</strong>{' '}
                <small>{unit}</small>
              </td>
              <td data-label="Limiting">
                {lv.limiting === null ? 'none' : ENDPOINT_TEXT[lv.limiting]}
              </td>
              <td data-label="Cancer level">{fmtLevel(lv.cancerLevel, medium)}</td>
              <td data-label="Noncancer level">{fmtLevel(lv.noncancerLevel, medium)}</td>
              <td data-label="Target">{fmtTarget(run)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {lv.impliedTph !== null && (
        <p className="muted">
          Implied TPH at the level: {fmtLevel(lv.impliedTph, 'soil')} {MEDIUM_UNIT('soil')}.
        </p>
      )}
      {lv.level === null && (
        <p role="status">
          The target is not reached: the {ENDPOINT_TEXT[run.shown.endpoint]} metric stays below it
          for every source concentration up to the search ceiling, so there is no cleanup level to
          report.
        </p>
      )}
      <Convergence run={run} nested={props.named === true} />
      <ModeledChart run={run} medium={medium} method={method} />
    </section>
  );
}

export function ModeledResults(props: {
  outcome: ModeledOutcome;
  name: string;
  notes: string[];
  named?: boolean;
}) {
  const { outcome } = props;
  const H = props.named ? 'h3' : 'h2';
  const items: { key: string; method: Method; w: Warning }[] = [];
  for (const m of ['legacy', 'modern'] as const) {
    const o = outcome[m];
    if (o?.ok)
      o.run.result.warnings.forEach((w, i) =>
        items.push({ key: `${m}:${w.code}:${i}`, method: m, w }),
      );
  }
  const total = items.length + props.notes.length;
  return (
    <>
      {(['modern', 'legacy'] as const).map((m) => {
        const o = outcome[m];
        return o ? (
          <MethodSection
            key={m}
            method={m}
            outcome={o}
            medium={outcome.medium}
            name={props.name}
            {...(props.named ? { named: true } : {})}
          />
        ) : null;
      })}
      <section
        className="panel"
        aria-label={props.named ? `Warnings and notes, ${props.name}` : 'Warnings and notes'}
      >
        <H>Warnings and notes ({total})</H>
        {total === 0 ? (
          <p className="muted">No warnings.</p>
        ) : (
          <ul className="warnings">
            {props.notes.map((n) => (
              <li key={n}>
                <code>ui.source-note</code>
                <span>{n}</span>
              </li>
            ))}
            {items.map(({ key, method, w }) => (
              <li key={key}>
                <code>{w.code}</code>
                <span>
                  <strong>{LABEL[method]}.</strong> {w.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
