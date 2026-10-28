import { useMemo, useState, useSyncExternalStore } from 'react';
import type { ReceptorRiskSummary } from '@model-flow/engine';
import { cleanupCsvTables, savedLevelsTable } from '../../cleanup/csv';
import { solubilityCeiling, type SolubilityCeiling } from '../../cleanup/solubility';
import { panelFeeds, sourceLevelCsvTables } from '../../cleanup/sourceLevelsCsv';
import { jobsOf } from '../../cleanup/surfaceSolved';
import { surfaceWaterSourceLevels } from '../../cleanup/surfaceWaterLevels';
import { useCleanupProps } from '../../cleanup/useCleanupProps';
import { useSurfaceSolves } from '../../cleanup/useSurfaceSolves';
import { vaporSourceLevels } from '../../cleanup/vaporLevels';
import { DownloadCsv, type CsvTable } from '../../export/DownloadCsv';
import { userCleanupProps } from '../../overrides/userChemicals';
import { useEffectiveDb, useOverrides } from '../../overrides/useOverrides';
import { getChemicals, getGuided, subscribeChemicals, subscribeGuided } from '../../project/store';
import { runRisk, type RiskOutcome } from '../../risk/compute';
import { barRows, fmtHi, fmtRisk, type BarRow, type Measure } from '../../risk/chartData';
import { riskCsvTables } from '../../risk/csv';
import { NOT_QUANTIFIED_TEXT, partialText, quantificationsOf } from '../../risk/quantified';
import { useChemicalDb } from '../../risk/useChemicalDb';
import { guidedHref } from '../../steps';
import type { SurfaceWaterFeed } from '../../surfaceWater/feed';
import { Seg } from '../../ui/controls';
import type { VaporRiskFeed } from '../../vapor/feeds';
import { chain, SOURCE_LABELS } from '../chain';
import { pathwayStatuses } from '../pathways';
import { buildGuidedInputs } from '../riskForm';
import { outputSlots } from '../slots';
import { guidedDirectCleanup, guidedKeptLevels, guidedSolvePlan, plainMessage } from '../solve';
import type { GuidedState } from '../state';
import type { OutputState } from '../status';
import { useGuidedChemicalData, useGuidedOutputCheck } from '../useOutputCheck';
import { DirectLevels, ModeledLevels, PlainList, SourceLevelTable } from './TargetsStep';
import { METHOD_LABEL, surfaceRow, vaporRow } from '../sourceRows';

/**
 * Step 6: the results tables of the project in one place. A picker chooses between the cleanup levels
 * (the source levels through the groundwater path kept by step 5, the vapor and surface water source
 * levels, and the levels in the media the receptors contact), the cancer risk, the hazard index, and the
 * summary of the inputs and the step 3d outputs. Each table downloads as CSV, and the printable report
 * is one link away. Nothing is solved here: a level step 5 has not kept, or kept for other inputs, says so.
 */

type View = 'cleanup' | 'cancer' | 'hazard' | 'summary';

const IDLE_SOLVE = { computing: false, progress: null, error: null } as const;

const OUTPUT_WORDS: Record<string, string> = {
  well: 'Groundwater at the well',
  vaporRisk: 'Indoor and outdoor air',
  surfaceWater: 'Surface water',
  household: 'Shower and irrigation water',
  produce: 'Homegrown produce',
};
const OUTPUT_STATE_WORDS: Record<OutputState, string> = {
  current: 'Current',
  stale: 'Out of date, run again',
  missing: 'Not run',
  blocked: 'Could not be produced from these inputs',
  unchecked: 'Checking',
};

