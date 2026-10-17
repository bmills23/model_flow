import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Field, Seg } from '../ui/controls';
import { ChemicalCard } from '../risk/ChemicalCard';
import { ChemicalPicker } from '../risk/ChemicalPicker';
import { ReceptorPanel } from '../risk/ReceptorPanel';
import { defaultReceptor, newChemicalRow, type ChemicalRow } from '../risk/form';
import { useChemicalDb } from '../risk/useChemicalDb';
import { ADD_CHEMICAL, buildCleanup, ENTER_CONCENTRATION, type CleanupBuildResult } from './build';
import { runCleanup, type CleanupOutcome } from './compute';
import { getSaturatedFeed, subscribeSaturatedFeed } from '../saturated/feed';
import { getTransportFeed, subscribeTransportFeed } from '../transport/chainFeed';
import { getVadoseFeed, subscribeVadoseFeed } from '../vadose/feed';
import { ALLOCATIONS, SOURCES, TARGET_KINDS, defaultCleanupForm, type CleanupForm } from './form';
import { buildModeled } from './modeledBuild';
import { ModeledResults } from './ModeledSection';
import { useModeled } from './useModeled';
import { SsgInputs, SsgResults } from './SsgPanel';
import { LevelsSection, NotQuantified, WarningsList } from './Results';

type Built = Extract<CleanupBuildResult, { ok: true }>;
interface Snapshot {
  built: Built;
  outcome: CleanupOutcome;
}

const EXAMPLE_ID = '71-43-2';

export function CleanupPage() {
  const [form, setForm] = useState<CleanupForm>(defaultCleanupForm);
  const [lastGood, setLastGood] = useState<Snapshot | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const { db, error: dbError } = useChemicalDb();

  const patch = (next: Partial<CleanupForm>): void => setForm((f) => ({ ...f, ...next }));
  const setRow = (id: string, next: ChemicalRow): void =>
    setForm((f) => ({ ...f, chemicals: f.chemicals.map((c) => (c.id === id ? next : c)) }));

  const transportFeed = useSyncExternalStore(
    subscribeTransportFeed,
    getTransportFeed,
    getTransportFeed,
  );
  const vadoseFeed = useSyncExternalStore(subscribeVadoseFeed, getVadoseFeed, getVadoseFeed);
  const saturatedFeed = useSyncExternalStore(
    subscribeSaturatedFeed,
    getSaturatedFeed,
    getSaturatedFeed,
  );
  const modeledOn = form.source !== 'direct';

  const built = useMemo(
    () => (db && !modeledOn ? buildCleanup(form, db) : null),
    [form, db, modeledOn],
  );
  const outcome = useMemo(() => (built?.ok ? runCleanup(built) : null), [built]);
  const modeledBuilt = useMemo(
    () =>
      db && modeledOn && form.chemicals.length > 0
        ? buildModeled(form, db, {
            transport: transportFeed,
            vadose: vadoseFeed,
            saturated: saturatedFeed,
          })
        : null,
    [form, db, modeledOn, transportFeed, vadoseFeed, saturatedFeed],
  );
  const modeled = useModeled(modeledBuilt?.ok ? modeledBuilt.request : null);
  const modeledReply = modeled.reply?.ok ? modeled.reply.outcome : null;
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

  const addChemical = (id: string): void => {
    const rec = db?.byId.get(id);
    if (!rec) return;
    setForm((f) =>
      f.chemicals.some((c) => c.id === id)
        ? f
        : { ...f, chemicals: [...f.chemicals, newChemicalRow(rec)] },
    );
  };
  const loadExample = (): void => {
    const rec = db?.byId.get(EXAMPLE_ID);
    if (!rec) return;
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
    mclRec?.tox.mcl !== undefined
      ? `Blank uses the MCL of ${mclRec.name}: ${mclRec.tox.mcl} ug/L${mclRec.tox.mclGroup ? ' (a group value)' : ''}.`
      : 'Blank uses the database MCL, which this chemical does not have.';
  const cumulative = !modeledOn && form.allocation === 'cumulative';

  return (
    <section aria-labelledby="cleanup-heading" className="vadose risk cleanup">
      <h1 id="cleanup-heading">Cleanup levels</h1>
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
                    concentrationNote="These concentrations set only the ratios between chemicals. The levels keep those ratios and are scaled together."
                    onChange={(next) => setRow(row.id, next)}
                    onRemove={() =>
                      patch({ chemicals: form.chemicals.filter((c) => c.id !== row.id) })
                    }
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
                <p className="muted source-hint">
                  {transportFeed
                    ? `Aquifer and well: ${transportFeed.label}.`
                    : 'No aquifer yet: use the groundwater transport screen first.'}{' '}
                  {form.source === 'vadose' &&
                    (vadoseFeed ? `Vadose source: ${vadoseFeed.label}.` : 'No vadose source held.')}
                  {form.source === 'saturated' &&
                    (saturatedFeed
                      ? `Saturated source: ${saturatedFeed.label}.`
                      : 'No saturated source held.')}
                </p>
                <div className="fields">
                  <Field
                    label={`Starting concentration (${form.source === 'dissolved' ? 'mg/L' : 'mg/kg'})`}
                    value={form.startConc}
                    onChange={(v) => patch({ startConc: v })}
                    placeholder="automatic"
                    hint="Where the search starts; the answer does not depend on it."
                  />
                  {form.source === 'dissolved' && (
                    <Field
                      label="Solubility ceiling (mg/L)"
                      value={form.solubility}
                      onChange={(v) => patch({ solubility: v })}
                      placeholder="none"
                      hint="A dissolved source cannot exceed it."
                    />
                  )}
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
                A modeled source is solved for one chemical alone, so allocation among chemicals
                does not apply.
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

          <section className="panel" aria-label="Receptors">
            <h2>Receptors</h2>
            <ReceptorPanel tag="Receptor A" id="a" form={form.a} onChange={(a) => patch({ a })} />
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
              <ReceptorPanel tag="Receptor B" id="b" form={form.b} onChange={(b) => patch({ b })} />
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
          {modeledOn && (
            <>
              {form.chemicals.length === 0 && (
                <p className="muted">The cleanup level appears here once a chemical is added.</p>
              )}
              {modeledBuilt && !modeledBuilt.ok && (
                <div className="alert" role="alert">
                  <strong>Needed before the level can be solved:</strong>
                  <ul>
                    {modeledBuilt.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {modeled.computing && modeledBuilt?.ok && (
                <p className="muted" role="status">
                  Solving through the transport chain...
                </p>
              )}
              {modeled.reply && !modeled.reply.ok && (
                <div className="alert" role="alert">
                  The solve failed: {modeled.reply.error}
                </div>
              )}
              {modeledReply && modeled.answered && (
                <div className={modeled.computing || !modeledBuilt?.ok ? 'stale' : undefined}>
                  <ModeledResults
                    outcome={modeledReply}
                    name={modeled.answered.chemical.name}
                    notes={modeledBuilt?.ok ? modeledBuilt.notes : []}
                  />
                </div>
              )}
            </>
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
              <LevelsSection method="modern" outcome={shown.outcome.modern} names={names} />
              <LevelsSection method="legacy" outcome={shown.outcome.legacy} names={names} />
              <NotQuantified outcome={shown.outcome} inputs={shown.built} names={names} />
              <WarningsList outcome={shown.outcome} notes={shown.built.notes} />
            </div>
          )}
          <SsgResults form={form} db={db} />
        </div>
      </div>
    </section>
  );
}
