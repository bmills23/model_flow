import { useMemo, useSyncExternalStore } from 'react';
import { fmtSource } from '../../cleanup/format';
import { usableMcl } from '../../cleanup/mcl';
import { LevelsSection, NotQuantified as CleanupNotQuantified } from '../../cleanup/Results';
import {
  solubilityCeiling,
  solubilityFlag,
  type SolubilityCeiling,
} from '../../cleanup/solubility';
import { panelFeeds } from '../../cleanup/sourceLevelsCsv';
import { jobsOf } from '../../cleanup/surfaceSolved';
import { surfaceWaterSourceLevels } from '../../cleanup/surfaceWaterLevels';
import { useCleanupProps } from '../../cleanup/useCleanupProps';
import { useSurfaceSolves } from '../../cleanup/useSurfaceSolves';
import { vaporSourceLevels } from '../../cleanup/vaporLevels';
import type { OverridesState } from '../../overrides/model';
import { userCleanupProps } from '../../overrides/userChemicals';
import { useEffectiveDb, useOverrides } from '../../overrides/useOverrides';
import {
  getChemicals,
  getGuided,
  setGuided,
  subscribeChemicals,
  subscribeGuided,
} from '../../project/store';
import { runRisk } from '../../risk/compute';
import { Comparison, NotQuantified as RiskNotQuantified } from '../../risk/Results';
import { useChemicalDb } from '../../risk/useChemicalDb';
import type { ChemicalDb } from '../../risk/chemicalDb';
import { guidedHref } from '../../steps';
import type { SurfaceWaterFeed } from '../../surfaceWater/feed';
import { Field, Seg } from '../../ui/controls';
import type { VaporRiskFeed } from '../../vapor/feeds';
import { chain } from '../chain';
import { METHOD_LABEL, surfaceRow, vaporRow, type SourceRow } from '../sourceRows';
import type { GuidedKeptLevel } from '../levels';
import { buildGuidedInputs } from '../riskForm';
import { outputSlots } from '../slots';
import {
  guidedDirectCleanup,
  guidedKeptLevels,
  guidedSolvePlan,
  levelReason,
  plainMessage,
  type GuidedSolvePlan,
  type GuidedSolveRow,
} from '../solve';
import type { GuidedAllocation, GuidedStandard, GuidedState, GuidedTargets } from '../state';
import { useGuidedSolve, type GuidedSolveState } from '../useGuidedSolve';
import { useGuidedChemicalData } from '../useOutputCheck';

/**
 * Step 5: forward risk from the measured or modeled concentrations (live), or cleanup levels. Cleanup
 * targets are a target cancer risk and hazard quotient, each chemical alone, all together keeping the
 * step 3b ratios, or split equally; with a well, a chemical can meet a federal MCL or a state standard
 * (entered with its source) at the well instead. Levels through the well path are solved by re-running
 * the step 3 models per chemical and kept with the project; vapor and surface water source levels are
 * read off the levels in the medium contacted, as the workbench does.
 */

type Method = 'legacy' | 'modern';

const ALLOCATION_OPTIONS: readonly { value: GuidedAllocation; label: string }[] = [
  { value: 'individual', label: 'Each chemical alone' },
  { value: 'cumulative', label: 'All chemicals together, keeping their ratios' },
  { value: 'equal', label: 'Target split equally' },
];
const ALLOCATION_TEXT: Record<GuidedAllocation, string> = {
  individual: 'Each chemical alone meets the targets, as the screening level tables do.',
  cumulative:
    'One common scale keeps the ratios of the step 3b concentrations and makes the summed cancer risk and hazard index meet the targets.',
  equal:
    'Each target is divided equally among the chemicals that carry it, so the levels together stay inside it.',
};
const TARGET_TEXT: Record<GuidedStandard['kind'], string> = {
  risk: 'Risk and hazard targets',
  mcl: 'Federal MCL at the well',
  state: 'State standard at the well',
};
const ENDPOINT_TEXT: Record<string, string> = {
  cancer: 'cancer',
  noncancer: 'noncancer',
  concentration: 'water standard',
};
const STANDARD_UNITS = ['ug/L', 'mg/L'] as const;

