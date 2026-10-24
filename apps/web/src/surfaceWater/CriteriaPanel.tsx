import { useEffect, useId, useMemo, useState } from 'react';
import { DEFAULT_HARDNESS, type CriterionResult } from '@model-flow/engine';
import type { CsvRow } from '../export/csv';
import { formatConcentration } from '../transport/chartData';
import { Field, Seg } from '../ui/controls';
import type { SwResult } from './compute';
import {
  compareAll,
  coveredBy,
  coveredCsvRows,
  coveredText,
  coveringRows,
  criteriaCsvRows,
  sourceLine,
  toDisplay,
  type Compared,
  type Medium,
} from './criteriaCompare';
import {
  criteriaFor,
  searchCriteriaChemicals,
  type CoveredInfo,
  type CriteriaDb,
  type CriterionInfo,
} from './criteriaDb';
import {
  CRITERIA_SET_CHOICES,
  CRITERIA_SET_LABEL,
  CRITERIA_SET_MEDIA,
  isCriteriaSetChoice,
  type CriteriaSetChoice,
} from './criteriaSetChoice';
import { loadCriteriaDbFor } from './criteriaSets';

const sig = (v: number): string => formatConcentration(v);
const ratioText = (r: number): string =>
  !Number.isFinite(r) ? 'infinite' : r >= 100 ? r.toFixed(0) : r.toPrecision(3);

