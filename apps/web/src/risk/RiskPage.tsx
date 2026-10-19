import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getScreen, setScreen } from '../project/store';
import { Seg, Field } from '../ui/controls';
import { getWellFeed, subscribeWellFeed } from '../transport/wellFeed';
import { getVaporRiskFeed, subscribeVaporRiskFeed } from '../vapor/feeds';
import { getSurfaceWaterFeed, subscribeSurfaceWaterFeed } from '../surfaceWater/feed';
import { buildInputs, ENTER_CONCENTRATION, type BuildResult } from './build';
import { ChemicalCard } from './ChemicalCard';
import { ChemicalPicker } from './ChemicalPicker';
import { useChemicalDb } from './useChemicalDb';
import { runRisk, type RiskOutcome } from './compute';
import { defaultReceptor, newChemicalRow, type ChemicalRow, type RiskForm } from './form';
import { ReceptorPanel } from './ReceptorPanel';
import { DownloadCsv } from '../export/DownloadCsv';
import { riskCsvTables } from './csv';
import { Charts, Comparison, EpcTable, NotQuantified, WarningsList } from './Results';

type Built = Extract<BuildResult, { ok: true }>;
interface Snapshot {
  built: Built;
  outcome: RiskOutcome;
}

const EXAMPLE_ID = '71-43-2';

export function RiskPage() {
  const [form, setForm] = useState<RiskForm>(() => getScreen('risk').form);
  useEffect(() => setScreen('risk', { form }), [form]);
  const [lastGood, setLastGood] = useState<Snapshot | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const { db, error: dbError } = useChemicalDb();
  const well = useSyncExternalStore(subscribeWellFeed, getWellFeed, getWellFeed);
  const vapor = useSyncExternalStore(subscribeVaporRiskFeed, getVaporRiskFeed, getVaporRiskFeed);
  const surface = useSyncExternalStore(
    subscribeSurfaceWaterFeed,
    getSurfaceWaterFeed,
    getSurfaceWaterFeed,
  );

  const patch = (next: Partial<RiskForm>): void => setForm((f) => ({ ...f, ...next }));
  const setRow = (id: string, next: ChemicalRow): void =>
    setForm((f) => ({ ...f, chemicals: f.chemicals.map((c) => (c.id === id ? next : c)) }));

  const built = useMemo(
    () => (db ? buildInputs(form, db, well, vapor, surface) : null),
    [form, db, well, vapor, surface],
  );
  const outcome = useMemo(() => (built?.ok ? runRisk(built) : null), [built]);
  const current: Snapshot | null = built?.ok && outcome ? { built, outcome } : null;
  const needsInput =
    form.chemicals.length === 0 ||
    (built !== null &&
      !built.ok &&
      built.errors.length === 1 &&
      built.errors[0] === ENTER_CONCENTRATION);

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
    for (const c of lastGood
      ? [...lastGood.built.legacy.receptors.flatMap((r) => r.chemicals)]
      : []) {
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
      chemicals: [
        { ...newChemicalRow(rec), conc: { soil: '1', groundwater: '0.005' } },
        ...f.chemicals.filter((c) => c.id !== EXAMPLE_ID),
      ],
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

  return (
    <section aria-labelledby="risk-heading" className="vadose risk">
      <h1 id="risk-heading">Exposure and risk</h1>
      <p className="lede">
        Pick chemicals from the EPA Regional Screening Level tables, enter their concentrations in
        soil, water and air (or take the groundwater concentration from the transport screen), and
        see the cancer risk and hazard index each method gives, which pathways and chemicals drive
        them, and what could not be quantified.
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
                  Load an example: benzene in soil and groundwater
                </button>
              </p>
            )}
            {form.chemicals.length === 0 && (
              <p className="muted">Add a chemical to start. Concentrations go on its card.</p>
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
                    well={well}
                    vapor={vapor}
                    surface={surface}
                    onChange={(next) => setRow(row.id, next)}
                    onRemove={() =>
                      patch({ chemicals: form.chemicals.filter((c) => c.id !== row.id) })
                    }
                  />
                ) : null;
              })}
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
                  Add the two receptors&apos; cancer risks (never their hazard indices; the modern
                  resident already covers a child and an adult)
                </span>
              </label>
            )}
          </section>

          <section className="panel" aria-label="Method options">
            <h2>Method options</h2>
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
            <Seg
              legend="Modern exposure start (concentration series)"
              name="startMode"
              value={form.startMode}
              onChange={(v) => patch({ startMode: v })}
              options={[
                { value: 'max-risk', label: 'When the risk is greatest' },
                { value: 'pinned', label: 'At a time I enter' },
              ]}
            />
            {form.startMode === 'pinned' && (
              <div className="fields">
                <Field
                  label="Exposure start (yr)"
                  value={form.startYr}
                  onChange={(v) => patch({ startYr: v })}
                  hint="Years after the start of the transport run."
                />
              </div>
            )}
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
                ? 'The results appear here once a chemical has a concentration.'
                : 'Enter a concentration for at least one chemical in at least one medium.'}
            </p>
          )}
          {methodErrors.map((m) => (
            <div className="alert" role="alert" key={m}>
              {m}
            </div>
          ))}

          {shown && (
            <div className={stale ? 'stale' : undefined}>
              <Comparison outcome={shown.outcome} additive={shown.built.legacy.additive === true} />
              <DownloadCsv disabled={stale} tables={riskCsvTables(shown.outcome, names)} />
              <Charts outcome={shown.outcome} names={names} />
              <NotQuantified outcome={shown.outcome} names={names} />
              <EpcTable outcome={shown.outcome} names={names} />
              <WarningsList outcome={shown.outcome} notes={shown.built.notes} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
