import { useEffect, useId, useMemo, useState } from 'react';
import {
  DEFAULT_HARDNESS,
  compareToCriteria,
  type CompareResult,
  type CriterionResult,
} from '@model-flow/engine';
import { formatConcentration } from '../transport/chartData';
import { Field, Seg } from '../ui/controls';
import type { SwResult } from './compute';
import {
  criteriaFor,
  loadCriteriaDb,
  searchCriteriaChemicals,
  type CriteriaChemical,
  type CriteriaDb,
} from './criteriaDb';

const sig = (v: number): string => formatConcentration(v);
const ratioText = (r: number): string =>
  !Number.isFinite(r) ? 'infinite' : r >= 100 ? r.toFixed(0) : r.toPrecision(3);

type Medium = 'surfaceWater' | 'sediment';
type Method = 'legacy' | 'modern';

interface Compared {
  method: Method;
  medium: Medium;
  outcome: { ok: true; value: CompareResult } | { ok: false; error: string };
}

function useCriteriaDb(): { db: CriteriaDb | null; error: string | null } {
  const [state, setState] = useState<{ db: CriteriaDb | null; error: string | null }>({
    db: null,
    error: null,
  });
  useEffect(() => {
    let live = true;
    loadCriteriaDb().then(
      (db) => live && setState({ db, error: null }),
      (e: unknown) =>
        live && setState({ db: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

function endpointLabel(endpoint: string): string {
  return endpoint.replace(/-/g, ' ');
}

function valueText(r: CriterionResult): string {
  const c = r.criterion;
  if (!c) return 'none';
  if (r.status === 'site-specific') return 'site-specific, not computed';
  if (r.status !== 'compared' || r.criterionValue === undefined) return 'no value';
  return c.medium === 'surfaceWater'
    ? `${sig(r.criterionValue * 1e6)} ug/L`
    : `${sig(r.criterionValue * 1e6)} mg/kg`;
}

function peakText(r: CriterionResult, medium: Medium): string {
  if (r.comparedConcentration === undefined) return '';
  return medium === 'surfaceWater'
    ? `${sig(r.comparedConcentration * 1e6)} ug/L`
    : `${sig(r.comparedConcentration * 1e6)} mg/kg`;
}

function ResultTable(props: { title: string; medium: Medium; compared: Compared }) {
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
                  {r.criterion ? endpointLabel(r.criterion.endpoint) : 'no criterion'}
                </th>
                <td>{valueText(r)}</td>
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

function compareAll(
  db: CriteriaDb,
  chemical: CriteriaChemical,
  result: SwResult,
  waterType: 'fresh' | 'salt',
  hardness: number | undefined,
  foc: number | undefined,
): Compared[] {
  const out: Compared[] = [];
  const run = (method: Method, medium: Medium, series: number[] | undefined): void => {
    if (!series || series.length === 0) return;
    try {
      const value = compareToCriteria({
        medium,
        chemicalId: chemical.id,
        series,
        criteria: criteriaFor(db, chemical.id, medium),
        waterType,
        ...(hardness !== undefined ? { hardness } : {}),
        ...(foc !== undefined ? { fractionOrganicCarbon: foc } : {}),
      });
      out.push({ method, medium, outcome: { ok: true, value } });
    } catch (e) {
      out.push({
        method,
        medium,
        outcome: { ok: false, error: e instanceof Error ? e.message : String(e) },
      });
    }
  };
  for (const method of ['legacy', 'modern'] as const) {
    run(method, 'surfaceWater', result[method].surfaceWater);
    if (chemical.hasSediment) run(method, 'sediment', result[method].sediment.concentrations);
  }
  return out;
}

/**
 * Compares the peak of the modelled surface water and sediment series with the national recommended
 * water quality criteria and the Region 4 sediment benchmarks for a chosen chemical. The criteria files
 * load on first use, in chunks of their own.
 */
export function CriteriaPanel(props: { result: SwResult; foc: number | undefined }) {
  const { db, error } = useCriteriaDb();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<CriteriaChemical | null>(null);
  const [waterType, setWaterType] = useState<'fresh' | 'salt'>('fresh');
  const [hardness, setHardness] = useState(String(DEFAULT_HARDNESS));
  const listId = useId();

  const hits = useMemo(() => (db ? searchCriteriaChemicals(db, query, 12) : []), [db, query]);
  const h = hardness.trim() === '' ? undefined : Number(hardness);
  const hardnessBad = h !== undefined && !(Number.isFinite(h) && h > 0);
  const compared = useMemo(
    () =>
      db && chosen && !hardnessBad
        ? compareAll(db, chosen, props.result, waterType, h, props.foc)
        : [],
    [db, chosen, props.result, waterType, h, hardnessBad, props.foc],
  );
  const hasMetals =
    db && chosen ? criteriaFor(db, chosen.id, 'surfaceWater').some((c) => c.hardness) : false;

  return (
    <section className="panel criteria" aria-label="Comparison with criteria">
      <h2>Comparison with criteria</h2>
      <p className="muted">
        The peak of each series is compared with every criterion of the chemical: EPA national
        recommended water quality criteria (aquatic life and human health) and EPA Region 4 sediment
        benchmarks. Ratios are per criterion and are never summed. The peak is never below the
        one-hour, four-day or lifetime averages the criteria are written for, so this is a
        conservative screen.
      </p>
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
            ? `${db.chemicals.length} chemicals with criteria (national recommended criteria page of ${db.nrwqcEdition}; sediment benchmarks of ${db.sedimentEdition}).`
            : 'Loading the criteria...'}
      </p>
      <ul className="hits" id={listId}>
        {hits.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="btn hit"
              onClick={() => {
                setChosen(c);
                setQuery('');
              }}
            >
              <span className="hit-name">
                Compare {c.name} ({c.id})
              </span>
              <span className="hit-tox">
                {[c.hasSurfaceWater && 'water criteria', c.hasSediment && 'sediment benchmarks']
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
          {compared.length === 0 && !hardnessBad && <p className="muted">No series to compare.</p>}
          {compared.map((c) => (
            <ResultTable
              key={`${c.method}:${c.medium}`}
              compared={c}
              medium={c.medium}
              title={`${c.method === 'legacy' ? 'Legacy' : 'Modern'} ${c.medium === 'surfaceWater' ? 'surface water' : 'sediment'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
