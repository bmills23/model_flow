import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { currentProject, type StaleFeedKey, type StaleSlot } from '../project/store';
import { staleAmong, staleSentence, useStaleSlots } from '../project/staleFeeds';
import { chemicalsOf, overridesOf } from '../project';
import validation from '@model-flow/data/generated/validation/validation.json';
import { loadChemicalDb } from '../risk/chemicalDb';
import { effectiveDb, withUserFateRows } from '../overrides/userChemicals';
import { loadVaporChemicals } from '../vapor/chemicals';
import { DownloadCsv } from '../export/DownloadCsv';
import { BUILD_COMMIT } from '../buildInfo';
import { runBasis, type BasisDefault, type BasisRow, type ProjectBasis } from './basis';
import { basisCsvTable, basisSummary, KIND_LABEL, publishedExampleCount } from './basisView';
import {
  loadOverrideRows,
  receptorEditRows,
  userChemicalRowsOf,
  type ReceptorEditRow,
} from './userValues';
import type { UserChemicalRow } from '../overrides/userChemicals';
import type { OverrideRow } from '../overrides/toxicity';
import { fmtTox } from '../risk/format';
import { loadCleanupProps } from '../cleanup/ssg';
import { buildReport, SCREEN_NAMES, type Report } from './buildReport';
import type { ScreenKey } from './methodsRun';
import { ReportCharts } from './ReportCharts';
import { ReportUncertainty } from './UncertaintyResults';
import { computeResults, tableText, type ProjectResults, type SectionResults } from './results';
import type { ChemicalBlock } from './chemicalBlocks';
import type { CsvTable } from '../export/DownloadCsv';
import { HelpLink } from '../docs/HelpLink';

const MODEL_KIND_LABEL = { legacy: 'Legacy', modern: 'Modern' } as const;

function dateText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

