import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  addChemical as addProjectChemical,
  getScreen,
  removeProjectChemical,
  setScreen,
} from '../project/store';
import { useFollowList } from '../project/useFollowList';
import { RemoveChemicalConfirm } from '../project/RemoveChemicalConfirm';
import { Field, Seg } from '../ui/controls';
import { ChemicalCard } from '../risk/ChemicalCard';
import { ChemicalPicker } from '../risk/ChemicalPicker';
import { ReceptorPanel } from '../risk/ReceptorPanel';
import { defaultReceptor, newChemicalRow, type ChemicalRow } from '../risk/form';
import { setField, resetField } from '../overrides/model';
import { useEffectiveDb, useOverrides } from '../overrides/useOverrides';
import { withReceptorEdits } from '../overrides/receptors';
import { useChemicalDb } from '../risk/useChemicalDb';
import { ADD_CHEMICAL, buildCleanup, ENTER_CONCENTRATION, type CleanupBuildResult } from './build';
import { runCleanup, type CleanupOutcome } from './compute';
import { getSaturatedFeedSlots, subscribeSaturatedFeed } from '../saturated/feed';
import { getHouseholdFeedSlots, subscribeHouseholdFeed } from '../household/feeds';
import { HouseholdPanel } from './HouseholdPanel';
import { VaporPanel } from './VaporPanel';
import { getVaporRiskFeedSlots, subscribeVaporRiskFeed } from '../vapor/feeds';
import { getSurfaceWaterFeedSlots, subscribeSurfaceWaterFeed } from '../surfaceWater/feed';
import { SurfaceWaterPanel, SurfaceWaterTargetPanel } from './SurfaceWaterPanel';
import { SurfaceWaterTargetInputs } from './SurfaceWaterTargetInputs';
import { surfaceTargetLevels, surfaceTargetTables, targetsOfChemicals } from './surfaceWaterTarget';
import { surfaceWaterSourceLevels } from './surfaceWaterLevels';
import { jobsOf } from './surfaceSolved';
import { useSurfaceSolves } from './useSurfaceSolves';
import { useCriteriaDb } from './useCriteriaDb';
import { useCleanupProps } from './useCleanupProps';
import { useSaveModeledLevels } from './useSaveModeledLevels';
import { solubilityCeiling, solubilityText } from './solubility';
import { TphPanel } from './TphPanel';
import {
  getProduceFeedSlots,
  getTphFeed,
  subscribeProduceFeed,
  subscribeTphFeed,
} from '../plantsEco/feeds';
import { getTransportFeedSlots, subscribeTransportFeed } from '../transport/chainFeed';
import { getVadoseFeedSlots, subscribeVadoseFeed } from '../vadose/feed';
import { pickSlot } from '../project/feedSlots';
import { ALLOCATIONS, SOURCES, TARGET_KINDS, type CleanupForm } from './form';
import { buildModeledRows } from './modeledBuild';
import { ModeledRowsView, ModeledUncertaintyView, type ModeledSolved } from './ModeledCleanup';
import { useModeled } from './useModeled';
import { SsgInputs, SsgResults } from './SsgPanel';
import { CleanupUncertainty } from './CleanupUncertainty';
import { StaleMark } from '../project/StaleMark';
import { cleanupFeedsRead } from '../project/feedsRead';
import { DownloadCsv } from '../export/DownloadCsv';
import { cleanupCsvTables } from './csv';
import { panelFeeds, sourceLevelCsvTables } from './sourceLevelsCsv';
import { LevelsSection, NotQuantified, WarningsList } from './Results';
import { HelpLink } from '../docs/HelpLink';

type Built = Extract<CleanupBuildResult, { ok: true }>;
interface Snapshot {
  built: Built;
  outcome: CleanupOutcome;
}

const EXAMPLE_ID = '71-43-2';

