import { useMemo, useSyncExternalStore } from 'react';
import {
  getChemicals,
  getGuided,
  setGuided,
  subscribeChemicals,
  subscribeGuided,
} from '../../project/store';
import { guidedHref } from '../../steps';
import { csvFileName } from '../../export/csvFileName';
import { downloadCsv, exportCsv } from '../../export/csv';
import { Field, Seg } from '../../ui/controls';
import { chain } from '../chain';
import { getRunState, prepareRun, startGuidedRun, subscribeRunState } from '../runner';
import { RunResults } from '../RunResults';
import { runCsvTable } from '../runCsv';
import { blockedChemicals, staleReport, staleSentence } from '../runView';
import { hashOutputCheck } from '../status';
import { useGuidedChemicalData } from '../useOutputCheck';
import type { GuidedRun } from '../state';

/**
 * Step 3d: the run settings (simulation time, time step, source duration, method basis), one Run for every
 * chemical, and the results. The method basis is chosen once here. After an edit the status line names
 * the models and chemicals whose results no longer match their inputs.
 */

export function RunStep() {
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const chemicals = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const result = useMemo(() => chain(guided.site), [guided.site]);
  const ready = chemicals.length > 0 && result.problems.length === 0;
  const data = useGuidedChemicalData(ready);

  // the Run is not tied to this screen: it goes on when the step is left, so its progress is read from there
  const { progress, error } = useSyncExternalStore(subscribeRunState, getRunState, getRunState);

  const prepared = useMemo(
    () => (data === null || !ready ? null : prepareRun(guided, data)),
    [guided, data, ready],
  );
  const names = useMemo(() => chemicals.map((c) => ({ id: c.id, name: c.name })), [chemicals]);

  const heading = <h1 id="guided-run-heading">Run and view</h1>;
  if (chemicals.length === 0) {
    return (
      <section aria-labelledby="guided-run-heading" className="guided-run">
        {heading}
        <p className="muted">
          Add at least one chemical in <a href={guidedHref('chemicals')}>step 1</a> before you run
          the models.
        </p>
      </section>
    );
  }
  if (result.problems.length > 0) {
    return (
      <section aria-labelledby="guided-run-heading" className="guided-run">
        {heading}
        <p className="muted">
          Finish the site model in <a href={guidedHref('site')}>step 2</a> first. It decides which
          models run.
        </p>
      </section>
    );
  }

  const setRun = (patch: Partial<GuidedRun>): void =>
    setGuided({ ...getGuided(), run: { ...getGuided().run, ...patch } });

  const running = progress !== null;
  const settingsProblems = prepared?.plan?.problems ?? [];
  const feeds = prepared?.plan?.outputs ?? result.outputs;
  const anyOutput = Object.keys(guided.outputs).length > 0;
  const anyNotes = Object.values(guided.runNotes).some((n) => n.problems.length > 0);
  const check =
    prepared === null ? null : hashOutputCheck(guided.outputs, prepared.hashes, guided.runNotes);
  const stale = check === null ? null : staleReport(feeds, names, check);
  const blocked = check === null ? [] : blockedChemicals(feeds, names, check);
  // what the derivation already knows will stop a model, shown before there is any Run to report it
  const jobProblems = prepared?.jobs.flatMap((j) => j.problems.map((p) => p.message)) ?? [];

  const go = (): void => {
    if (data === null || prepared === null || prepared.problems.length > 0) return;
    void startGuidedRun(data);
  };

  let status: React.ReactNode;
  if (running) {
    status = `Running chemical ${Math.min(progress.done + 1, progress.total)} of ${progress.total}...`;
  } else if (!anyOutput && !anyNotes) {
    status =
      feeds.length === 0
        ? 'Nothing to run: the values you entered are used as they are.'
        : 'Not run yet. Press the Run button.';
  } else if (prepared === null) {
    status = 'Checking whether the results are up to date...';
  } else if (stale !== null) {
    status = (
      <>
        <strong>These results are out of date.</strong> {staleSentence(stale)} Press Run to update
        them.
      </>
    );
  } else if (!anyOutput) {
    status =
      'The Run finished, but no model produced a result. The reasons are listed under each chemical below. Running again changes nothing until you fix them.';
  } else if (blocked.length > 0) {
    status = `Up to date. Some models could not run for ${blocked.join(', ')}; the reasons are listed under each chemical below.`;
  } else {
    status = 'Up to date';
  }

  const table = runCsvTable(guided.outputs, names);

  return (
    <section aria-labelledby="guided-run-heading" className="guided-run">
      {heading}
      <p className="muted">
        One Run computes every chemical in your project with the models step 2 chose.
      </p>

      <div className="guided-run-settings">
        <Field
          label="Simulation time (years)"
          value={guided.run.timeYr}
          onChange={(v) => setRun({ timeYr: v })}
        />
        <Field
          label="Time step (years)"
          value={guided.run.stepYr}
          onChange={(v) => setRun({ stepYr: v })}
        />
        <Field
          label="How long the source lasts (years)"
          hint="Leave blank for a source that never ends."
          value={guided.run.sourceYr}
          onChange={(v) => setRun({ sourceYr: v })}
        />
      </div>
      <p className="muted">
        The time step sets only the groundwater transport curve, which has one point for each step.
        The leaching, saturated soil, indoor air and surface water models keep their own time steps.
      </p>
      <Seg
        legend="Method basis, chosen once for the whole run"
        name="guided-run-basis"
        value={guided.run.basis}
        options={[
          { value: 'modern', label: 'Modern (current EPA methods)' },
          { value: 'legacy', label: 'Legacy (the older methods)' },
        ]}
        onChange={(basis) => setRun({ basis })}
      />
      <p className="muted">
        The other set of methods serves as the check: the model screens in the workbench show both
        side by side.
      </p>

      {settingsProblems.length > 0 && (
        <div role="alert">
          <ul className="guided-run-problems">
            {settingsProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {prepared !== null && prepared.problems.length > 0 && settingsProblems.length === 0 && (
        <div role="alert">
          <ul className="guided-run-problems">
            {prepared.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {jobProblems.length > 0 && !running && !anyOutput && !anyNotes && (
        <div className="guided-run-skips">
          <p>
            <strong>Some models will not run</strong> for the values you have entered so far:
          </p>
          <ul className="guided-run-problems">
            {jobProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {error !== null && (
        <p className="guided-run-problems" role="alert">
          The run stopped: {error}
        </p>
      )}

      <p className="guided-run-actions">
        <button
          type="button"
          className="btn"
          disabled={
            running || prepared === null || prepared.problems.length > 0 || feeds.length === 0
          }
          onClick={go}
        >
          Run all chemicals ({chemicals.length})
        </button>
        {data === null && <span className="muted"> Loading chemical data...</span>}
        {data !== null && !running && jobProblems.length === 0 && (
          <span className="muted"> The models are ready to run.</span>
        )}
      </p>
      <p
        className={
          stale !== null || running ? 'status on guided-run-status' : 'status guided-run-status'
        }
        role="status"
      >
        {status}
      </p>

      {(anyOutput || anyNotes) && prepared?.plan && (
        <>
          <p>
            <button
              type="button"
              className="btn"
              onClick={() => downloadCsv(csvFileName(table), exportCsv(table.rows, table.columns))}
            >
              Download CSV: every chemical and time step
            </button>
          </p>
          <RunResults
            outputs={guided.outputs}
            chemicals={names}
            plan={prepared.plan}
            run={guided.run}
            notes={guided.runNotes}
          />
        </>
      )}
    </section>
  );
}