/** A source level in its unit: mg/L for a groundwater source, mg/kg for soil. */
const unitOf = (k: GuidedKeptLevel): { unit: string; fromSi: number } =>
  k.medium === 'groundwater' ? { unit: 'mg/L', fromSi: 1e3 } : { unit: 'mg/kg', fromSi: 1e6 };

export function TargetsStep() {
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const chemicals = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const result = useMemo(() => chain(guided.site), [guided.site]);
  const ready = chemicals.length > 0 && result.problems.length === 0;
  const mode = guided.targets.mode;
  const cleanupOn = ready && mode === 'cleanup';
  const wellPath = result.outputs.includes('well');

  const { db: baseDb, error: dbError } = useChemicalDb();
  const [overrides] = useOverrides();
  const db = useEffectiveDb(baseDb, overrides);
  const data = useGuidedChemicalData(cleanupOn && wellPath);
  const cleanupProps = useCleanupProps();
  const userProps = useMemo(() => userCleanupProps(chemicals), [chemicals]);

  const refs = useMemo(() => chemicals.map((c) => ({ id: c.id, name: c.name })), [chemicals]);
  const names = useMemo(() => Object.fromEntries(refs.map((c) => [c.id, c.name])), [refs]);
  const ceilingOf = (id: string): SolubilityCeiling | null =>
    solubilityCeiling('', id, cleanupProps, db?.edition ?? '', userProps);

  const risk = useMemo(() => {
    if (!ready || mode !== 'risk' || db === null) return null;
    const built = buildGuidedInputs(guided, refs, db, overrides);
    return { built, outcome: built.ok ? runRisk(built) : null };
  }, [ready, mode, db, guided, refs, overrides]);

  const plan = useMemo(
    () =>
      cleanupOn && wellPath && data !== null && db !== null
        ? guidedSolvePlan(guided, { chemicals: data, db, overrides })
        : null,
    [cleanupOn, wellPath, data, db, guided, overrides],
  );
  const solve = useGuidedSolve(plan);
  const direct = useMemo(
    () => (cleanupOn && db !== null ? guidedDirectCleanup(guided, refs, db, overrides) : null),
    [cleanupOn, db, guided, refs, overrides],
  );
  const outcome = direct?.outcome ?? null;

  // the source levels behind the indoor and outdoor air levels, per chemical with a vapor result
  const vaporRows = useMemo(() => {
    if (outcome === null) return [];
    const slots = outputSlots<VaporRiskFeed>(guided.outputs, 'vaporRisk');
    return refs.flatMap((c) => {
      const f = slots.get(c.id);
      return f === undefined
        ? []
        : [{ id: c.id, name: c.name, rows: vaporSourceLevels(outcome, f) }];
    });
  }, [outcome, guided.outputs, refs]);

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

  const heading = <h1 id="guided-targets-heading">Risk or cleanup levels</h1>;
  if (chemicals.length === 0) {
    return (
      <section aria-labelledby="guided-targets-heading" className="guided-targets">
        {heading}
        <p className="muted">
          Add at least one chemical in <a href={guidedHref('chemicals')}>step 1</a> first.
        </p>
      </section>
    );
  }
  if (result.problems.length > 0) {
    return (
      <section aria-labelledby="guided-targets-heading" className="guided-targets">
        {heading}
        <p className="muted">
          Finish the site model in <a href={guidedHref('site')}>step 2</a> first. It decides where
          the concentrations come from.
        </p>
      </section>
    );
  }

  const setTargets = (patch: Partial<GuidedTargets>): void => {
    const g = getGuided();
    setGuided({ ...g, targets: { ...g.targets, ...patch } });
  };
  const measured = guided.site.basis === 'measured';
  const order: Method[] =
    guided.run.basis === 'legacy' ? ['legacy', 'modern'] : ['modern', 'legacy'];

  return (
    <section
      aria-labelledby="guided-targets-heading"
      className="guided-targets vadose risk cleanup"
    >
      {heading}
      <p className="muted">
        {measured
          ? 'Work from the concentrations you entered at the receptor in step 3b.'
          : 'Work from the concentrations the step 3d Run carried to the receptor.'}
      </p>
      <Seg
        legend="What to work out"
        name="guided-targets-mode"
        value={mode}
        options={[
          { value: 'risk', label: 'Forward risk' },
          { value: 'cleanup', label: 'Cleanup levels' },
        ]}
        onChange={(v) => setTargets({ mode: v })}
      />
      {dbError !== null && (
        <p className="alert" role="alert">
          The chemical database did not load: {dbError}
        </p>
      )}
      {db === null && dbError === null && <p className="muted">Loading the chemical database...</p>}

      {mode === 'risk' && risk !== null && (
        <RiskView risk={risk} names={names} measured={measured} />
      )}

      {mode === 'cleanup' && (
        <>
          <TargetsPanel guided={guided} setTargets={setTargets} />
          {wellPath && (
            <StandardsPanel guided={guided} chemicals={refs} db={db} setTargets={setTargets} />
          )}
          {wellPath && (
            <ModeledLevels
              guided={guided}
              plan={plan}
              solve={solve}
              names={names}
              ceilingOf={ceilingOf}
              data={data}
              db={db}
              overrides={overrides}
            />
          )}
          {vaporRows.length > 0 && (
            <SourceLevelTable
              title="Vapor source levels"
              caption="Source levels behind the indoor and outdoor air levels"
              intro="Each level is the source that alone just meets the indoor or outdoor air level below. Where the vapor model is proportional to its source it is that air level over the model's air-to-source ratio; where it is not, it is solved against the vapor model, up to the solubility, saturation or residual-phase limit."
              rows={vaporRows.flatMap((v) =>
                v.rows.map((r) => vaporRow(r, v.name, ceilingOf(v.id))),
              )}
            />
          )}
          {surfaceRows.length > 0 && (
            <SourceLevelTable
              title="Surface water source levels"
              caption="Source levels behind the surface water levels"
              intro="Each level is the source concentration whose surface water result just meets the surface water level below: the level over the run's ratio where the stream model is proportional to its source, else solved against it in the background."
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
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- forward risk

function RiskView(props: {
  risk: { built: ReturnType<typeof buildGuidedInputs>; outcome: ReturnType<typeof runRisk> | null };
  names: Record<string, string>;
  measured: boolean;
}) {
  const { built, outcome } = props.risk;
  if (!built.ok) {
    return (
      <div className="alert" role="alert">
        <strong>Needed before the risk can be computed:</strong>
        <ul>
          {built.errors.map((e) => (
            <li key={e}>{plainMessage(e, props.names)}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (outcome === null) return null;
  const warnings = [
    ...built.notes,
    ...(['legacy', 'modern'] as const).flatMap((m) => {
      const o = outcome[m];
      return o.ok
        ? o.result.warnings.map((w) => `${METHOD_LABEL[m]}: ${w.message}`)
        : [`${METHOD_LABEL[m]} method did not run: ${o.error}`];
    }),
  ];
  return (
    <>
      <Comparison outcome={outcome} additive={built.legacy.additive === true} />
      <RiskNotQuantified outcome={outcome} names={props.names} />
      <PlainList title="Warnings and notes" items={warnings} names={props.names} />
    </>
  );
}

// ---------------------------------------------------------------- targets

function TargetsPanel(props: {
  guided: GuidedState;
  setTargets: (patch: Partial<GuidedTargets>) => void;
}) {
  const { guided, setTargets } = props;
  return (
    <section className="panel" aria-label="Targets">
      <h2>Targets</h2>
      <div className="guided-targets-fields">
        <Field
          label="Target cancer risk"
          value={guided.targets.targetRisk}
          onChange={(v) => setTargets({ targetRisk: v })}
          placeholder="1e-6"
          hint="Blank uses one in a million (1e-6)."
        />
        <Field
          label="Target hazard quotient"
          value={guided.targets.targetHq}
          onChange={(v) => setTargets({ targetHq: v })}
          placeholder="1"
          hint="Blank uses 1."
        />
      </div>
      <Seg
        legend="Targets per chemical or for all chemicals together"
        name="guided-targets-allocation"
        value={guided.targets.allocation}
        options={ALLOCATION_OPTIONS}
        onChange={(v) => setTargets({ allocation: v })}
      />
      <p className="muted">{ALLOCATION_TEXT[guided.targets.allocation]}</p>
    </section>
  );
}

function mclText(db: ChemicalDb | null, id: string): string {
  const tox = db?.byId.get(id)?.tox;
  if (tox === undefined) return 'Federal MCL';
  const m = usableMcl(tox);
  if (m.unusable !== undefined) return `Federal MCL (none usable: ${m.unusable})`;
  if (tox.mcl === undefined) return 'Federal MCL (the database has none for this chemical)';
  return `Federal MCL (${tox.mcl} ug/L${m.group ? ', a group value' : ''})`;
}

function StandardsPanel(props: {
  guided: GuidedState;
  chemicals: readonly { id: string; name: string }[];
  db: ChemicalDb | null;
  setTargets: (patch: Partial<GuidedTargets>) => void;
}) {
  const { guided, chemicals, db, setTargets } = props;
  const put = (id: string, next: GuidedStandard): void =>
    setTargets({ standards: { ...getGuided().targets.standards, [id]: next } });
  return (
    <section className="panel" aria-label="Water standards at the well">
      <h2>Water standards at the well</h2>
      <p className="muted">
        A chemical can be solved to meet a concentration at the well instead of the risk targets:
        the federal maximum contaminant level (MCL), or a state standard you enter with its source.
      </p>
      {chemicals.map((c) => {
        const std: GuidedStandard = guided.targets.standards[c.id] ?? {
          kind: 'risk',
          value: '',
          unit: 'ug/L',
          source: '',
        };
        return (
          <fieldset className="guided-targets-std" key={c.id}>
            <legend>Water standard for {c.name}</legend>
            <Seg
              legend="Solve to meet"
              name={`guided-std-${c.id}`}
              value={std.kind}
              options={[
                { value: 'risk', label: 'Risk and hazard targets' },
                { value: 'mcl', label: mclText(db, c.id) },
                { value: 'state', label: 'State standard' },
              ]}
              onChange={(kind) => put(c.id, { ...std, kind, unit: std.unit || 'ug/L' })}
            />
            {std.kind === 'state' && (
              <div className="guided-targets-fields">
                <Field
                  label="State standard value"
                  value={std.value}
                  onChange={(value) => put(c.id, { ...std, value })}
                />
                <label className="field">
                  <span className="field-label">Unit of the state standard</span>
                  <select
                    className="u-select"
                    value={std.unit}
                    onChange={(e) => put(c.id, { ...std, unit: e.target.value })}
                  >
                    {STANDARD_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field guided-targets-source">
                  <span className="field-label">Source of the standard</span>
                  <input
                    type="text"
                    value={std.source}
                    placeholder="for example the state rule and its table"
                    onChange={(e) => put(c.id, { ...std, source: e.target.value })}
                  />
                </label>
                {std.source.trim() === '' && (
                  <p className="muted guided-targets-need">
                    Name the source of this standard so the report can cite it.
                  </p>
                )}
              </div>
            )}
          </fieldset>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------- the levels through the well path

export function ModeledLevels(props: {
  guided: GuidedState;
  plan: GuidedSolvePlan | null;
  solve: GuidedSolveState;
  names: Record<string, string>;
  ceilingOf: (id: string) => SolubilityCeiling | null;
  data: Parameters<typeof guidedSolvePlan>[1]['chemicals'] | null;
  db: ChemicalDb | null;
  overrides: OverridesState;
}) {
  const { guided, plan, solve, names, ceilingOf } = props;
  if (plan === null || props.data === null || props.db === null) {
    return (
      <section className="panel" aria-label="Source levels through the groundwater path">
        <h2>Source levels through the groundwater path</h2>
        <p className="muted">Loading the chemical data...</p>
      </section>
    );
  }
  const ctx = { chemicals: props.data, db: props.db, overrides: props.overrides };
  const reads = plan.rows.map((r) => ({ row: r, kept: guidedKeptLevels(guided, r.id, ctx, plan) }));
  const unbuilt = plan.rows.filter((r) => !r.result.ok);
  const notes = [
    ...new Set(reads.flatMap(({ kept }) => (kept.current ? (kept.levels?.notes ?? []) : []))),
  ];
  const warnings = [
    ...new Set(
      reads.flatMap(({ kept }) =>
        kept.current && kept.levels !== null
          ? (['legacy', 'modern'] as const).flatMap((m) => {
              const lv = kept.levels!.methods[m];
              return lv?.ok
                ? lv.warnings
                    .filter((w) => w.code !== 'cleanup.target-not-reachable')
                    .map((w) => `${METHOD_LABEL[m]}: ${w.message}`)
                : [];
            })
          : [],
      ),
    ),
  ];
  const flags = reads.flatMap(({ row, kept }) => {
    if (!kept.current || kept.levels === null || kept.levels.medium !== 'groundwater') return [];
    return (['legacy', 'modern'] as const).flatMap((m) => {
      const lv = kept.levels!.methods[m];
      if (!lv?.ok || lv.level === null) return [];
      const f = solubilityFlag(row.name, lv.level * 1e3, ceilingOf(row.id));
      return f === null ? [] : [`${METHOD_LABEL[m]}: ${f}`];
    });
  });
  const source = plan.source === 'dissolved' ? 'groundwater source' : 'soil source';
  return (
    <section className="panel" aria-label="Source levels through the groundwater path">
      <h2>Source levels through the groundwater path</h2>
      <p className="muted">
        The {source} concentration that, carried through the step 3 models to the well, just meets
        each chemical&apos;s target. Each chemical is solved by running its models again until the
        target is met, and the levels are kept with the project.
      </p>
      {solve.computing && (
        <p className="muted" role="status">
          Solving through the step 3 models
          {solve.progress !== null && solve.progress.total > 1
            ? `: ${solve.progress.done} of ${solve.progress.total} chemicals solved`
            : '...'}
        </p>
      )}
      {solve.error !== null && (
        <p className="alert" role="alert">
          The solve failed: {solve.error}
        </p>
      )}
      {plan.groupProblem !== null && (
        <p className="alert" role="alert">
          {plan.groupProblem}
        </p>
      )}
      {unbuilt.map((r) => (
        <div className="alert" role="alert" key={r.id}>
          <strong>Needed before the level of {r.name} can be solved:</strong>
          <ul>
            {(r.result.ok ? [] : r.result.errors).map((e) => (
              <li key={e}>{plainMessage(e, names)}</li>
            ))}
          </ul>
        </div>
      ))}
      <div className="cleanup-table-wrap">
        <table className="sat cleanup-table">
          <caption className="sr-only">Source levels through the groundwater path</caption>
          <thead>
            <tr>
              <th scope="col">Chemical</th>
              <th scope="col">Method</th>
              <th scope="col">Level</th>
              <th scope="col">Limiting</th>
              <th scope="col">Cancer level</th>
              <th scope="col">Noncancer level</th>
              <th scope="col">Target</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {reads.flatMap(({ row, kept }) => levelRows(row, kept, guided, ceilingOf, props.solve))}
          </tbody>
        </table>
      </div>
      {flags.map((f) => (
        <p className="alert" role="note" key={f}>
          {f}
        </p>
      ))}
      <PlainList title="Notes on these levels" items={[...notes, ...warnings]} names={names} />
    </section>
  );
}

function statusText(
  row: GuidedSolveRow,
  kept: ReturnType<typeof guidedKeptLevels>,
  solve: GuidedSolveState,
): string {
  if (kept.current) return 'Up to date';
  if (!row.result.ok || row.fingerprint === null) return 'Cannot be solved yet';
  if (solve.computing) return kept.levels === null ? 'Solving' : 'Out of date, solving again';
  return kept.levels === null ? 'Not solved yet' : 'Out of date';
}

function targetText(guided: GuidedState, row: GuidedSolveRow): string {
  const std = guided.targets.standards[row.id];
  if (row.target === 'state' && std !== undefined) {
    const what = `State standard ${std.value || '(no value)'} ${std.unit}`;
    return std.source.trim() === '' ? `${what}, source not named` : `${what} (${std.source})`;
  }
  return TARGET_TEXT[row.target];
}

function levelRows(
  row: GuidedSolveRow,
  kept: ReturnType<typeof guidedKeptLevels>,
  guided: GuidedState,
  ceilingOf: (id: string) => SolubilityCeiling | null,
  solve: GuidedSolveState,
) {
  const status = statusText(row, kept, solve);
  const target = targetText(guided, row);
  const k = kept.levels;
  const cls = kept.current ? undefined : 'stale';
  const nameCell = (
    <th scope="row" data-label="Chemical">
      {row.name}
    </th>
  );
  if (k === null || k.reason !== null || Object.keys(k.methods).length === 0) {
    return [
      <tr key={row.id} className={cls}>
        {nameCell}
        <td data-label="Method">-</td>
        <td data-label="Level" className="level">
          <strong>{k === null ? 'not solved' : 'not quantified'}</strong>
          {k?.reason && <div className="muted">{k.reason}</div>}
        </td>
        <td data-label="Limiting">-</td>
        <td data-label="Cancer level">-</td>
        <td data-label="Noncancer level">-</td>
        <td data-label="Target">{target}</td>
        <td data-label="Status">{status}</td>
      </tr>,
    ];
  }
  const { unit, fromSi } = unitOf(k);
  const order: Method[] =
    guided.run.basis === 'legacy' ? ['legacy', 'modern'] : ['modern', 'legacy'];
  return order.flatMap((m) => {
    const lv = k.methods[m];
    if (lv === undefined) return [];
    const reason = levelReason(lv);
    const above =
      lv.ok && lv.level !== null && k.medium === 'groundwater'
        ? solubilityFlag(row.name, lv.level * 1e3, ceilingOf(row.id)) !== null
        : false;
    return [
      <tr key={`${row.id}|${m}`} className={cls}>
        {nameCell}
        <td data-label="Method">
          {METHOD_LABEL[m]}
          {m === guided.run.basis ? '' : ' (check)'}
        </td>
        <td data-label="Level" className="level">
          <strong>
            {lv.ok && lv.level !== null
              ? `${fmtSource(lv.level, fromSi)} ${unit}`
              : 'not quantified'}
          </strong>
          {above && <div className="level-flag">above the solubility</div>}
          {reason !== null && <div className="muted">{reason}</div>}
        </td>
        <td data-label="Limiting">
          {lv.ok && lv.limiting !== null ? ENDPOINT_TEXT[lv.limiting] : 'none'}
        </td>
        <td data-label="Cancer level">{lv.ok ? fmtSource(lv.cancerLevel, fromSi) : '-'}</td>
        <td data-label="Noncancer level">{lv.ok ? fmtSource(lv.noncancerLevel, fromSi) : '-'}</td>
        <td data-label="Target">{target}</td>
        <td data-label="Status">{status}</td>
      </tr>,
    ];
  });
}

// ---------------------------------------------------------------- vapor and surface water source levels

export function SourceLevelTable(props: {
  title: string;
  caption: string;
  intro: string;
  rows: SourceRow[];
  note?: string | null;
}) {
  const warnings = [...new Set(props.rows.flatMap((r) => r.warnings))];
  return (
    <section className="panel" aria-label={props.title}>
      <h2>{props.title}</h2>
      <p className="muted">{props.intro}</p>
      {props.note && (
        <p className="muted" role="status">
          {props.note}
        </p>
      )}
      <div className="cleanup-table-wrap">
        <table className="sat cleanup-table">
          <caption className="sr-only">{props.caption}</caption>
          <thead>
            <tr>
              <th scope="col">Chemical</th>
              <th scope="col">Source</th>
              <th scope="col">Method</th>
              <th scope="col">Level</th>
              <th scope="col">Limiting</th>
              <th scope="col">Cancer level</th>
              <th scope="col">Noncancer level</th>
              <th scope="col">Found by</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" data-label="Chemical">
                  {r.chemical}
                </th>
                <td data-label="Source">{r.source}</td>
                <td data-label="Method">{r.method}</td>
                <td data-label="Level" className="level">
                  <strong>{r.level}</strong>
                  {r.flag && <div className="level-flag">above the solubility</div>}
                  {r.reason && <div className="muted">{r.reason}</div>}
                </td>
                <td data-label="Limiting">{r.limiting}</td>
                <td data-label="Cancer level">{r.cancer}</td>
                <td data-label="Noncancer level">{r.noncancer}</td>
                <td data-label="Found by">{r.foundBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- the levels in the medium contacted

export function DirectLevels(props: {
  direct: ReturnType<typeof guidedDirectCleanup>;
  names: Record<string, string>;
  ceilingOf: (id: string) => SolubilityCeiling | null;
  order: Method[];
}) {
  const { direct, names, ceilingOf, order } = props;
  const { built, outcome } = direct;
  if (!built.ok) {
    return (
      <div className="alert" role="alert">
        <strong>Needed before the levels in the medium contacted can be computed:</strong>
        <ul>
          {built.errors.map((e) => (
            <li key={e}>{plainMessage(e, names)}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (outcome === null) return null;
  const items = [
    ...(direct.individualFallback
      ? [
          'All chemicals together applies to the source levels through the groundwater path, which keep the step 3b ratios. The levels in the media contacted below are each chemical alone, since no ratios were measured there.',
        ]
      : []),
    ...built.notes,
    ...order.flatMap((m) => {
      const o = outcome[m];
      return o.ok
        ? o.result.warnings.map((w) => `${METHOD_LABEL[m]}: ${w.message}`)
        : [`${METHOD_LABEL[m]} method did not run: ${o.error}`];
    }),
    ...built.feedWarnings.map((w) => `Plant uptake: ${w.message}`),
  ];
  return (
    <>
      <h2 className="guided-targets-sub">Levels in the media the receptors contact</h2>
      {order.map((m) => (
        <LevelsSection
          key={m}
          method={m}
          outcome={outcome[m]}
          names={names}
          ceilingOf={ceilingOf}
        />
      ))}
      <CleanupNotQuantified outcome={outcome} inputs={built} names={names} />
      <PlainList title="Warnings and notes" items={items} names={names} />
    </>
  );
}

/** A list of notes and warnings in plain words: chemical names, no codes. */
export function PlainList(props: {
  title: string;
  items: readonly string[];
  names: Record<string, string>;
}) {
  const items = [...new Set(props.items.map((i) => plainMessage(i, props.names)))];
  if (items.length === 0) return null;
  return (
    <section className="panel" aria-label={props.title}>
      <h2>
        {props.title} ({items.length})
      </h2>
      <ul className="guided-targets-notes">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </section>
  );
}
