import { useId, useMemo, useState } from 'react';
import { currentProject } from '../project/store';
import { buildReport, type Report } from './buildReport';

const KIND_LABEL = { legacy: 'Legacy', modern: 'Modern' } as const;

function dateText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

export function ReportView({ report, preparedBy }: { report: Report; preparedBy: string }) {
  const { statement } = report;
  return (
    <article className="report" aria-label="Project report">
      <header className="report-head">
        <h2 className="report-title">
          {report.title === '' ? 'model_flow project report' : report.title}
        </h2>
        <dl className="report-meta">
          <div>
            <dt>Date</dt>
            <dd>{dateText(report.savedAt)}</dd>
          </div>
          <div>
            <dt>App version</dt>
            <dd>{report.createdWith}</dd>
          </div>
          {preparedBy.trim() !== '' && (
            <div>
              <dt>Prepared by</dt>
              <dd>{preparedBy}</dd>
            </div>
          )}
        </dl>
        <p className="report-affiliation">{report.nonAffiliation}</p>
      </header>

      {report.sections.length === 0 ? (
        <p className="muted">
          No screen has been edited, so there is nothing to report yet. Enter inputs on a screen and
          return here.
        </p>
      ) : (
        report.sections.map((sec) => (
          <section key={sec.key} className="report-section" aria-labelledby={`rep-${sec.key}`}>
            <h2 id={`rep-${sec.key}`}>{sec.name}</h2>
            <h3>Inputs</h3>
            <table className="report-table">
              <thead>
                <tr>
                  <th scope="col">Input</th>
                  <th scope="col">Value as entered</th>
                </tr>
              </thead>
              <tbody>
                {sec.inputs.map((row) => (
                  <tr key={row.path}>
                    <th scope="row">{row.label}</th>
                    <td>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              Methods run:{' '}
              {statement.methods
                .filter((m) => sec.methodIds.includes(m.id))
                .map((m) => m.name)
                .join('; ')}
              .
            </p>
          </section>
        ))
      )}

      {report.unused.length > 0 && report.sections.length > 0 && (
        <p className="muted">
          Screens left at their defaults and not reported: {report.unused.join(', ')}.
        </p>
      )}
      <p className="muted report-scope">
        Inputs are shown as typed, in the units each screen labels. Results, charts and any warnings
        are on each screen and in its CSV download.
      </p>

      <section className="report-section" aria-labelledby="rep-methods">
        <h2 id="rep-methods">Methods statement</h2>
        {statement.methods.length === 0 ? (
          <p className="muted">No methods were run.</p>
        ) : (
          statement.methods.map((m) => (
            <section key={m.id} className="report-method" aria-label={m.name}>
              <h3>
                {m.name} <span className={`badge badge-${m.kind}`}>{KIND_LABEL[m.kind]}</span>
              </h3>
              <p>
                {m.summary}
                {m.refs.length > 0 && <sup> [{m.refs.join(', ')}]</sup>}
              </p>
              {m.assumptions.length > 0 && (
                <>
                  <h4>Assumptions</h4>
                  <ul>
                    {m.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </>
              )}
              {m.risc5Choice && (
                <>
                  <h4>RISC5 choice</h4>
                  <p>{m.risc5Choice}</p>
                </>
              )}
            </section>
          ))
        )}
        {statement.data.length > 0 && (
          <>
            <h3>Data</h3>
            <ul>
              {statement.data.map((d) => (
                <li key={d.kind}>
                  {d.label}, edition {d.edition}
                  <sup> [{d.refs.join(', ')}]</sup>
                </li>
              ))}
            </ul>
          </>
        )}
        {statement.references.length > 0 && (
          <>
            <h3>References</h3>
            <ol className="report-refs">
              {statement.references.map((r) => (
                <li key={r.key} value={r.n}>
                  {r.text}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </article>
  );
}

export function ReportPage() {
  const [preparedBy, setPreparedBy] = useState('');
  const id = useId();
  const report = useMemo(() => buildReport(currentProject()), []);
  return (
    <section aria-labelledby="report-heading">
      <div className="report-tools">
        <h1 id="report-heading" className="report-page-title">
          Report
        </h1>
        <label htmlFor={id} className="report-prepared">
          Prepared by (optional)
          <input
            id={id}
            type="text"
            value={preparedBy}
            onChange={(e) => setPreparedBy(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button type="button" className="btn" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
      <ReportView report={report} preparedBy={preparedBy} />
    </section>
  );
}
