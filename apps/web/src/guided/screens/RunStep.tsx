import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import { Seg, TextField } from '../../ui/controls';
import { chain } from '../chain';
import type { ModelProblem } from '../derive';
import { createGuidedRunner, prepareRun, runGuided, type GuidedRunner } from '../runner';
import { RunResults } from '../RunResults';
import { runCsvTable } from '../runCsv';
import { staleReport, staleSentence } from '../runView';
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

  const runnerRef = useRef<GuidedRunner | null>(null);
  useEffect(
    () => () => {
      runnerRef.current?.dispose();
      runnerRef.current = null;
    },
    [],
  );
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problems, setProblems] = useState<Map<string, ModelProblem[]> | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const check = prepared === null ? null : hashOutputCheck(guided.outputs, prepared.hashes);
  const stale = check === null ? null : staleReport(feeds, names, check);

  const go = async (): Promise<void> => {
    if (data === null || prepared === null || prepared.problems.length > 0) return;
    runnerRef.current ??= createGuidedRunner();
    setError(null);
    setProgress({ done: 0, total: data.length });
    try {
      const runs = await runGuided(runnerRef.current, data, (p) =>
        setProgress({ done: p.done, total: p.total }),
      );
      if (runs !== null) {
        setProblems(new Map(runs.map((r) => [r.chemicalId, r.problems])));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  let status: React.ReactNode;
  if (running) {
    status = `Running chemical ${Math.min(progress.done + 1, progress.total)} of ${progress.total}...`;
  } else if (!anyOutput) {
    status =
      feeds.length === 0
        ? 'Nothing to run: the values you entered are used as they are.'
        : 'Not run yet. Press the Run button.';
  } else if (stale !== null) {
    status = (
      <>
        <strong>These results are out of date.</strong> {staleSentence(stale)} Press Run to update
        them.
      </>
    );
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
        <TextField
          label="Simulation time (years)"
          value={guided.run.timeYr}
          onChange={(v) => setRun({ timeYr: v })}
        />
        <TextField
          label="Time step (years)"
          value={guided.run.stepYr}
          onChange={(v) => setRun({ stepYr: v })}
        />
        <TextField
          label="How long the source lasts (years)"
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
          onClick={() => void go()}
        >
          Run all chemicals ({chemicals.length})
        </button>
        {data === null && <span className="muted"> Loading chemical data...</span>}
        {data !== null && !running && <span className="muted"> The models are ready to run.</span>}
      </p>
      <p
        className={
          stale !== null || running ? 'status on guided-run-status' : 'status guided-run-status'
        }
        role="status"
      >
        {status}
      </p>

      {anyOutput && prepared?.plan && (
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
            problems={problems}
          />
        </>
      )}
    </section>
  );
}
