import { useMemo, useRef, useState } from 'react';
import { Field, Seg } from '../ui/controls';
import { ChemicalCard } from '../risk/ChemicalCard';
import { ChemicalPicker } from '../risk/ChemicalPicker';
import { ReceptorPanel } from '../risk/ReceptorPanel';
import { defaultReceptor, newChemicalRow, type ChemicalRow } from '../risk/form';
import { useChemicalDb } from '../risk/useChemicalDb';
import { ADD_CHEMICAL, buildCleanup, ENTER_CONCENTRATION, type CleanupBuildResult } from './build';
import { runCleanup, type CleanupOutcome } from './compute';
import { ALLOCATIONS, defaultCleanupForm, type CleanupForm } from './form';
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

  const built = useMemo(() => (db ? buildCleanup(form, db) : null), [form, db]);
  const outcome = useMemo(() => (built?.ok ? runCleanup(built) : null), [built]);
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
  const cumulative = form.allocation === 'cumulative';

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
          </section>

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
          {built && !built.ok && !needsInput && (
            <div className="alert" role="alert">
              <strong>Fix these inputs to update the results:</strong>
              <ul>
                {built.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {needsInput && (
            <p className="muted">
              {form.chemicals.length === 0
                ? 'The cleanup levels appear here once a chemical is added.'
                : ENTER_CONCENTRATION}
            </p>
          )}
          {methodErrors.map((m) => (
            <div className="alert" role="alert" key={m}>
              {m}
            </div>
          ))}

          {shown && (
            <div className={stale ? 'stale' : undefined}>
              <LevelsSection method="modern" outcome={shown.outcome.modern} names={names} />
              <LevelsSection method="legacy" outcome={shown.outcome.legacy} names={names} />
              <NotQuantified outcome={shown.outcome} inputs={shown.built} names={names} />
              <WarningsList outcome={shown.outcome} notes={shown.built.notes} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