export function ResultsStep() {
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const chemicals = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const result = useMemo(() => chain(guided.site), [guided.site]);
  const ready = chemicals.length > 0 && result.problems.length === 0;
  const [picked, setPicked] = useState<View | null>(null);
  const view: View = picked ?? (guided.targets.mode === 'cleanup' ? 'cleanup' : 'cancer');

  const heading = <h1 id="guided-results-heading">Results</h1>;
  if (chemicals.length === 0) {
    return (
      <section aria-labelledby="guided-results-heading" className="guided-targets">
        {heading}
        <p className="muted">
          Add at least one chemical in <a href={guidedHref('chemicals')}>step 1</a> first.
        </p>
      </section>
    );
  }
  if (!ready) {
    return (
      <section aria-labelledby="guided-results-heading" className="guided-targets">
        {heading}
        <p className="muted">
          Finish the site model in <a href={guidedHref('site')}>step 2</a> first. It decides where
          the concentrations come from.
        </p>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="guided-results-heading"
      className="guided-targets vadose risk cleanup"
    >
      {heading}
      <p className="muted">
        The tables below are worked out from the inputs of the earlier steps. Change an input and
        the tables follow it; a cleanup level step 5 has not solved for the current inputs says so.
      </p>
      <Seg
        legend="Table to show"
        name="guided-results-view"
        value={view}
        options={[
          { value: 'cleanup', label: 'Cleanup levels' },
          { value: 'cancer', label: 'Cancer risk' },
          { value: 'hazard', label: 'Hazard index' },
          { value: 'summary', label: 'Inputs and outputs' },
        ]}
        onChange={(v) => setPicked(v)}
      />
      {view === 'cleanup' && <CleanupView guided={guided} chemicals={chemicals} />}
      {(view === 'cancer' || view === 'hazard') && (
        <RiskView
          guided={guided}
          chemicals={chemicals}
          measure={view === 'cancer' ? 'risk' : 'hi'}
        />
      )}
      {view === 'summary' && <SummaryView guided={guided} chemicals={chemicals} />}
      <p className="guided-results-print">
        <a className="button" href="#/report">
          Print the report
        </a>
      </p>
    </section>
  );
}

/** The CSV tables of the guided results, which read no workbench feed, so none is marked out of date. */
const withoutFeeds = (tables: readonly CsvTable[]): CsvTable[] =>
  tables.map((t) => {
    const { feeds: _feeds, ...rest } = t;
    void _feeds;
    return rest;
  });

// ---------------------------------------------------------------- cleanup levels

function CleanupView(props: {
  guided: GuidedState;
  chemicals: readonly { id: string; name: string }[];
}) {
  const { guided } = props;
  const refs = useMemo(
    () => props.chemicals.map((c) => ({ id: c.id, name: c.name })),
    [props.chemicals],
  );
  const names = useMemo(() => Object.fromEntries(refs.map((c) => [c.id, c.name])), [refs]);
  const wellPath = chain(guided.site).outputs.includes('well');
  const { db: baseDb, error: dbError } = useChemicalDb();
  const [overrides] = useOverrides();
  const db = useEffectiveDb(baseDb, overrides);
  const data = useGuidedChemicalData(wellPath);
  const cleanupProps = useCleanupProps();
  const userProps = useMemo(() => userCleanupProps(props.chemicals), [props.chemicals]);
  const ceilingOf = (id: string): SolubilityCeiling | null =>
    solubilityCeiling('', id, cleanupProps, db?.edition ?? '', userProps);

  const plan = useMemo(
    () =>
      wellPath && data !== null && db !== null
        ? guidedSolvePlan(guided, { chemicals: data, db, overrides })
        : null,
    [wellPath, data, db, guided, overrides],
  );
  const direct = useMemo(
    () => (db !== null ? guidedDirectCleanup(guided, refs, db, overrides) : null),
    [db, guided, refs, overrides],
  );
  const outcome = direct?.outcome ?? null;
  const order: ('legacy' | 'modern')[] =
    guided.run.basis === 'legacy' ? ['legacy', 'modern'] : ['modern', 'legacy'];

  const vaporRows = useMemo(
    () =>
      outcome === null
        ? []
        : refs.flatMap((c) => {
            const f = outputSlots<VaporRiskFeed>(guided.outputs, 'vaporRisk').get(c.id);
            return f === undefined
              ? []
              : [{ id: c.id, name: c.name, rows: vaporSourceLevels(outcome, f) }];
          }),
    [outcome, guided.outputs, refs],
  );
  const csat = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of refs) {
      const v = db?.byId.get(c.id)?.tox.csat;
      if (v !== undefined) out[c.id] = v * 1e-6;
    }
    return out;
  }, [refs, db]);
  const surfaceFeeds = useMemo(
    () =>
      panelFeeds(
        outputSlots<SurfaceWaterFeed>(guided.outputs, 'surfaceWater'),
        refs.map((c) => c.id),
      ),
    [guided.outputs, refs],
  );
  const surfaceJobs = useMemo(
    () =>
      outcome === null
        ? []
        : jobsOf(
            surfaceFeeds.flatMap((f) =>
              surfaceWaterSourceLevels(outcome, f, names, undefined, csat),
            ),
          ),
    [outcome, surfaceFeeds, names, csat],
  );
  const surfaceSolved = useSurfaceSolves(surfaceJobs);
  const surfaceRows = useMemo(
    () =>
      outcome === null
        ? []
        : surfaceFeeds.flatMap((f) =>
            surfaceWaterSourceLevels(outcome, f, names, surfaceSolved.solves, csat),
          ),
    [outcome, surfaceFeeds, names, surfaceSolved.solves, csat],
  );

  const tables = useMemo((): CsvTable[] => {
    if (outcome === null || db === null) return [];
    const kept: CsvTable[] =
      plan === null || data === null
        ? []
        : plan.rows.flatMap((r) => {
            const k = guidedKeptLevels(guided, r.id, { chemicals: data, db, overrides }, plan);
            if (!k.current || k.levels === null) return [];
            const t = savedLevelsTable(k.levels, ceilingOf(r.id));
            return [{ ...t, name: `${t.name}-${r.id}`, label: `modeled level, ${r.name}` }];
          });
    return withoutFeeds([
      ...cleanupCsvTables(outcome, names, ceilingOf),
      ...kept,
      ...sourceLevelCsvTables(
        outcome,
        names,
        {
          vapor: outputSlots<VaporRiskFeed>(guided.outputs, 'vaporRisk'),
          surface: outputSlots<SurfaceWaterFeed>(guided.outputs, 'surfaceWater'),
        },
        { solves: surfaceSolved.solves, csat, ceilingOf },
      ),
    ]);
    // ceilingOf reads the same inputs as the dependencies below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, db, plan, data, guided, overrides, names, surfaceSolved, csat, cleanupProps]);

  return (
    <>
      {dbError !== null && (
        <p className="alert" role="alert">
          The chemical database did not load: {dbError}
        </p>
      )}
      {db === null && dbError === null && <p className="muted">Loading the chemical database...</p>}
      {wellPath && (
        <>
          <ModeledLevels
            guided={guided}
            plan={plan}
            solve={IDLE_SOLVE}
            names={names}
            ceilingOf={ceilingOf}
            data={data}
            db={db}
            overrides={overrides}
          />
          <p className="muted">
            Levels that read &quot;not solved yet&quot; or &quot;out of date&quot; are solved in{' '}
            <a href={guidedHref('targets')}>step 5</a>.
          </p>
        </>
      )}
      {vaporRows.length > 0 && (
        <SourceLevelTable
          title="Vapor source levels"
          caption="Source levels behind the indoor and outdoor air levels"
          intro="Each level is the source that alone just meets the indoor or outdoor air level below."
          rows={vaporRows.flatMap((v) => v.rows.map((r) => vaporRow(r, v.name, ceilingOf(v.id))))}
        />
      )}
      {surfaceRows.length > 0 && (
        <SourceLevelTable
          title="Surface water source levels"
          caption="Source levels behind the surface water levels"
          intro="Each level is the source concentration whose surface water result just meets the surface water level below."
          rows={surfaceRows.map((r) => surfaceRow(r, names, ceilingOf))}
          note={
            surfaceSolved.error !== null
              ? `The source levels could not be solved: ${surfaceSolved.error}`
              : surfaceSolved.computing
                ? 'Solving the surface water source levels in the background...'
                : null
          }
        />
      )}
      {direct !== null && (
        <DirectLevels direct={direct} names={names} ceilingOf={ceilingOf} order={order} />
      )}
      <DownloadCsv tables={tables} showLabel />
    </>
  );
}

// ---------------------------------------------------------------- cancer risk and hazard index

const MEASURE_TEXT: Record<Measure, { title: string; head: string; fmt: (x: number) => string }> = {
  risk: { title: 'Cancer risk', head: 'Cancer risk', fmt: fmtRisk },
  hi: { title: 'Hazard index', head: 'Hazard index', fmt: fmtHi },
};

/** The receptor and method rows of the stacked-bar data, shared with the risk screen's charts. */
function riskRows(outcome: RiskOutcome) {
  return (['legacy', 'modern'] as const).flatMap((method) => {
    const o = outcome[method];
    const summaries: ReceptorRiskSummary[] = o.ok ? o.result.summary.receptors : [];
    const quant = quantificationsOf(outcome, method);
    return summaries.map((summary, i) => ({
      label: `${summary.label}, ${METHOD_LABEL[method].toLowerCase()}`,
      summary,
      ...(quant[i] ? { quant: quant[i] } : {}),
    }));
  });
}

function MeasureTable(props: { title: string; by: string; measure: Measure; rows: BarRow[] }) {
  const { fmt, head } = MEASURE_TEXT[props.measure];
  return (
    <div className="cleanup-table-wrap">
      <table className="sat cleanup-table">
        <caption>{props.title}</caption>
        <thead>
          <tr>
            <th scope="col">Receptor and method</th>
            <th scope="col">{props.by}</th>
            <th scope="col">{head}</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.flatMap((r) => [
            ...r.segments.map((s) => (
              <tr key={`${r.label}|${s.id}`}>
                <th scope="row" data-label="Receptor and method">
                  {r.label}
                </th>
                <td data-label={props.by}>{s.label}</td>
                <td data-label={head}>{fmt(s.value)}</td>
              </tr>
            )),
            ...Object.entries(r.gaps).map(([label, why]) => (
              <tr key={`${r.label}|gap|${label}`}>
                <th scope="row" data-label="Receptor and method">
                  {r.label}
                </th>
                <td data-label={props.by}>{label}</td>
                <td data-label={head}>
                  <strong>{NOT_QUANTIFIED_TEXT}</strong>
                  <div className="muted">{why}</div>
                </td>
              </tr>
            )),
            <tr key={`${r.label}|total`} className="total">
              <th scope="row" data-label="Receptor and method">
                {r.label}
              </th>
              <td data-label={props.by}>
                <strong>Total</strong>
              </td>
              <td data-label={head}>
                {r.totalGap !== null ? (
                  <>
                    <strong>{NOT_QUANTIFIED_TEXT}</strong>
                    <div className="muted">{r.totalGap}</div>
                  </>
                ) : (
                  <>
                    <strong>{fmt(r.total)}</strong>
                    {r.partialOmits.length > 0 && (
                      <div className="muted">{partialText(r.partialOmits)}</div>
                    )}
                  </>
                )}
              </td>
            </tr>,
          ])}
        </tbody>
      </table>
    </div>
  );
}

