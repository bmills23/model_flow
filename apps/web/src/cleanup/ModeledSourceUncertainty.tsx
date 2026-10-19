import { useCallback, useMemo, useRef, useState } from 'react';
import { UncertaintyError, type UncertainInput } from '@model-flow/engine';
import { Field } from '../ui/controls';
import { AlertDialog } from '../ui/AlertDialog';
import { DistributionEditor } from '../uncertainty/DistributionEditor';
import type { UncertaintySetup } from '../uncertainty/project';
import { useSetup } from '../uncertainty/useSetup';
import type { EditorSpec } from '../uncertainty/editor';
import { formatDuration, type Projection } from '../uncertainty/budget';
import { defaultWorkerFactory } from '../uncertainty/dispatch';
import {
  cleanupSettings,
  runModeledCleanupAnalysis,
  type ModeledCleanupRun,
} from '../uncertainty/headless';
import { RunCancelledError, type Progress, type WorkerFactory } from '../uncertainty/pool';
import '../uncertainty/uncertainty.css';
import type { Method } from './modeledChains';
import { LABELS } from './modeledChains';
import type { ModeledOutcome, ModeledRequest } from './modeledTypes';
import { buildModeledSetup } from './modeledSetup';
import { MODELED_DEFAULT_N, SMALL_TAIL_DRAWS } from './modeledUncertainty';
import { ProbabilisticResults } from './ProbabilisticResults';

type Shown = ModeledCleanupRun & { label: string; request: ModeledRequest };

const METHODS: Method[] = ['legacy', 'modern'];

/**
 * The probabilistic cleanup level of a modeled source: the declared inputs of the transport chain
 * (and, on the legacy side, the receptor factors) are sampled, every draw is a full modeled solve on
 * the worker pool, and the level protecting a chosen fraction of the draws is reported. The page
 * stays usable while it runs and the run can be cancelled.
 */
