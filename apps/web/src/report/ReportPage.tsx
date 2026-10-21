import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { currentProject, type StaleFeedKey } from '../project/store';
import { staleAmong, staleSentence, useStaleFeeds } from '../project/staleFeeds';
import { overridesOf } from '../project';
import { loadOverrideRows, receptorEditRows, type ReceptorEditRow } from './userValues';
import type { OverrideRow } from '../overrides/toxicity';
import { fmtTox } from '../risk/format';
import { buildReport, type Report } from './buildReport';
import { ReportCharts } from './ReportCharts';
import { ReportUncertainty } from './UncertaintyResults';
import { computeResults, tableText, type ProjectResults, type SectionResults } from './results';
import { HelpLink } from '../docs/HelpLink';

const KIND_LABEL = { legacy: 'Legacy', modern: 'Modern' } as const;

function dateText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

function ResultTables({ results }: { results: SectionResults }) {
  return (
    <>
      {results.notes.length > 0 && (
        <ul className="report-notes">
          {results.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {results.tables.map((t) => {
        const text = tableText(t);
        return (
          <div key={text.name} className="result-block">
            <h4>{text.label}</h4>
            <table className="result-table" aria-label={text.label}>
              <thead>
                <tr>
                  {text.headers.map((h, i) => (
                    <th key={`${i}:${h}`} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {text.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} data-label={text.headers[c]}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {text.total > text.rows.length && (
              <p className="muted">
                Showing the first {text.rows.length} of {text.total} rows. The CSV download on the
                screen holds all of them.
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}

function ResultWarnings({ results }: { results: SectionResults }) {
  return (
    <>
      <h3>Warnings and notes</h3>
      {results.warnings.length === 0 ? (
        <p className="muted">No engine warnings.</p>
      ) : (
        <ul className="report-warnings">
          {results.warnings.map((w) => (
            <li key={`${w.origin}:${w.code}:${w.message}`}>
              <code>{w.code}</code> <span className="muted">({w.origin})</span> {w.message}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ReportView({
  report,
  preparedBy,
  results = null,
  uncertainty = null,
  userValues = [],
  receptorEdits = [],
  staleFeeds = [],
}: {
  report: Report;
  preparedBy: string;
  /** Results per screen; null while they compute. */
  results?: ProjectResults | null;
  /** The uncertainty control and results, shown in the uncertainty setup section. */
  uncertainty?: ReactNode;
  /** Values the user supplied in place of database values. */
  userValues?: readonly OverrideRow[];
  /** Exposure factors the user edited in place of a receptor preset's. */
  receptorEdits?: readonly ReceptorEditRow[];
  /** Feeds from other screens whose inputs changed after they were sent; sections computed from them say so. */
  staleFeeds?: readonly StaleFeedKey[];
}) {
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

      {report.site !== null && (
        <p className="report-site">
          <strong>Site model:</strong> {report.site}
        </p>
      )}

      {report.sections.length === 0 ? (
        <p className="muted">
          No screen has been edited, so there is nothing to report yet. Enter inputs on a screen and
          return here.
        </p>
      ) : (
        report.sections.map((sec) => {
          const stale = staleAmong(sec.reads, staleFeeds);
          const staleText =
            stale.length === 0
              ? ''
              : `${staleSentence(stale)}. The values below were computed from the sent values, which no longer match the inputs of the sending screen.`;
          return (
            <section key={sec.key} className="report-section" aria-labelledby={`rep-${sec.key}`}>
              <h2 id={`rep-${sec.key}`}>{sec.name}</h2>
              {stale.length > 0 && (
                <p className="report-stale" role="note">
                  <span className="badge badge-legacy">Out of date inputs</span> {staleText}
                </p>
              )}
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
              <h3>Results</h3>
              {stale.length > 0 && (
                <ul className="report-notes">
                  <li>{staleText}</li>
                </ul>
              )}
              {results === null ? (
                <p className="muted" role="status">
                  Computing results...
                </p>
              ) : results[sec.key] === undefined ? (
                <p className="muted">No results for this screen.</p>
              ) : (
                <ResultTables results={results[sec.key]!} />
              )}
              {results?.[sec.key] !== undefined && (
                <ReportCharts charts={results[sec.key]!.charts} />
              )}
              {results?.[sec.key] !== undefined && <ResultWarnings results={results[sec.key]!} />}
              {sec.key === 'uncertainty' && uncertainty}
              <p className="muted">
                Methods run:{' '}
                {statement.methods
                  .filter((m) => sec.methodIds.includes(m.id))
                  .map((m) => m.name)
                  .join('; ')}
                .
              </p>
            </section>
          );
        })
      )}

      {report.unused.length > 0 && report.sections.length > 0 && (
        <p className="muted">
          Screens left at their defaults and not reported: {report.unused.join(', ')}.
        </p>
      )}
      {userValues.length > 0 && (
        <section className="report-section" aria-labelledby="rep-user-values">
          <h2 id="rep-user-values">Values supplied by the user</h2>
          <p className="muted">
            These toxicity values replace the database value for this project only. Each is the
            user's own entry with the source note given for it; the database was not changed.
          </p>
          <table className="report-table report-user-values">
            <caption className="sr-only">Toxicity values supplied by the user</caption>
            <thead>
              <tr>
                <th scope="col">Chemical</th>
                <th scope="col">Value</th>
                <th scope="col">Database value</th>
                <th scope="col">Value used</th>
                <th scope="col">Source note</th>
              </tr>
            </thead>
            <tbody>
              {userValues.map((r) => (
                <tr key={`${r.cas}:${r.label}`}>
                  <th scope="row">
                    {r.chemical}
                    {r.cas !== '' ? ` (${r.cas})` : ''}
                  </th>
                  <td>
                    {r.label} ({r.unit})
                  </td>
                  <td>{r.dbValue === null ? 'none' : fmtTox(r.dbValue)}</td>
                  <td>
                    {r.userValue === null
                      ? 'not used (incomplete entry)'
                      : `${fmtTox(r.userValue)} (user-supplied)`}
                  </td>
                  <td>{r.note === '' ? '(none)' : r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {receptorEdits.length > 0 && (
        <section className="report-section" aria-labelledby="rep-receptor-edits">
          <h2 id="rep-receptor-edits">Receptor factors supplied by the user</h2>
          <p className="muted">
            These exposure factors replace the receptor preset's value for this project only. Each
            is the user's own entry; the presets were not changed.
          </p>
          <table className="report-table report-user-values">
            <caption className="sr-only">Receptor exposure factors supplied by the user</caption>
            <thead>
              <tr>
                <th scope="col">Receptor</th>
                <th scope="col">Factor</th>
                <th scope="col">Preset value</th>
                <th scope="col">Value used</th>
              </tr>
            </thead>
            <tbody>
              {receptorEdits.map((r) => (
                <tr key={`${r.receptor}:${r.factor}`}>
                  <th scope="row">{r.receptor}</th>
                  <td>
                    {r.factor} ({r.unit})
                  </td>
                  <td>{r.presetValue}</td>
                  <td>{r.userValue} (user-supplied)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="muted report-scope">
        Inputs are shown as typed, in the units each screen labels. Results are the screen's own
        tables, computed again from these inputs, with numbers shortened to six significant digits;
        the CSV download on each screen holds every row at full precision. Each chart is followed by
        its data table. Uncertainty results are included only when asked for, and are repeated from
        the saved setup and seed.
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
  const project = useMemo(() => currentProject(), []);
  const report = useMemo(() => buildReport(project), [project]);
  const staleFeeds = useStaleFeeds();
  const [results, setResults] = useState<ProjectResults | null>(null);
  const [userValues, setUserValues] = useState<OverrideRow[]>([]);
  const receptorEdits = useMemo(() => receptorEditRows(project), [project]);
  useEffect(() => {
    let live = true;
    if (Object.keys(overridesOf(project).toxicity).length === 0) return;
    loadOverrideRows(project).then(
      (r) => live && setUserValues(r),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [project]);
  useEffect(() => {
    let live = true;
    computeResults(project).then(
      (r) => live && setResults(r),
      () => live && setResults({}),
    );
    return () => {
      live = false;
    };
  }, [project]);
  return (
    <section aria-labelledby="report-heading">
      <div className="report-tools">
        <h1 id="report-heading" className="report-page-title">
          Report
        </h1>
        <HelpLink target="report" />
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
      <ReportView
        report={report}
        preparedBy={preparedBy}
        results={results}
        userValues={userValues}
        receptorEdits={receptorEdits}
        staleFeeds={staleFeeds}
        uncertainty={<ReportUncertainty project={project} />}
      />
    </section>
  );
}