export function CleanupPage() {
  const [form, setForm] = useState<CleanupForm>(() => getScreen('cleanup').form);
  useEffect(() => setScreen('cleanup', { form }), [form]);
  const [lastGood, setLastGood] = useState<Snapshot | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const { db: baseDb, error: dbError } = useChemicalDb();
  const [overrides, setOverridesState] = useOverrides();
  const db = useEffectiveDb(baseDb, overrides);

  const patch = (next: Partial<CleanupForm>): void => setForm((f) => ({ ...f, ...next }));
  const setRow = (id: string, next: ChemicalRow): void =>
    setForm((f) => ({ ...f, chemicals: f.chemicals.map((c) => (c.id === id ? next : c)) }));
  // the rows are the project chemical list; a chemical this screen holds no state for gets defaults
  const setRows = useCallback(
    (update: (rows: readonly ChemicalRow[]) => readonly ChemicalRow[]): void =>
      setForm((f) => {
        const next = update(f.chemicals);
        return next === f.chemicals ? f : { ...f, chemicals: [...next] };
      }),
    [],
  );
  const list = useFollowList(
    form.chemicals,
    setRows,
    (id) => {
      const rec = db?.byId.get(id);
      return rec ? newChemicalRow(rec) : null;
    },
    db !== null,
  );
  const outside = db ? list.filter((c) => !db.byId.has(c.id)) : [];
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  // every slot of each feed (one per chemical); the screen reads the slot of each cleanup chemical
  const transportSlots = useSyncExternalStore(
    subscribeTransportFeed,
    getTransportFeedSlots,
    getTransportFeedSlots,
  );
  const vadoseSlots = useSyncExternalStore(
    subscribeVadoseFeed,
    getVadoseFeedSlots,
    getVadoseFeedSlots,
  );
  const saturatedSlots = useSyncExternalStore(
    subscribeSaturatedFeed,
    getSaturatedFeedSlots,
    getSaturatedFeedSlots,
  );
  const householdSlots = useSyncExternalStore(
    subscribeHouseholdFeed,
    getHouseholdFeedSlots,
    getHouseholdFeedSlots,
  );
  const vaporSlots = useSyncExternalStore(
    subscribeVaporRiskFeed,
    getVaporRiskFeedSlots,
    getVaporRiskFeedSlots,
  );
  const surfaceSlots = useSyncExternalStore(
    subscribeSurfaceWaterFeed,
    getSurfaceWaterFeedSlots,
    getSurfaceWaterFeedSlots,
  );
  const produceSlots = useSyncExternalStore(
    subscribeProduceFeed,
    getProduceFeedSlots,
    getProduceFeedSlots,
  );
  const tphFeed = useSyncExternalStore(subscribeTphFeed, getTphFeed, getTphFeed);
  // a modeled source is solved per chemical: each chemical reads the chain runs of its own slots
  const feedsOf = (id: string) => ({
    transport: pickSlot(transportSlots, id),
    vadose: pickSlot(vadoseSlots, id),
    saturated: pickSlot(saturatedSlots, id),
  });
  const modeledOn = form.source !== 'direct';
  // the feeds the levels shown are computed from; a stale one is marked beside them and in the CSV
  const feedsUsed = cleanupFeedsRead(form, {});
  const modeledFeeds = feedsUsed.filter((k) => k.feed !== 'produce');
  const directFeeds = produceSlots.size > 0 ? feedsUsed.filter((k) => k.feed === 'produce') : [];
  const rowIds = form.chemicals.map((c) => c.id);
  const criteriaDb = useCriteriaDb();
  // the form with the project's receptor names and factor edits laid on, for every build below
  const buildForm = useMemo(() => withReceptorEdits(form, overrides, 'cleanup'), [form, overrides]);

  const built = useMemo(
    () => (db && !modeledOn ? buildCleanup(buildForm, db, { produce: produceSlots }) : null),
    [buildForm, db, modeledOn, produceSlots],
  );
  const outcome = useMemo(() => (built?.ok ? runCleanup(built) : null), [built]);
  const modeledRows = useMemo(
    () =>
      db && modeledOn && buildForm.chemicals.length > 0
        ? buildModeledRows(buildForm, db, feedsOf)
        : null,
    // feedsOf reads only these slots
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildForm, db, modeledOn, transportSlots, vadoseSlots, saturatedSlots],
  );
  // the chemicals that could be built are solved; the others keep their problem on their own row
  const modeledRequests = useMemo(() => {
    const reqs = (modeledRows ?? []).flatMap((r) => (r.result.ok ? [r.result.request] : []));
    return reqs.length > 0 ? reqs : null;
  }, [modeledRows]);
  const modeled = useModeled(
    modeledRequests,
    (modeledRows ?? []).filter((r) => !r.result.ok).length,
  );
  // the solved outcome of each chemical, by chemical id; a chemical that cannot be built now shows
  // its problem instead of an earlier answer
  const modeledSolved = useMemo(() => {
    const out = new Map<string, ModeledSolved>();
    const reply = modeled.reply;
    if (reply?.ok && modeled.answered) {
      modeled.answered.forEach((req, i) =>
        out.set(req.chemical.id, { req, item: reply.items[i]! }),
      );
    }
    return out;
  }, [modeled.reply, modeled.answered]);
  const modeledSolveError = modeled.reply && !modeled.reply.ok ? modeled.reply.error : null;
  // the levels solved through the groundwater run are kept with the project, which the report prints
  useSaveModeledLevels({
    form: buildForm,
    db,
    rows: modeledRows,
    solved: modeledSolved,
    feedsOf,
  });
  // the solubility each chemical's dissolved levels are held against: the database value unless the user entered one
  const cleanupProps = useCleanupProps();
  const edition = db?.edition ?? '';
  const ceilingOf = useCallback(
    (id: string) => solubilityCeiling(form.solubility, id, cleanupProps, edition),
    [form.solubility, cleanupProps, edition],
  );
  const current: Snapshot | null = built?.ok && outcome ? { built, outcome } : null;
  const needsInput =
    form.chemicals.length === 0 ||
    (built !== null &&
      !built.ok &&
      built.errors.length === 1 &&
      (built.errors[0] === ENTER_CONCENTRATION || built.errors[0] === ADD_CHEMICAL));

  // Derived state, adjusted while rendering: keep the last result that computed, drop it when empty.
  if (current && (current.outcome.legacy.ok || current.outcome.modern.ok)) {
    if (lastGood?.outcome !== current.outcome) setLastGood(current);
  } else if (needsInput && lastGood !== null) {
    setLastGood(null);
  }

  const shown = current ?? (needsInput ? null : lastGood);
  const stale = current === null;
  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of form.chemicals) out[c.id] = c.name;
    for (const c of lastGood?.built.legacy.chemicals ?? []) {
      out[c.id] ??= db?.byId.get(c.id)?.name ?? c.id;
    }
    return out;
  }, [form.chemicals, lastGood, db]);

  // the soil saturation concentration of each cleanup chemical (kg/kg), for the free product warning
  const csat = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of form.chemicals) {
      const v = db?.byId.get(c.id)?.tox.csat;
      if (v !== undefined) out[c.id] = v * 1e-6;
    }
    return out;
  }, [form.chemicals, db]);
  const targetArgs = useMemo(
    () => ({
      targets: targetsOfChemicals(
        form.surfaceTargets,
        form.chemicals.map((c) => c.id),
      ),
      db: criteriaDb,
      slots: surfaceSlots,
      names,
      source: form.source,
      runCount: form.chemicals.length,
      soil: { vadose: vadoseSlots, saturated: saturatedSlots, tphHeld: form.tphHeld, csat },
    }),
    [
      form.surfaceTargets,
      form.chemicals,
      form.source,
      form.tphHeld,
      criteriaDb,
      surfaceSlots,
      vadoseSlots,
      saturatedSlots,
      names,
      csat,
    ],
  );
  // the surface water levels that are not linear in the source are solved in the worker (wave V slice V2b):
  // the jobs are read off the rows before any result is in, and the rows are drawn again with the results
  const surfaceFeeds = useMemo(
    () =>
      panelFeeds(
        surfaceSlots,
        form.chemicals.map((c) => c.id),
      ),
    [surfaceSlots, form.chemicals],
  );
  const surfaceJobs = useMemo(
    () =>
      jobsOf([
        ...(!modeledOn && shown
          ? surfaceFeeds.flatMap((f) =>
              surfaceWaterSourceLevels(shown.outcome, f, names, undefined, csat),
            )
          : []),
        ...surfaceTargetLevels(targetArgs),
      ]),
    [targetArgs, modeledOn, shown, surfaceFeeds, names, csat],
  );
  const surfaceSolved = useSurfaceSolves(surfaceJobs);
  const targetRows = useMemo(
    () => surfaceTargetLevels({ ...targetArgs, solves: surfaceSolved.solves }),
    [targetArgs, surfaceSolved.solves],
  );

  const addChemical = (id: string): void => {
    const rec = db?.byId.get(id);
    if (!rec) return;
    addProjectChemical({ id, name: rec.name });
    setForm((f) =>
      f.chemicals.some((c) => c.id === id)
        ? f
        : { ...f, chemicals: [...f.chemicals, newChemicalRow(rec)] },
    );
  };
  const loadExample = (): void => {
    const rec = db?.byId.get(EXAMPLE_ID);
    if (!rec) return;
    addProjectChemical({ id: EXAMPLE_ID, name: rec.name });
    setForm((f) => ({
      ...f,
      chemicals: [newChemicalRow(rec), ...f.chemicals.filter((c) => c.id !== EXAMPLE_ID)],
    }));
  };

  const methodErrors = shown
    ? (['legacy', 'modern'] as const).flatMap((m) => {
        const o = shown.outcome[m];
        return o.ok
          ? []
          : [`${m === 'legacy' ? 'Legacy' : 'Modern'} method did not run: ${o.error}`];
      })
    : [];
  const mclRec = form.chemicals[0] ? db?.byId.get(form.chemicals[0].id) : undefined;
  const mclHint =
    modeledOn && form.chemicals.length > 1
      ? 'Blank uses the database MCL of each chemical; a typed value applies to every chemical.'
      : mclRec?.tox.mclUnit !== undefined
        ? `The MCL of ${mclRec.name} is ${mclRec.tox.mcl} ${mclRec.tox.mclUnit}, not a mass per volume, so a blank has no target; enter one.`
        : mclRec?.tox.mcl !== undefined
          ? `Blank uses the MCL of ${mclRec.name}: ${mclRec.tox.mcl} ug/L${mclRec.tox.mclGroup ? ' (a group value)' : ''}.`
          : 'Blank uses the database MCL, which this chemical does not have.';
  const cumulative = !modeledOn && form.allocation === 'cumulative';

  return (
    <section aria-labelledby="cleanup-heading" className="vadose risk cleanup">
      <h1 id="cleanup-heading">Cleanup levels</h1>
      <HelpLink target="cleanup" />
      <p className="lede">
        Pick chemicals from the EPA Regional Screening Level tables and the receptors and pathways
        that matter, set a target cancer risk and hazard quotient, and see the concentration in
        soil, water or air that just meets them, with the legacy and modern methods side by side.
        The lower of the cancer and noncancer levels governs, and the screen says which one did.
      </p>

      <p>
        <button
          type="button"
          className="btn jump"
          onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          Jump to results
        </button>
      </p>

      <div className="transport-grid">
        <form className="inputs" onSubmit={(e) => e.preventDefault()} aria-label="Scenario inputs">
          <section className="panel" aria-label="Chemicals">
            <h2>Chemicals</h2>
            <ChemicalPicker
              db={db}
              error={dbError}
              selected={new Set(form.chemicals.map((c) => c.id))}
              onAdd={addChemical}
            />
            {form.chemicals.length === 0 && (
              <p>
                <button type="button" className="btn" disabled={!db} onClick={loadExample}>
                  Load an example: benzene
                </button>
              </p>
            )}
            {form.chemicals.length === 0 && (
              <p className="muted">Add a chemical to start. Levels appear as soon as one is in.</p>
            )}
            {removing && (
              <RemoveChemicalConfirm
                id={removing.id}
                name={removing.name}
                onCancel={() => setRemoving(null)}
                onConfirm={() => {
                  removeProjectChemical(removing.id);
                  setRemoving(null);
                }}
              />
            )}
            {outside.map((c) => (
              <p className="muted" key={c.id}>
                {c.name} is on the project list but not in the RSL tables, so this screen has no
                card for it.
              </p>
            ))}
            {db &&
              form.chemicals.map((row) => {
                const rec = db.byId.get(row.id);
                return rec ? (
                  <ChemicalCard
                    key={row.id}
                    row={row}
                    rec={rec}
                    db={db}
                    well={null}
                    showConcentrations={cumulative}
                    vapor={null}
                    household={null}
                    surface={null}
                    produce={pickSlot(produceSlots, row.id)}
                    showProduce
                    produceNote="Use the plants and ecology plant factors for homegrown produce (adds the produce pathway to this chemical's soil level; receptors switch the pathway on)"
                    concentrationNote="These concentrations set only the ratios between chemicals. The levels keep those ratios and are scaled together."
                    edits={overrides.toxicity[row.id]}
                    onEdit={(field, entry) =>
                      setOverridesState({
                        ...overrides,
                        toxicity:
                          entry === null
                            ? resetField(overrides.toxicity, row.id, field)
                            : setField(overrides.toxicity, row.id, field, entry),
                      })
                    }
                    onChange={(next) => setRow(row.id, next)}
                    onRemove={() => setRemoving({ id: row.id, name: row.name })}
                  />
                ) : null;
              })}
          </section>

          <section className="panel" aria-label="Source">
            <h2>Source</h2>
            <Seg
              legend="Solve for the concentration in"
              name="source"
              value={form.source}
              onChange={(v) => patch({ source: v })}
              options={SOURCES}
            />
            {!modeledOn && (
              <p className="muted">
                The medium the receptor contacts: soil, groundwater at the tap, air or surface
                water.
              </p>
            )}
            {form.source === 'dissolved' && (
              <p className="muted">
                A dissolved groundwater source held at the level, carried to the receptor well by
                the groundwater screen&apos;s aquifer.
              </p>
            )}
            {form.source === 'vadose' && (
              <p className="muted">
                A soil source leaching through the vadose zone screen&apos;s column to the water
                table, then to the well. The direct soil pathways of the receptor see the same soil
                concentration.
              </p>
            )}
            {form.source === 'saturated' && (
              <p className="muted">
                A soil source below the water table, released by the saturated source screen&apos;s
                method, then carried to the well.
              </p>
            )}
            {modeledOn && (
              <>
                {form.chemicals.length === 0 && (
                  <p className="muted source-hint">
                    No aquifer yet: use the groundwater transport screen first.
                  </p>
                )}
                {form.chemicals.map((row) => {
                  // a slot held for another chemical is not this chemical's run: say so, and mark nothing
                  const held = feedsOf(row.id);
                  const foreign = (f: { chemicalId?: string } | null): string | null =>
                    f?.chemicalId && f.chemicalId !== row.id
                      ? (form.chemicals.find((c) => c.id === f.chemicalId)?.name ??
                        'another chemical')
                      : null;
                  const otherTransport = foreign(held.transport);
                  const feeds = {
                    transport: otherTransport === null ? held.transport : null,
                    vadose: foreign(held.vadose) === null ? held.vadose : null,
                    saturated: foreign(held.saturated) === null ? held.saturated : null,
                  };
                  const who = form.chemicals.length > 1 ? `${row.name}: ` : '';
                  return (
                    <p className="muted source-hint" key={row.id}>
                      {feeds.transport
                        ? `${who}${who ? 'aquifer' : 'Aquifer'} and well: ${feeds.transport.label}.`
                        : otherTransport !== null
                          ? `${who}no aquifer run held for ${row.name} (the run held is for ${otherTransport}): use the groundwater transport screen first.`
                          : `${who}${who ? 'no' : 'No'} aquifer yet: use the groundwater transport screen first.`}{' '}
                      {feeds.transport && <StaleMark feed="transportChain" chemicalId={row.id} />}{' '}
                      {form.source === 'vadose' &&
                        (feeds.vadose ? (
                          <>
                            {`Vadose source: ${feeds.vadose.label}.`}{' '}
                            <StaleMark feed="vadose" chemicalId={row.id} />
                          </>
                        ) : (
                          'No vadose source held.'
                        ))}
                      {form.source === 'saturated' &&
                        (feeds.saturated ? (
                          <>
                            {`Saturated source: ${feeds.saturated.label}.`}{' '}
                            <StaleMark feed="saturated" chemicalId={row.id} />
                          </>
                        ) : (
                          'No saturated source held.'
                        ))}
                    </p>
                  );
                })}
                <div className="fields">
                  <Field
                    label={`Starting concentration (${form.source === 'dissolved' ? 'mg/L' : 'mg/kg'})`}
                    value={form.startConc}
                    onChange={(v) => patch({ startConc: v })}
                    placeholder="automatic"
                    hint="Where the search starts; the answer does not depend on it."
                  />
                </div>
                {form.source !== 'dissolved' && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={form.tphHeld}
                      onChange={(e) => patch({ tphHeld: e.target.checked })}
                    />
                    <span>
                      When the source has TPH, hold it at the entered value instead of scaling it
                      with the chemical.
                    </span>
                  </label>
                )}
                <Seg
                  legend="Solve to meet"
                  name="targetKind"
                  value={form.targetKind}
                  onChange={(v) => patch({ targetKind: v })}
                  options={TARGET_KINDS}
                />
                {form.targetKind === 'well' && (
                  <div className="fields">
                    <Field
                      label="Well concentration target (mg/L)"
                      value={form.wellTarget}
                      onChange={(v) => patch({ wellTarget: v })}
                      placeholder="database MCL"
                      hint={mclHint}
                    />
                    <Field
                      label="Averaging time (years)"
                      value={form.windowYr}
                      onChange={(v) => patch({ windowYr: v })}
                      placeholder="peak"
                      hint="Blank uses the peak at the well."
                    />
                  </div>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={form.secantParity}
                    onChange={(e) => patch({ secantParity: e.target.checked })}
                  />
                  <span>Also run the secant iteration and report how closely it agrees.</span>
                </label>
              </>
            )}
            <div className="fields">
              <Field
                label="Solubility ceiling (mg/L)"
                value={form.solubility}
                onChange={(v) => patch({ solubility: v })}
                placeholder="database solubility"
                hint="Blank holds each chemical against its database solubility, listed below. A value typed here applies to every chemical and wins. A dissolved level above the ceiling is flagged; for a dissolved groundwater source a typed ceiling also stops the search at it."
              />
            </div>
            {form.chemicals.length > 0 && (
              <ul
                className="muted solubility-defaults"
                aria-label="Solubility used for each chemical"
              >
                {form.chemicals.map((c) => {
                  const ceiling = ceilingOf(c.id);
                  return (
                    <li key={c.id}>
                      {c.name}:{' '}
                      {ceiling !== null
                        ? solubilityText(ceiling)
                        : cleanupProps === null
                          ? 'loading the database solubility'
                          : 'the database gives no solubility, so no level is flagged'}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel" aria-label="Targets">
            <h2>Targets and allocation</h2>
            <div className="fields">
              <Field
                label="Target cancer risk"
                value={form.targetRisk}
                onChange={(v) => patch({ targetRisk: v })}
                placeholder="1e-6"
                hint="Blank uses 1e-6."
              />
              <Field
                label="Target hazard quotient"
                value={form.targetHq}
                onChange={(v) => patch({ targetHq: v })}
                placeholder="1"
                hint="Blank uses 1."
              />
            </div>
            {modeledOn ? (
              <p className="muted">
                Each chemical of a modeled source is solved alone, through the chain sent for it, so
                allocation among chemicals does not apply.
              </p>
            ) : (
              <>
                <Seg
                  legend="Allocation among chemicals"
                  name="allocation"
                  value={form.allocation}
                  onChange={(v) => patch({ allocation: v })}
                  options={ALLOCATIONS}
                />
                <p className="muted">
                  {form.allocation === 'individual' &&
                    'Each chemical alone meets the target. Additivity across chemicals is not built in, as in the RSL and soil screening levels.'}
                  {form.allocation === 'equal' &&
                    'The target is split equally among the chemicals. Hazard quotients are divided over all target organs, which is conservative.'}
                  {form.allocation === 'cumulative' &&
                    'One scale factor keeps the ratios of the concentrations you enter and makes the summed risk and hazard index meet the targets.'}
                </p>
              </>
            )}
          </section>

          <SsgInputs
            form={form.ssg}
            onChange={(next) => patch({ ssg: { ...form.ssg, ...next } })}
          />

          <SurfaceWaterTargetInputs
            chemicals={form.chemicals}
            targets={form.surfaceTargets}
            db={criteriaDb}
            onChange={(surfaceTargets) => patch({ surfaceTargets })}
          />

          <section className="panel" aria-label="Receptors">
            <h2>Receptors</h2>
            <ReceptorPanel
              tag="Receptor A"
              id="a"
              screen="cleanup"
              form={form.a}
              onChange={(a) => patch({ a })}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={form.b !== null}
                onChange={(e) =>
                  patch({
                    b: e.target.checked ? defaultReceptor('worker') : null,
                    additive: e.target.checked ? form.additive : false,
                  })
                }
              />
              <span>Evaluate a second receptor</span>
            </label>
            {form.b && (
              <ReceptorPanel
                tag="Receptor B"
                id="b"
                screen="cleanup"
                form={form.b}
                onChange={(b) => patch({ b })}
              />
            )}
            {form.b && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.additive}
                  onChange={(e) => patch({ additive: e.target.checked })}
                />
                <span>
                  Add the two receptors&apos; cancer risks (never their hazard quotients). Without
                  it the lower level of the two governs.
                </span>
              </label>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={form.routeExtrapolation}
                onChange={(e) => patch({ routeExtrapolation: e.target.checked })}
              />
              <span>
                Legacy: take a missing oral or inhalation toxicity value from the other route
              </span>
            </label>
          </section>
        </form>

        <div className="results" ref={resultsRef}>
          {tphFeed && <TphPanel feed={tphFeed} />}
          {modeledOn && (
            <ModeledRowsView
              rows={modeledRows ?? []}
              solved={modeledSolved}
              computing={modeled.computing}
              progress={modeled.progress}
              solveError={modeledSolveError}
              feeds={modeledFeeds}
              ceilingOf={ceilingOf}
            />
          )}
          {!modeledOn && built && !built.ok && !needsInput && (
            <div className="alert" role="alert">
              <strong>Fix these inputs to update the results:</strong>
              <ul>
                {built.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {!modeledOn && needsInput && (
            <p className="muted">
              {form.chemicals.length === 0
                ? 'The cleanup levels appear here once a chemical is added.'
                : ENTER_CONCENTRATION}
            </p>
          )}
          {!modeledOn &&
            methodErrors.map((m) => (
              <div className="alert" role="alert" key={m}>
                {m}
              </div>
            ))}

          {!modeledOn && shown && (
            <div className={stale ? 'stale' : undefined}>
              <StaleMark feed={directFeeds} />
              <LevelsSection
                method="modern"
                outcome={shown.outcome.modern}
                names={names}
                ceilingOf={ceilingOf}
              />
              <LevelsSection
                method="legacy"
                outcome={shown.outcome.legacy}
                names={names}
                ceilingOf={ceilingOf}
              />
              {panelFeeds(householdSlots, rowIds).map((f) => (
                <HouseholdPanel key={f.chemicalId} outcome={shown.outcome} feed={f} names={names} />
              ))}
              {panelFeeds(vaporSlots, rowIds).map((f) => (
                <VaporPanel
                  key={f.chemicalId}
                  outcome={shown.outcome}
                  feed={f}
                  names={names}
                  ceiling={ceilingOf(f.chemicalId)}
                />
              ))}
              {surfaceFeeds.map((f) => (
                <SurfaceWaterPanel
                  key={f.chemicalId ?? ''}
                  outcome={shown.outcome}
                  feed={f}
                  names={names}
                  solves={surfaceSolved.solves}
                  csat={csat}
                  progress={surfaceSolved.progress}
                  solveError={surfaceSolved.error}
                />
              ))}
              <DownloadCsv
                disabled={stale || surfaceSolved.computing}
                tables={[
                  ...cleanupCsvTables(shown.outcome, names, ceilingOf).map((t) => ({
                    ...t,
                    feeds: directFeeds,
                  })),
                  ...sourceLevelCsvTables(
                    shown.outcome,
                    names,
                    {
                      household: householdSlots,
                      vapor: vaporSlots,
                      surface: surfaceSlots,
                    },
                    { solves: surfaceSolved.solves, csat, ceilingOf },
                  ),
                ]}
              />
              <NotQuantified outcome={shown.outcome} inputs={shown.built} names={names} />
              <WarningsList
                outcome={shown.outcome}
                notes={shown.built.notes}
                feedWarnings={shown.built.feedWarnings}
              />
            </div>
          )}
          {!modeledOn && shown && shown.outcome.legacy.ok && (
            <CleanupUncertainty input={shown.built.legacy} names={names} feeds={directFeeds} />
          )}
          {modeledOn && (
            <ModeledUncertaintyView
              rows={modeledRows ?? []}
              solved={modeledSolved}
              pending={modeled.computing}
              feeds={modeledFeeds}
            />
          )}
          <SurfaceWaterTargetPanel
            rows={targetRows}
            progress={surfaceSolved.progress}
            solveError={surfaceSolved.error}
          />
          {targetRows.length > 0 && (
            <DownloadCsv
              disabled={targetRows.some((r) => r.pending)}
              tables={surfaceTargetTables(targetRows)}
            />
          )}
          <SsgResults form={buildForm} db={db} />
        </div>
      </div>
    </section>
  );
}