export function ModeledSourceUncertainty(props: {
  request: ModeledRequest;
  /** The screen's own solve of `request`: gives the deterministic level and the cap. */
  outcome: ModeledOutcome;
  name: string;
  /** The screen is solving a newer request: running now would sample the old one. */
  pending?: boolean;
  /** Defaults to module Web Workers (an inline stand-in without Worker support). */
  makeWorker?: WorkerFactory;
  workers?: number;
}) {
  const { request, outcome, name } = props;
  const [setup0, patchSetup] = useSetup('modeled');
  const [initialEditor] = useState(() => ({ rows: setup0.rows, entries: setup0.correlation }));
  const onEditorState = useCallback(
    (s: { rows: UncertaintySetup['rows']; entries: UncertaintySetup['correlation'] }) =>
      patchSetup({ rows: s.rows, correlation: s.entries }),
    [patchSetup],
  );
  const choice = setup0.choice;
  const { solved, method, setup } = useMemo(() => {
    const ok = METHODS.filter((m) => outcome[m]?.ok === true);
    const m: Method | undefined = ok.find((x) => x === choice) ?? ok[0];
    return { solved: ok, method: m, setup: m ? buildModeledSetup(request, outcome, m) : null };
  }, [request, outcome, choice]);
  const inputs = useMemo(
    () => (setup?.ok ? (setup.model.uncertainInputs as readonly UncertainInput<unknown>[]) : []),
    [setup],
  );
  const labels = useMemo(() => Object.fromEntries(inputs.map((u) => [u.id, u.label])), [inputs]);
  const [spec, setSpec] = useState<EditorSpec | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ p: Projection; answer: (ok: boolean) => void } | null>(
    null,
  );
  const [shown, setShown] = useState<Shown | null>(null);
  const abort = useRef<AbortController | null>(null);

  const onSpec = useCallback((s: EditorSpec) => setSpec(s), []);
  const sampled = spec ? Object.keys(spec.distributions).length : 0;
  const canRun =
    !running && !props.pending && setup?.ok === true && spec !== null && spec.ok && sampled > 0;
  const nPlaceholder = String(MODELED_DEFAULT_N);

  const run = async (): Promise<void> => {
    if (!setup?.ok || !spec || !spec.ok) return;
    setError(null);
    setShown(null);
    const settings = cleanupSettings(setup0, MODELED_DEFAULT_N);
    if (!settings.ok) {
      setError(settings.error);
      return;
    }
    const ctl = new AbortController();
    abort.current = ctl;
    setRunning(true);
    setProgress({ done: 0, total: settings.value.n });
    try {
      const ran = await runModeledCleanupAnalysis(setup, spec, settings.value, labels, {
        makeWorker: props.makeWorker ?? defaultWorkerFactory(),
        ...(props.workers !== undefined ? { workers: props.workers } : {}),
        onProgress: setProgress,
        signal: ctl.signal,
        confirm: (p) =>
          new Promise<boolean>((resolve) =>
            setConfirm({
              p,
              answer: (a) => {
                setConfirm(null);
                resolve(a);
              },
            }),
          ),
      });
      setShown({ ...ran, label: `${name} at the source, ${LABELS[setup.method]}`, request });
    } catch (e) {
      if (e instanceof RunCancelledError) setError('The run was cancelled.');
      else setError(e instanceof UncertaintyError || e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setProgress(null);
      setConfirm(null);
      abort.current = null;
    }
  };

  const cancel = (): void => {
    if (confirm) confirm.answer(false);
    abort.current?.abort();
  };

  return (
    <section className="panel uncertainty" aria-label="Probabilistic cleanup level, modeled source">
      <h2>Probabilistic cleanup level, modeled source</h2>
      <p className="muted">
        Sample the inputs of the transport chain and solve the modeled cleanup level for every draw.
        Every draw is a full solve through the chain, so the runs go to background workers: the page
        stays usable and the run can be cancelled. The level that protects a chosen fraction of the
        draws is the matching low percentile of the solved levels. The receptor factors are sampled
        with the legacy method only (the modern exposure method declares none), and the source
        concentration is never sampled because it is the level being solved.
      </p>
      {solved.length === 0 ? (
        <p className="muted">
          The probabilistic level of a modeled source is offered once the level above is solved.
        </p>
      ) : (
        <>
          <label className="field">
            <span className="field-label">Transport method</span>
            <select
              className="u-select"
              value={method}
              onChange={(e) => {
                patchSetup({ choice: e.target.value });
                setShown(null);
              }}
            >
              {solved.map((m) => (
                <option key={m} value={m}>
                  {m === 'legacy' ? 'Legacy' : 'Modern'}: {LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          {setup && !setup.ok && (
            <div className="alert" role="alert">
              {setup.error}
            </div>
          )}
          {setup?.ok && setup.deterministic === null && (
            <p className="alert" role="status">
              The target is not reached for the point values, so most draws may sit at the cap.
            </p>
          )}
          {setup?.ok && (
            <DistributionEditor
              inputs={inputs}
              displays={setup.displays}
              initial={initialEditor}
              onState={onEditorState}
              onChange={onSpec}
            />
          )}
          {spec && !spec.ok && (
            <div className="alert" role="alert">
              <strong>Fix these before running:</strong>
              <ul>
                {spec.issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="u-run">
            <div className="fields">
              <Field
                label="Protected fraction (percent)"
                value={setup0.protection}
                onChange={(v) => patchSetup({ protection: v })}
                hint="95 protects 95 percent of the draws. 50 and 90 are always shown too."
              />
              <Field
                label="Iterations"
                value={setup0.iterations}
                onChange={(v) => patchSetup({ iterations: v })}
                placeholder={nPlaceholder}
                hint={`Blank uses ${nPlaceholder}, which keeps ${SMALL_TAIL_DRAWS} draws below the 95 percent level. A modeled solve takes from tens of milliseconds to several seconds, so a run over a minute asks first and one over 10 minutes is refused.`}
              />
              <Field
                label="Seed"
                value={setup0.seed}
                onChange={(v) => patchSetup({ seed: v })}
                hint="The same seed, count and inputs give the same numbers every time."
              />
            </div>
            <div className="u-actions">
              <button
                type="button"
                className="button"
                disabled={!canRun}
                onClick={() => void run()}
              >
                Run probabilistic cleanup
              </button>
              {running && (
                <button type="button" className="button button-quiet" onClick={cancel}>
                  Cancel run
                </button>
              )}
            </div>
            {props.pending && !running && (
              <p className="muted" role="status">
                Waiting for the level above to be solved for the changed inputs.
              </p>
            )}
            {progress && (
              <div className="u-progress">
                <progress max={progress.total} value={progress.done} aria-label="Run progress" />
                <span role="status">
                  {progress.done} of {progress.total} iterations
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {confirm && (
        <AlertDialog className="alert" label="Long run" onCancel={() => confirm.answer(false)}>
          <p>
            <strong>This run is projected to take {formatDuration(confirm.p.projectedMs)}</strong> (
            {confirm.p.totalRows} iterations at {confirm.p.msPerRow.toFixed(1)} ms each on{' '}
            {confirm.p.workers} worker{confirm.p.workers === 1 ? '' : 's'}). Run it anyway, or
            cancel and reduce the iteration count.
          </p>
          <div className="u-actions">
            <button type="button" className="button" onClick={() => confirm.answer(true)}>
              Run anyway
            </button>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => confirm.answer(false)}
            >
              Cancel
            </button>
          </div>
        </AlertDialog>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {shown && (
        <ProbabilisticResults
          run={shown}
          label={shown.label}
          stale={shown.request !== request}
          runNote={`${shown.workers} worker${shown.workers === 1 ? '' : 's'}`}
        />
      )}
    </section>
  );
}