function MethodBasisNote({ basis }: { basis: NonNullable<SectionResults['methodBasis']> }) {
  return (
    <div className="report-method-basis">
      <p>
        <strong>Method basis.</strong> {basis.statement}
      </p>
      {basis.disagreements.length > 0 && (
        <div role="note" className="report-method-disagree">
          <p>
            <span className="badge badge-legacy">Methods disagree</span> The legacy and modern
            methods disagree on whether a criterion or target is exceeded. The conclusion follows
            the {basis.basis}; the other result is a sensitivity.
          </p>
          <ul className="report-notes">
            {basis.disagreements.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ResultTable({ table, level = 4 }: { table: CsvTable; level?: 4 | 5 }) {
  const text = tableText(table);
  const Heading = level === 4 ? 'h4' : 'h5';
  return (
    <div className="result-block">
      <Heading>{text.label}</Heading>
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
    </div>
  );
}

function ChemicalBlocks({ blocks }: { blocks: readonly ChemicalBlock[] }) {
  return (
    <div className="report-chemicals">
      <h4>Results sent on, one block per chemical</h4>
      <p className="muted">
        A screen runs one chemical at a time. Each block below is the result sent from this screen
        for one chemical, as the later screens used it, with the inputs it ran with.
      </p>
      {blocks.map((b) => (
        <section key={b.chemicalId} className="report-chemical" aria-label={b.name}>
          <h4 className="report-chemical-name">{b.name}</h4>
          <ul className="report-notes">
            {b.sent.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {b.notes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {b.inputs.length > 0 && (
            <table className="report-table" aria-label={`Inputs of the sent run, ${b.name}`}>
              <thead>
                <tr>
                  <th scope="col">Input of the sent run</th>
                  <th scope="col">Value</th>
                </tr>
              </thead>
              <tbody>
                {b.inputs.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {b.tables.map((t) => (
            <ResultTable key={t.name} table={t} level={5} />
          ))}
        </section>
      ))}
    </div>
  );
}

function ResultTables({ results }: { results: SectionResults }) {
  return (
    <>
      {results.methodBasis !== undefined && <MethodBasisNote basis={results.methodBasis} />}
      {results.chemicals !== undefined && <ChemicalBlocks blocks={results.chemicals} />}
      {results.current !== undefined && (
        <p className="report-current-run">
          <strong>Run on the screen now: {results.current.chemical}.</strong>{' '}
          {results.current.sentTo === null
            ? 'This run was not sent to another screen, so the exposure, risk and cleanup results do not use it.'
            : `Its result was sent to ${results.current.sentTo}.`}{' '}
          What follows in this section is this run.
        </p>
      )}
      {results.notes.length > 0 && (
        <ul className="report-notes">
          {results.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {results.tables.map((t) => (
        <ResultTable key={t.name} table={t} />
      ))}
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

const BASIS_COLUMNS = ['Kind', 'Subject', 'Value', 'Detail', 'Source note', 'Reference'] as const;

/** Screens whose basis rows come from the one chemical currently in their single-chemical form. */
const ONE_CHEMICAL_SENDERS: readonly ScreenKey[] = ['vadose', 'saturated'];

function BasisTable({ rows, label }: { rows: readonly BasisRow[]; label: string }) {
  const oneChemical = rows.some((r) => r.via !== null && ONE_CHEMICAL_SENDERS.includes(r.via));
  return (
    <>
      {oneChemical && (
        <p className="muted">
          Rows marked as coming from the vadose or saturated screen cover only the chemical
          currently selected on that screen. A multi-chemical modeled cleanup is not listed chemical
          by chemical, so the rows for its other chemicals are missing here.
        </p>
      )}
      <table className="result-table report-basis" aria-label={label}>
        <thead>
          <tr>
            {BASIS_COLUMNS.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${i}:${r.kind}:${r.subject}:${r.via ?? ''}`}>
              <td data-label="Kind">
                {KIND_LABEL[r.kind]}
                {r.via !== null && (
                  <span className="muted">
                    {' '}
                    (from {SCREEN_NAMES[r.via]}
                    {r.stale ? ', out of date' : ''})
                  </span>
                )}
              </td>
              <td data-label="Subject">{r.subject}</td>
              <td data-label="Value">{r.value}</td>
              <td data-label="Detail">{r.detail === '' ? 'none' : r.detail}</td>
              <td data-label="Source note">{r.note}</td>
              <td data-label="Reference">
                {r.referenceKey === null
                  ? 'none'
                  : `${r.referenceKey} (${r.referenceStatus ?? ''})`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function BasisSummary({ basis }: { basis: ProjectBasis }) {
  const s = basisSummary(basis);
  const kinds = (Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).filter(
    (k) => s.counts[k] > 0,
  );
  return (
    <section className="report-section report-basis-summary" aria-labelledby="rep-basis-summary">
      <h2 id="rep-basis-summary">Summary of what this run rests on</h2>
      {s.total === 0 ? (
        <p>
          No value in this run is an unverified default, an entry without a source or a user edit.
        </p>
      ) : (
        <>
          <ul>
            {kinds.map((k) => (
              <li key={k}>
                {KIND_LABEL[k]}: {s.counts[k]}
              </li>
            ))}
          </ul>
          {s.defaults.length > 0 && (
            <p>
              Unverified defaults used: {s.defaults.join('; ')}. The tables below give the note and
              the reference status of each.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function MethodIds({ ids, names }: { ids: readonly string[]; names: ReadonlyMap<string, string> }) {
  if (ids.length === 0) return null;
  return (
    <div className="report-method-ids">
      <h3>Methods run</h3>
      <ul>
        {ids.map((id) => {
          const n = publishedExampleCount(id);
          return (
            <li key={id}>
              {names.get(id) ?? id} <code>{id}</code>,{' '}
              <a href="#/validation">
                checked by {n} published {n === 1 ? 'example' : 'examples'}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ReportView({
  report,
  preparedBy,
  results = null,
  uncertainty = null,
  userValues = [],
  receptorEdits = [],
  userChemicals = [],
  staleFeeds = [],
  basis = null,
  basisFailed = false,
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
  /** Every value of the chemicals the user defined, each with its note. */
  userChemicals?: readonly UserChemicalRow[];
  /**
   * Feed slots (a feed for a chemical) whose sending inputs changed after they were sent; sections
   * computed from them say so, naming the chemical. A bare feed key stands for its untagged slot.
   */
  staleFeeds?: readonly (StaleSlot | StaleFeedKey)[];
  /** What the run rests on (see `runBasis`); null while it computes. */
  basis?: ProjectBasis | null;
  /** True when the databases the basis reads did not load, so it cannot be built. */
  basisFailed?: boolean;
}) {
  const { statement } = report;
  const methodNames = new Map(statement.methods.map((m) => [m.id, m.name]));
  return (
    <article className="report" aria-label="Project report">
      <header className="report-head">
        <h2 className="report-title">
          {report.title === '' ? 'model_flow project report' : report.title}
        </h2>
        <dl className="report-meta">
          <div>
            <dt>Generated</dt>
            <dd>{dateText(report.savedAt)}</dd>
          </div>
          <div>
            <dt>App version</dt>
            <dd>{report.createdWith}</dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd>{BUILD_COMMIT}</dd>
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

      {basis === null && report.sections.length > 0 && !basisFailed && (
        <p className="muted" role="status">
          The run basis is still being built. Until it appears, this report has no summary, no
          &quot;What this run rests on&quot; tables and no run basis CSV; wait before printing.
        </p>
      )}
      {basis === null && report.sections.length > 0 && basisFailed && (
        <p className="report-basis-failed" role="alert">
          <strong>The run basis could not be built</strong> because the chemical database did not
          load. This report has no summary, no &quot;What this run rests on&quot; tables and no run
          basis CSV, so it does not say which values are unverified defaults, unsourced entries or
          edits. Reload the page and open the report again.
        </p>
      )}
      {basis !== null && report.sections.length > 0 && <BasisSummary basis={basis} />}
      {basis !== null && report.sections.length > 0 && (
        <DownloadCsv tables={[basisCsvTable(report, basis)]} showLabel />
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
              {basis !== null && (
                <>
                  <h3>What this run rests on</h3>
                  {(basis.sections[sec.key] ?? []).length === 0 ? (
                    <p className="muted">
                      Nothing in this section is an unverified default, an entry without a source or
                      a user edit.
                    </p>
                  ) : (
                    <BasisTable rows={basis.sections[sec.key]!} label={`${sec.name}, run basis`} />
                  )}
                </>
              )}
              <MethodIds ids={sec.methodIds} names={methodNames} />
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
                  <td data-label="Value">
                    {r.label} ({r.unit})
                  </td>
                  <td data-label="Database value">
                    {r.dbValue === null ? 'none' : fmtTox(r.dbValue)}
                  </td>
                  <td data-label="Value used">
                    {r.userValue === null
                      ? 'not used (incomplete entry)'
                      : `${fmtTox(r.userValue)} (user-supplied)`}
                  </td>
                  <td data-label="Source note">{r.note === '' ? '(none)' : r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {userChemicals.length > 0 && (
        <section className="report-section" aria-labelledby="rep-user-chemicals">
          <h2 id="rep-user-chemicals">Chemicals defined by the user</h2>
          <p className="muted">
            These chemicals are not in the EPA tables. Every value is the user's own entry (source:
            user, User value (this project)) with the note given for it; none is a published value.
            A value with no usable number or no note is not used.
          </p>
          <table className="report-table report-user-values">
            <caption className="sr-only">Values of the chemicals defined by the user</caption>
            <thead>
              <tr>
                <th scope="col">Chemical</th>
                <th scope="col">Value</th>
                <th scope="col">Entered</th>
                <th scope="col">Source</th>
                <th scope="col">Source note</th>
              </tr>
            </thead>
            <tbody>
              {userChemicals.map((r) => (
                <tr key={`${r.chemical}:${r.cas}:${r.label}`}>
                  <th scope="row">
                    {r.chemical}
                    {r.cas !== '' ? ` (${r.cas})` : ''}
                  </th>
                  <td data-label="Value">
                    {r.label} ({r.unit})
                  </td>
                  <td data-label="Entered">
                    {r.applied ? r.text : `${r.text} (not used, incomplete entry)`}
                  </td>
                  <td data-label="Source">{r.source}</td>
                  <td data-label="Source note">{r.note === '' ? '(none)' : r.note}</td>
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
            is the user's own entry with the source note given for it, or "no note"; the presets
            were not changed.
          </p>
          <table className="report-table report-user-values">
            <caption className="sr-only">Receptor exposure factors supplied by the user</caption>
            <thead>
              <tr>
                <th scope="col">Receptor</th>
                <th scope="col">Factor</th>
                <th scope="col">Preset value</th>
                <th scope="col">Value used</th>
                <th scope="col">Source note</th>
              </tr>
            </thead>
            <tbody>
              {receptorEdits.map((r) => (
                <tr key={`${r.receptor}:${r.factor}`}>
                  <th scope="row">{r.receptor}</th>
                  <td data-label="Factor">
                    {r.factor} ({r.unit})
                  </td>
                  <td data-label="Preset value">{r.presetValue}</td>
                  <td data-label="Value used">{r.userValue} (user-supplied)</td>
                  <td data-label="Source note">{r.note === '' ? 'no note' : r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="muted report-scope">
        Inputs are shown as typed, in the units each screen labels. Results are the screen's own
        tables, computed again from these inputs and printed in full, with numbers shortened to six
        significant digits; the CSV download on each screen holds them at full precision. Each chart
        is followed by its data table. Uncertainty results are included only when asked for, and are
        repeated from the saved setup and seed.
      </p>

      <section className="report-section" aria-labelledby="rep-methods">
        <h2 id="rep-methods">Methods statement</h2>
        <p className="muted">
          What the methods are checked against is on the <a href="#/validation">validation page</a>.
        </p>
        {statement.methods.length === 0 ? (
          <p className="muted">No methods were run.</p>
        ) : (
          statement.methods.map((m) => (
            <section key={m.id} className="report-method" aria-label={m.name}>
              <h3>
                {m.name} <span className={`badge badge-${m.kind}`}>{MODEL_KIND_LABEL[m.kind]}</span>
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
  const staleFeeds = useStaleSlots();
  const [results, setResults] = useState<ProjectResults | null>(null);
  const [userValues, setUserValues] = useState<OverrideRow[]>([]);
  const receptorEdits = useMemo(() => receptorEditRows(project), [project]);
  const userChemicals = useMemo(() => userChemicalRowsOf(project), [project]);
  const [basis, setBasis] = useState<ProjectBasis | null>(null);
  const [basisFailed, setBasisFailed] = useState(false);
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
  useEffect(() => {
    if (results === null) return;
    let live = true;
    Promise.all([loadChemicalDb(), loadVaporChemicals(), loadCleanupProps()]).then(
      ([base, fate, cleanupProps]) => {
        if (!live) return;
        const chemicals = chemicalsOf(project);
        try {
          setBasisFailed(false);
          setBasis(
            runBasis({
              report,
              results,
              project,
              db: effectiveDb(base, overridesOf(project), chemicals),
              fateRows: withUserFateRows(fate, chemicals),
              cleanupProps,
              defaults: validation.unverified.defaults as BasisDefault[],
              stale: staleFeeds,
            }),
          );
        } catch {
          setBasis(null);
          setBasisFailed(true);
        }
      },
      () => {
        if (!live) return;
        setBasis(null);
        setBasisFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [project, report, results, staleFeeds]);
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
        userChemicals={userChemicals}
        receptorEdits={receptorEdits}
        staleFeeds={staleFeeds}
        basis={basis}
        basisFailed={basisFailed}
        uncertainty={<ReportUncertainty project={project} />}
      />
    </section>
  );
}