/** The database of a set choice, loaded on first use of that set (each set is a chunk of its own). */
function useCriteriaDb(set: CriteriaSetChoice): { db: CriteriaDb | null; error: string | null } {
  const [state, setState] = useState<{
    set: CriteriaSetChoice;
    db: CriteriaDb | null;
    error: string | null;
  }>({ set, db: null, error: null });
  useEffect(() => {
    let live = true;
    loadCriteriaDbFor(set).then(
      (db) => live && setState({ set, db, error: null }),
      (e: unknown) =>
        live && setState({ set, db: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [set]);
  // while another set loads, nothing of the previous one is shown as if it were this one
  return state.set === set ? { db: state.db, error: state.error } : { db: null, error: null };
}

function endpointLabel(endpoint: string): string {
  return endpoint.replace(/-/g, ' ');
}

/** What identifies a criterion on the screen: its basis in words, then the set, water type and source table. */
function CriterionCell(props: {
  criterion: CriterionResult['criterion'];
  info: CriterionInfo | undefined;
}) {
  const { criterion, info } = props;
  if (!criterion) return <>no criterion</>;
  if (!info) return <>{endpointLabel(criterion.endpoint)}</>;
  return (
    <>
      <span className="crit-basis">{info.basis}</span>
      <span className="crit-src">{sourceLine(info)}</span>
      {info.condition !== undefined && (
        <details className="crit-note">
          <summary>Note</summary>
          <span>{info.condition}</span>
        </details>
      )}
    </>
  );
}

function valueText(r: CriterionResult): string {
  const c = r.criterion;
  if (!c) return 'none';
  if (r.status === 'site-specific') return 'site-specific, not computed';
  if (r.status !== 'compared' || r.criterionValue === undefined) return 'no value';
  return c.medium === 'surfaceWater'
    ? `${sig(toDisplay(r.criterionValue))} ug/L`
    : `${sig(toDisplay(r.criterionValue))} mg/kg`;
}

function peakText(r: CriterionResult, medium: Medium): string {
  if (r.comparedConcentration === undefined) return '';
  return medium === 'surfaceWater'
    ? `${sig(toDisplay(r.comparedConcentration))} ug/L`
    : `${sig(toDisplay(r.comparedConcentration))} mg/kg`;
}

function ResultTable(props: {
  title: string;
  medium: Medium;
  compared: Compared;
  info: ReadonlyMap<string, CriterionInfo>;
}) {
  const { outcome } = props.compared;
  if (!outcome.ok) {
    return (
      <div className="alert" role="alert">
        {props.title}: {outcome.error}
      </div>
    );
  }
  const { results, warnings } = outcome.value;
  return (
    <div>
      <h3>{props.title}</h3>
      <div className="sat-wrap">
        <table className="sat crit">
          <caption className="sr-only">{props.title}, ratio of the peak to each criterion</caption>
          <thead>
            <tr>
              <th scope="col">Criterion</th>
              <th scope="col">Value</th>
              <th scope="col">Peak</th>
              <th scope="col">Ratio</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={r.criterion?.id ?? i} className={r.exceeds ? 'exceeds' : undefined}>
                <th scope="row">
                  <CriterionCell
                    criterion={r.criterion}
                    info={r.criterion ? props.info.get(r.criterion.id) : undefined}
                  />
                </th>
                <td>
                  {valueText(r)}
                  {r.criterion && props.info.get(r.criterion.id)?.printed !== undefined && (
                    <span className="crit-src">
                      printed as {props.info.get(r.criterion.id)?.printed}
                    </span>
                  )}
                </td>
                <td>{peakText(r, props.medium)}</td>
                <td>
                  {r.ratio === undefined ? (
                    ''
                  ) : (
                    <>
                      {ratioText(r.ratio)}{' '}
                      <strong className={r.exceeds ? 'flag on' : 'flag'}>
                        {r.exceeds ? 'exceeds' : 'within'}
                      </strong>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => (
            <li key={`${w.code}:${w.message}`}>
              <code>{w.code}</code>
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What the set prints for a chemical it points to a group row: the pointer and the covering row's values. */
function CoveredBlock(props: { db: CriteriaDb; pointer: CoveredInfo }) {
  const rows = coveringRows(props.db, props.pointer);
  return (
    <div>
      <p className="muted">{coveredText(props.pointer)}</p>
      <div className="sat-wrap">
        <table className="sat crit">
          <caption className="sr-only">
            {props.pointer.group.name}, the row that covers {props.pointer.name}
          </caption>
          <thead>
            <tr>
              <th scope="col">Covering row</th>
              <th scope="col">Criterion</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {props.pointer.group.name} (entry {props.pointer.group.entry})
                </td>
                <td>
                  <span className="crit-basis">{r.basis}</span>
                  <span className="crit-src">{[props.pointer.setLabel, r.source].join('; ')}</span>
                </td>
                <td>{r.value === undefined ? 'no value' : `${sig(r.value)} ug/L`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Compares the peak of the modelled surface water and sediment series with the criteria of a chosen set for a
 * chosen chemical: by default the EPA national recommended water quality criteria and the Region 4 sediment
 * benchmarks, or the Canadian, European, British, Australian and New Zealand sets and the MacDonald
 * consensus guidelines. Each set loads on first use, in a chunk of its own. The rows of the comparison are
 * handed up (`onRows`) so the screen's CSV carries the set, basis and source of every criterion.
 */
export function CriteriaPanel(props: {
  result: SwResult;
  foc: number | undefined;
  set: CriteriaSetChoice;
  onSetChange: (set: CriteriaSetChoice) => void;
  onRows?: (rows: CsvRow[]) => void;
}) {
  const { db, error } = useCriteriaDb(props.set);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [waterType, setWaterType] = useState<'fresh' | 'salt'>('fresh');
  const [hardness, setHardness] = useState(String(DEFAULT_HARDNESS));
  const listId = useId();
  const setId = useId();

  const hits = useMemo(() => (db ? searchCriteriaChemicals(db, query, 12) : []), [db, query]);
  const h = hardness.trim() === '' ? undefined : Number(hardness);
  const hardnessBad = h !== undefined && !(Number.isFinite(h) && h > 0);
  // the chosen chemical as this set knows it; a set that does not name it has nothing to compare
  const inSet = db && chosen ? db.chemicals.find((c) => c.id === chosen.id) : undefined;
  const compared = useMemo(
    () =>
      db && chosen && inSet && !hardnessBad
        ? compareAll(db, inSet, props.result, { waterType, hardness: h, foc: props.foc })
        : [],
    [db, chosen, inSet, props.result, waterType, h, hardnessBad, props.foc],
  );
  // a chemical the set prints no row for because its text points it to a group row (eu2026 PFOS)
  const covered = db && chosen && !inSet ? coveredBy(db, chosen.id) : undefined;
  const { onRows } = props;
  useEffect(() => {
    onRows?.(
      db && chosen
        ? covered
          ? coveredCsvRows(db, chosen, covered)
          : criteriaCsvRows(compared, db.info, chosen)
        : [],
    );
  }, [onRows, db, chosen, compared, covered]);
  const hasMetals =
    db && chosen ? criteriaFor(db, chosen.id, 'surfaceWater').some((c) => c.hardness) : false;

  return (
    <section className="panel criteria" aria-label="Comparison with criteria">
      <h2>Comparison with criteria</h2>
      <p className="muted">
        The peak of each series is compared with every criterion of the chemical in the set you
        choose. Each value is shown with its basis, its medium and the table it was read from.
        Ratios are per criterion and are never summed. The peak is never below the one-hour,
        four-day or lifetime averages the criteria are written for, so this is a conservative
        screen.
      </p>
      <label className="field" htmlFor={setId}>
        <span className="field-label">Criteria set</span>
        <select
          id={setId}
          value={props.set}
          onChange={(e) => {
            const v = e.target.value;
            if (isCriteriaSetChoice(v)) props.onSetChange(v);
          }}
        >
          {CRITERIA_SET_CHOICES.map((c) => (
            <option key={c} value={c}>
              {CRITERIA_SET_LABEL[c]}
            </option>
          ))}
        </select>
        <small>Holds {CRITERIA_SET_MEDIA[props.set]}. The default is the United States pair.</small>
      </label>
      <label className="field">
        <span className="field-label">Find a chemical for the criteria (name or CAS number)</span>
        <input
          type="text"
          inputMode="search"
          autoComplete="off"
          value={query}
          disabled={!db}
          placeholder={db ? 'zinc, 71-43-2' : 'Loading the criteria...'}
          aria-controls={listId}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="muted" role="status">
        {error
          ? `The criteria could not be loaded: ${error}`
          : db
            ? `${db.chemicals.length} chemicals with criteria in this set (${db.sources.map((x) => `${x.label}, ${x.edition}`).join('; ')}).`
            : 'Loading the criteria...'}
      </p>
      <ul className="hits" id={listId}>
        {hits.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="btn hit"
              onClick={() => {
                setChosen({ id: c.id, name: c.name });
                setQuery('');
              }}
            >
              <span className="hit-name">
                Compare {c.name} ({c.id})
              </span>
              <span className="hit-tox">
                {c.coveredBy !== undefined
                  ? `covered by ${c.coveredBy}`
                  : [c.hasSurfaceWater && 'water criteria', c.hasSediment && 'sediment benchmarks']
                      .filter(Boolean)
                      .join(', ')}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {chosen && db && (
        <div>
          <p>
            <strong>{chosen.name}</strong> ({chosen.id})
          </p>
          <Seg
            legend="Water type of the criteria"
            name="criteriaWater"
            value={waterType}
            onChange={setWaterType}
            options={[
              { value: 'fresh', label: 'Freshwater' },
              { value: 'salt', label: 'Saltwater' },
            ]}
          />
          <div className="fields">
            <Field
              label="Hardness (mg/L as CaCO3)"
              value={hardness}
              onChange={setHardness}
              hint={
                hasMetals
                  ? 'Sets the freshwater criteria of this metal.'
                  : 'Used by the hardness-dependent metals only. Blank uses 100.'
              }
            />
          </div>
          {hardnessBad && (
            <div className="alert" role="alert">
              Hardness must be a positive number.
            </div>
          )}
          {covered && db && <CoveredBlock db={db} pointer={covered} />}
          {!inSet && !covered && (
            <p className="muted">
              This set has no criterion for {chosen.name}. Choose another set or another chemical.
            </p>
          )}
          {inSet && compared.length === 0 && !hardnessBad && (
            <p className="muted">No series to compare.</p>
          )}
          {compared.map((c) => (
            <ResultTable
              key={`${c.method}:${c.medium}`}
              compared={c}
              medium={c.medium}
              info={db.info}
              title={`${c.method === 'legacy' ? 'Legacy' : 'Modern'} ${c.medium === 'surfaceWater' ? 'surface water' : 'sediment'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