function RiskView(props: {
  guided: GuidedState;
  chemicals: readonly { id: string; name: string }[];
  measure: Measure;
}) {
  const { guided, measure } = props;
  const refs = useMemo(
    () => props.chemicals.map((c) => ({ id: c.id, name: c.name })),
    [props.chemicals],
  );
  const names = useMemo(() => Object.fromEntries(refs.map((c) => [c.id, c.name])), [refs]);
  const { db: baseDb, error: dbError } = useChemicalDb();
  const [overrides] = useOverrides();
  const db = useEffectiveDb(baseDb, overrides);
  const risk = useMemo(() => {
    if (db === null) return null;
    const built = buildGuidedInputs(guided, refs, db, overrides);
    return { built, outcome: built.ok ? runRisk(built) : null };
  }, [db, guided, refs, overrides]);

  const rows = useMemo(() => (risk?.outcome ? riskRows(risk.outcome) : []), [risk]);
  const tables = useMemo(
    () => (risk?.outcome ? withoutFeeds(riskCsvTables(risk.outcome, names)) : []),
    [risk, names],
  );
  const { title } = MEASURE_TEXT[measure];

  return (
    <>
      {dbError !== null && (
        <p className="alert" role="alert">
          The chemical database did not load: {dbError}
        </p>
      )}
      {db === null && dbError === null && <p className="muted">Loading the chemical database...</p>}
      {risk !== null && !risk.built.ok && (
        <div className="alert" role="alert">
          <strong>Needed before the risk can be computed:</strong>
          <ul>
            {risk.built.errors.map((e) => (
              <li key={e}>{plainMessage(e, names)}</li>
            ))}
          </ul>
        </div>
      )}
      {risk?.outcome && (
        <section className="panel" aria-label={title}>
          <h2>{title}</h2>
          <p className="muted">
            {measure === 'risk'
              ? 'Incremental lifetime cancer risk for each receptor, by chemical and by pathway, from the legacy and the modern method.'
              : 'Hazard index for each receptor, by chemical and by pathway, from the legacy and the modern method. Modern life-stage hazard indices are never added.'}{' '}
            A value that cannot be worked out says why and is never read as zero.
          </p>
          <MeasureTable
            title={`${title} by chemical`}
            by="Chemical"
            measure={measure}
            rows={barRows(measure, 'chemical', rows, names)}
          />
          <MeasureTable
            title={`${title} by pathway`}
            by="Pathway"
            measure={measure}
            rows={barRows(measure, 'pathway', rows, names)}
          />
        </section>
      )}
      {risk?.outcome && (
        <PlainList
          title="Warnings and notes"
          items={[
            ...(risk.built.ok ? risk.built.notes : []),
            ...(['legacy', 'modern'] as const).flatMap((m) => {
              const o = risk.outcome![m];
              return o.ok
                ? o.result.warnings.map((w) => `${METHOD_LABEL[m]}: ${w.message}`)
                : [`${METHOD_LABEL[m]} method did not run: ${o.error}`];
            }),
          ]}
          names={names}
        />
      )}
      <DownloadCsv tables={tables} showLabel />
    </>
  );
}

