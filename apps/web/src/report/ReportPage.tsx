import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { currentProject, getChainHash, type StaleFeedKey, type StaleSlot } from '../project/store';
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
import {
  buildGuidedReport,
  guidedReceptorEditRows,
  guidedRunBasis,
  guidedSummary,
  hasGuidedOutputs,
  loadGuidedReportData,
  STEPS_NOT_RUN,
  type GuidedSummary,
} from './guidedSource';
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

function ChemicalBlocks({
  blocks,
  guided = false,
}: {
  blocks: readonly ChemicalBlock[];
  guided?: boolean;
}) {
  return (
    <div className="report-chemicals">
      <h4>
        {guided ? 'Results, one block per chemical' : 'Results sent on, one block per chemical'}
      </h4>
      <p className="muted">
        {guided
          ? 'Each block below is one chemical: the result the step 3d Run kept for it, as steps 4 to 6 use it, with the inputs its run used, then its full tables and charts.'
          : 'A screen runs one chemical at a time. Each block below is the result sent from this screen for one chemical, as the later screens used it, with the inputs it ran with.'}
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
            <table
              className="report-table"
              aria-label={
                guided ? `Inputs of the run, ${b.name}` : `Inputs of the sent run, ${b.name}`
              }
            >
              <thead>
                <tr>
                  <th scope="col">{guided ? 'Input of the run' : 'Input of the sent run'}</th>
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
          {b.charts !== undefined && (
            <ReportCharts charts={b.charts} level={5} title={`Charts, ${b.name}`} />
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * What the tables of a fate screen's section are: the run on the screen now, and what became of it. A
 * result sent from an earlier run of the screen is the block above, never these tables.
 */
function CurrentRunNote({ run }: { run: NonNullable<SectionResults['current']> }) {
  const changed = run.changedSince !== undefined;
  return (
    <p className="report-current-run">
      <strong>Run on the screen now: {run.chemical}.</strong>{' '}
      {run.sentTo !== null && `Its result was sent to ${run.sentTo}. `}
      {changed &&
        `The screen's inputs have changed since a result was sent to ${run.changedSince}, so the block above shows the run that was sent to it, not this one. `}
      {run.sentTo === null &&
        !changed &&
        'This run was not sent to another screen, so the exposure, risk and cleanup results do not use it. '}
      {changed && run.sentTo === null
        ? 'What follows in this section is the current run on the screen, which was not sent.'
        : changed
          ? `What follows in this section is the current run on the screen; it is not the run sent to ${run.changedSince}.`
          : 'What follows in this section is this run.'}
    </p>
  );
}

function ResultTables({ results, guided }: { results: SectionResults; guided: boolean }) {
  return (
    <>
      {results.methodBasis !== undefined && <MethodBasisNote basis={results.methodBasis} />}
      {results.chemicals !== undefined && (
        <ChemicalBlocks blocks={results.chemicals} guided={guided} />
      )}
      {results.current !== undefined && <CurrentRunNote run={results.current} />}
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

/** What the guided report prints before its sections: the site model, the run settings and the Run's notes. */
function GuidedSteps({ summary }: { summary: GuidedSummary }) {
  return (
    <section className="report-section" aria-labelledby="rep-guided">
      <h2 id="rep-guided">Guided steps</h2>
      <p className="muted">
        This report prints the results of the guided steps: the models the site model chose, run
        once for every chemical in step 3d, and the exposure and risk or cleanup levels of steps 4
        and 5.
      </p>
      {summary.paths.length > 0 && (
        <>
          <h3>Site model (step 2)</h3>
          <ul className="report-notes">
            {summary.paths.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      )}
      <h3>Run settings (step 3d)</h3>
      <table className="report-table" aria-label="Run settings">
        <tbody>
          {summary.settings.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Notes of the Run</h3>
      {summary.runNotes.length === 0 ? (
        <p className="muted">
          The Run counted no value as below a reporting limit or not detected, and every model ran.
        </p>
      ) : (
        summary.runNotes.map((n) => (
          <div key={n.chemical} className="report-run-notes">
            <h4>{n.chemical}</h4>
            <ul className="report-notes">
              {n.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
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
  guided = null,
  notice = null,
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
  /** The guided steps' summary, for a guided report; null for today's report. */
  guided?: GuidedSummary | null;
  /** One line printed under the header (today's report at `#/report` when the steps have not run). */
  notice?: string | null;
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
      {notice !== null && <p className="report-notice">{notice}</p>}
      {guided !== null && <GuidedSteps summary={guided} />}

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
                <ResultTables results={results[sec.key]!} guided={guided !== null} />
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

/**
 * The report page. At `#/report` (`source` 'auto') it prints the guided report when the project holds
 * results of the guided Run, and otherwise today's report with one line saying the steps have not been
 * run; `source` 'workbench' always prints today's report (`WorkbenchReportPage`).
 */
export function ReportPage({ source = 'auto' }: { source?: 'auto' | 'workbench' } = {}) {
  const project = useMemo(() => currentProject(), []);
  const guided = useMemo(() => source === 'auto' && hasGuidedOutputs(project), [source, project]);
  return guided ? (
    <GuidedReportPage project={project} />
  ) : (
    <WorkbenchReport project={project} notice={source === 'auto' ? STEPS_NOT_RUN : null} />
  );
}

/** Today's report, always: the model workbench screens and their sent results. */
export function WorkbenchReportPage() {
  return <ReportPage source="workbench" />;
}

function ReportTools({
  preparedBy,
  setPreparedBy,
}: {
  preparedBy: string;
  setPreparedBy: (v: string) => void;
}) {
  const id = useId();
  return (
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
  );
}

type Project = ReturnType<typeof currentProject>;

function WorkbenchReport({ project, notice }: { project: Project; notice: string | null }) {
  const [preparedBy, setPreparedBy] = useState('');
  const report = useMemo(() => buildReport(project), [project]);
  const staleFeeds = useStaleSlots();
  const [results, setResults] = useState<ProjectResults | null>(null);
  const [userValues, setUserValues] = useState<OverrideRow[]>([]);
  const receptorEdits = useMemo(() => receptorEditRows(project), [project]);
  const userChemicals = useMemo(() => userChemicalRowsOf(project), [project]);
  const [basis, setBasis] = useState<ProjectBasis | null>(null);
  const [basisFailed, setBasisFailed] = useState(false);
  useUserValues(project, setUserValues);
  useEffect(() => {
    let live = true;
    computeResults(project, { chainHash: getChainHash }).then(
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
      <ReportTools preparedBy={preparedBy} setPreparedBy={setPreparedBy} />
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
        notice={notice}
        uncertainty={<ReportUncertainty project={project} />}
      />
    </section>
  );
}

/** The project's toxicity overrides as report rows, loaded once. */
function useUserValues(project: Project, set: (rows: OverrideRow[]) => void): void {
  useEffect(() => {
    let live = true;
    if (Object.keys(overridesOf(project).toxicity).length === 0) return;
    loadOverrideRows(project).then(
      (r) => live && set(r),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [project, set]);
}

interface GuidedReportState {
  report: Report;
  summary: GuidedSummary;
  receptorEdits: ReceptorEditRow[];
  results: ProjectResults | null;
  basis: ProjectBasis | null;
  basisFailed: boolean;
}

/**
 * The guided report: the guided project's derived forms and step 3d outputs run through the report's own
 * code (`guidedSource.ts`). It computes off the first render, as today's report does.
 */
function GuidedReportPage({ project }: { project: Project }) {
  const [preparedBy, setPreparedBy] = useState('');
  const [state, setState] = useState<GuidedReportState | null>(null);
  const [failed, setFailed] = useState(false);
  const [userValues, setUserValues] = useState<OverrideRow[]>([]);
  const userChemicals = useMemo(() => userChemicalRowsOf(project), [project]);
  useUserValues(project, setUserValues);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const data = await loadGuidedReportData(project);
        if (!live) return;
        const report = buildGuidedReport(project, data);
        const base: GuidedReportState = {
          report,
          summary: guidedSummary(data),
          receptorEdits: guidedReceptorEditRows(project, data),
          results: null,
          basis: null,
          basisFailed: false,
        };
        setState(base);
        const results = await computeResults(project, {}, 'guided', data).catch(
          (): ProjectResults => ({}),
        );
        if (!live) return;
        setState({ ...base, results });
        try {
          const [fateRows, cleanupProps] = await Promise.all([
            loadVaporChemicals(),
            loadCleanupProps(),
          ]);
          if (!live) return;
          const basis = guidedRunBasis({
            report,
            results,
            project,
            data,
            fateRows,
            cleanupProps,
            defaults: validation.unverified.defaults as BasisDefault[],
          });
          setState({ ...base, results, basis });
        } catch {
          if (live) setState({ ...base, results, basisFailed: true });
        }
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [project]);
  return (
    <section aria-labelledby="report-heading">
      <ReportTools preparedBy={preparedBy} setPreparedBy={setPreparedBy} />
      {state === null ? (
        failed ? (
          <p className="report-basis-failed" role="alert">
            The guided report could not be prepared because the chemical database did not load.
            Reload the page and open the report again.
          </p>
        ) : (
          <p className="muted" role="status">
            Preparing the guided report...
          </p>
        )
      ) : (
        <ReportView
          report={state.report}
          preparedBy={preparedBy}
          results={state.results}
          userValues={userValues}
          userChemicals={userChemicals}
          receptorEdits={state.receptorEdits}
          basis={state.basis}
          basisFailed={state.basisFailed}
          guided={state.summary}
        />
      )}
    </section>
  );
}
