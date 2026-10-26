import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  getChemicals,
  getGuided,
  getOverrides,
  setGuided,
  setOverrides,
  subscribeChemicals,
  subscribeGuided,
  subscribeProject,
} from '../../project/store';
import { guidedHref } from '../../steps';
import { TextField } from '../../ui/controls';
import { useChemicalRows } from '../../ui/chemicalFill';
import { chain, SOURCE_LABELS } from '../chain';
import { ChemicalValuesPanel } from '../ChemicalValuesPanel';
import { parsePaste } from '../paste';
import type { GuidedSource, SourceValueKey } from '../state';
import { classifyValue, defaultUnit, unitsFor } from '../units';

/**
 * Steps 3b and 3c on one screen. 3b: a row for each chemical with a box for each source medium step 2
 * needs, a unit for each medium, a sample note for each row, pasting from a spreadsheet and the optional
 * total petroleum hydrocarbons in soil. "ND" (not detected) is a valid answer and the Run takes it as
 * zero from that medium. 3c: the chemical properties those models read, with project-only edits.
 */

const SOIL_MEDIA: readonly SourceValueKey[] = ['soil', 'soilAbove', 'soilBelow'];

const blankSource = (): GuidedSource => ({ values: {}, note: '', tph: '' });

export function SourcesStep() {
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const chemicals = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const overrides = useSyncExternalStore(subscribeProject, getOverrides, getOverrides);
  const { baseRows, failed } = useChemicalRows();
  const result = useMemo(() => chain(guided.site), [guided.site]);
  const [pasteText, setPasteText] = useState('');
  const [pasteReport, setPasteReport] = useState<string[] | null>(null);

  const media = result.valuesNeeded;
  const sources = guided.sources;
  const soilNeeded = media.some((m) => SOIL_MEDIA.includes(m));

  const save = (next: Record<string, GuidedSource>): void =>
    setGuided({ ...getGuided(), sources: next });
  const current = (): Record<string, GuidedSource> => getGuided().sources;
  const update = (id: string, change: (s: GuidedSource) => GuidedSource): void => {
    const all = current();
    save({ ...all, [id]: change(all[id] ?? blankSource()) });
  };

  const columnUnit = (m: SourceValueKey): string => {
    for (const c of chemicals) {
      const u = sources[c.id]?.values[m]?.unit;
      if (u !== undefined && u !== '') return u;
    }
    return defaultUnit(m);
  };

  const setColumnUnit = (m: SourceValueKey, unit: string): void => {
    const next = { ...current() };
    for (const c of chemicals) {
      const s = next[c.id] ?? blankSource();
      next[c.id] = {
        ...s,
        values: { ...s.values, [m]: { value: s.values[m]?.value ?? '', unit } },
      };
    }
    save(next);
  };

  const setValue = (id: string, m: SourceValueKey, value: string): void =>
    update(id, (s) => ({
      ...s,
      values: { ...s.values, [m]: { value, unit: s.values[m]?.unit ?? columnUnit(m) } },
    }));

  const applyPaste = (): void => {
    const parsed = parsePaste(
      pasteText,
      media,
      chemicals.map((c) => ({
        id: c.id,
        name: c.name,
        ...(c.cas === undefined ? {} : { cas: c.cas }),
      })),
    );
    const next = { ...current() };
    for (const r of parsed.rows) {
      const s = next[r.chemicalId] ?? blankSource();
      const values = { ...s.values };
      for (const [k, v] of Object.entries(r.values) as [SourceValueKey, string][]) {
        values[k] = { value: v, unit: parsed.units[k] ?? s.values[k]?.unit ?? columnUnit(k) };
      }
      next[r.chemicalId] = {
        ...s,
        values,
        note: r.note ?? s.note,
        tph: r.tph ?? s.tph,
      };
    }
    save(next);
    const lines = [
      parsed.rows.length === 0
        ? 'No rows were used.'
        : `Used ${parsed.rows.length} ${parsed.rows.length === 1 ? 'row' : 'rows'}.`,
      ...parsed.problems,
    ];
    setPasteReport(lines);
    if (parsed.rows.length > 0) setPasteText('');
  };

  const heading = (
    <>
      <h1 id="guided-sources-heading">Source values</h1>
    </>
  );

  if (chemicals.length === 0) {
    return (
      <section aria-labelledby="guided-sources-heading" className="guided-sources">
        {heading}
        <p className="muted">
          Add at least one chemical in <a href={guidedHref('chemicals')}>step 1</a>, then enter its
          concentrations here.
        </p>
      </section>
    );
  }
  if (result.problems.length > 0) {
    return (
      <section aria-labelledby="guided-sources-heading" className="guided-sources">
        {heading}
        <p className="muted">
          Finish the site model in <a href={guidedHref('site')}>step 2</a> first. It decides which
          media need a concentration.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="guided-sources-heading" className="guided-sources">
      {heading}
      <p className="muted">
        Enter the concentration of each chemical in each medium step 2 uses as a source
        {guided.site.basis === 'measured'
          ? ' (here the values are the exposure concentrations)'
          : ''}
        . Type <strong>ND</strong> where a chemical was not detected: the Run then counts none of it
        from that medium. Pick the unit your lab reported; the values are converted for the models.
      </p>

      <div className="guided-sources-units">
        {media.map((m) => (
          <label key={m} className="field">
            <span className="field-label">Unit for {SOURCE_LABELS[m].toLowerCase()}</span>
            <select value={columnUnit(m)} onChange={(e) => setColumnUnit(m, e.target.value)}>
              {unitsFor(m).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="guided-sources-rows">
        {chemicals.map((c) => {
          const s = sources[c.id] ?? blankSource();
          return (
            <fieldset key={c.id} className="guided-sources-row" aria-label={c.name}>
              <legend>{c.name}</legend>
              <div className="guided-sources-cells">
                {media.map((m) => {
                  const cell = s.values[m];
                  const unit = cell?.unit ?? columnUnit(m);
                  const bad = cell !== undefined && classifyValue(cell.value).kind === 'invalid';
                  return (
                    <label key={m} className="field">
                      <span className="field-label">
                        {SOURCE_LABELS[m]} ({unit})
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={cell?.value ?? ''}
                        aria-invalid={bad ? true : undefined}
                        onChange={(e) => setValue(c.id, m, e.target.value)}
                      />
                      {bad && (
                        <small role="alert" className="field-error">
                          Enter a number above zero or ND for not detected.
                        </small>
                      )}
                    </label>
                  );
                })}
                {soilNeeded && (
                  <label className="field">
                    <span className="field-label">
                      Total petroleum hydrocarbons in soil (mg/kg, optional)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={s.tph}
                      aria-invalid={
                        s.tph.trim() !== '' && classifyValue(s.tph).kind === 'invalid'
                          ? true
                          : undefined
                      }
                      onChange={(e) => update(c.id, (x) => ({ ...x, tph: e.target.value }))}
                    />
                    {s.tph.trim() !== '' && classifyValue(s.tph).kind === 'invalid' && (
                      <small role="alert" className="field-error">
                        Enter a number above zero in mg/kg, or ND for not detected, or leave it
                        blank. Until then the models that read it do not run.
                      </small>
                    )}
                  </label>
                )}
              </div>
              <TextField
                label="Sample note"
                hint="Where and when the sample was taken, or the report it came from."
                value={s.note}
                onChange={(v) => update(c.id, (x) => ({ ...x, note: v }))}
              />
            </fieldset>
          );
        })}
      </div>

      <details className="guided-sources-paste">
        <summary>Paste from a spreadsheet</summary>
        <p className="muted">
          Copy cells from a spreadsheet and paste them here. The first column is the chemical (name
          or CAS number). A header row naming the media, and a row of units under it, are used when
          present; without a header the columns follow the order above. ND, N.D. and less-than
          values are read as not detected.
        </p>
        <label className="field">
          <span className="field-label">Paste from a spreadsheet</span>
          <textarea
            rows={6}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={pasteText.trim() === ''}
          onClick={applyPaste}
        >
          Use the pasted table
        </button>
        {pasteReport !== null && (
          <div role="status">
            {pasteReport.map((l) => (
              <p key={l} className="muted">
                {l}
              </p>
            ))}
          </div>
        )}
      </details>

      <h2>Chemical values</h2>
      {failed ? (
        <p className="alert" role="alert">
          The chemical database did not load, so the chemical values cannot be shown. Reload the
          page.
        </p>
      ) : (
        <ChemicalValuesPanel
          chemicals={chemicals}
          models={result.models}
          baseRows={baseRows}
          overrides={overrides}
          onChange={setOverrides}
          loading={baseRows.length === 0}
        />
      )}
    </section>
  );
}