// ---------------------------------------------------------------- inputs and outputs

function SummaryView(props: {
  guided: GuidedState;
  chemicals: readonly { id: string; name: string }[];
}) {
  const { guided, chemicals } = props;
  const outputCheck = useGuidedOutputCheck();
  const feeds = chain(guided.site).outputs;
  const inputRows = chemicals.flatMap((c) =>
    Object.entries(guided.sources[c.id]?.values ?? {}).flatMap(([medium, v]) =>
      v === undefined || v.value.trim() === ''
        ? []
        : [
            {
              chemical: c.name,
              medium: SOURCE_LABELS[medium as keyof typeof SOURCE_LABELS] ?? medium,
              value: v.value,
              unit: v.unit,
            },
          ],
    ),
  );
  const outputRows = feeds.flatMap((f) =>
    chemicals.map((c) => ({
      key: `${f}|${c.id}`,
      result: OUTPUT_WORDS[f] ?? 'Other result',
      chemical: c.name,
      state: OUTPUT_STATE_WORDS[outputCheck(f, c.id)],
    })),
  );
  const pathways = pathwayStatuses(guided);
  const on = pathways.filter((p) => p.available && p.on).map((p) => p.label);
  const off = pathways.filter((p) => !p.available || !p.on).map((p) => p.label);
  const t = guided.targets;
  const settings: [string, string][] = [
    ['What was worked out', t.mode === 'risk' ? 'Forward risk' : 'Cleanup levels'],
    ['Method checked against', guided.run.basis === 'legacy' ? 'Legacy' : 'Modern'],
    ['Pathways counted', on.length > 0 ? on.join(', ') : 'none'],
    ['Pathways left out', off.length > 0 ? off.join(', ') : 'none'],
    ...(t.mode === 'cleanup'
      ? ([
          ['Target cancer risk', t.targetRisk || 'not set'],
          ['Target hazard quotient', t.targetHq || 'not set'],
          [
            'Allocation',
            {
              individual: 'Each chemical alone',
              cumulative: 'All together',
              equal: 'Split equally',
            }[t.allocation],
          ],
        ] as [string, string][])
      : []),
  ];
  const tables = useMemo((): CsvTable[] => {
    return [
      {
        name: 'guided-inputs',
        label: 'values you entered',
        rows: inputRows,
        columns: [
          { key: 'chemical', header: 'chemical' },
          { key: 'medium', header: 'medium' },
          { key: 'value', header: 'value' },
          { key: 'unit', header: 'unit' },
        ],
      },
      {
        name: 'guided-outputs',
        label: 'what the run produced',
        rows: outputRows,
        columns: [
          { key: 'result', header: 'result' },
          { key: 'chemical', header: 'chemical' },
          { key: 'state', header: 'state' },
        ],
      },
    ];
    // rows derive from the project state read above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guided, chemicals, outputCheck]);

  return (
    <>
      <section className="panel" aria-label="Settings">
        <h2>Settings</h2>
        <dl className="guided-results-settings">
          {settings.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="panel" aria-label="Values you entered">
        <h2>Values you entered</h2>
        <div className="cleanup-table-wrap">
          <table className="sat cleanup-table">
            <caption className="sr-only">Values you entered in step 3b</caption>
            <thead>
              <tr>
                <th scope="col">Chemical</th>
                <th scope="col">Medium</th>
                <th scope="col">Value</th>
                <th scope="col">Unit</th>
              </tr>
            </thead>
            <tbody>
              {inputRows.map((r) => (
                <tr key={`${r.chemical}|${r.medium}`}>
                  <th scope="row" data-label="Chemical">
                    {r.chemical}
                  </th>
                  <td data-label="Medium">{r.medium}</td>
                  <td data-label="Value">{r.value}</td>
                  <td data-label="Unit">{r.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {outputRows.length > 0 && (
        <section className="panel" aria-label="What the step 3d run produced">
          <h2>What the step 3d run produced</h2>
          <div className="cleanup-table-wrap">
            <table className="sat cleanup-table">
              <caption className="sr-only">What the step 3d run produced</caption>
              <thead>
                <tr>
                  <th scope="col">Result</th>
                  <th scope="col">Chemical</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {outputRows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row" data-label="Result">
                      {r.result}
                    </th>
                    <td data-label="Chemical">{r.chemical}</td>
                    <td data-label="State">{r.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <DownloadCsv tables={tables} showLabel />
    </>
  );
}
