import type { FeedRef } from '../project/staleFeeds';
import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_N, type UncertainInput } from '@model-flow/engine';
import { Field } from '../ui/controls';
import { DistributionEditor } from '../uncertainty/DistributionEditor';
import type { UncertaintySetup } from '../uncertainty/project';
import { useSetup } from '../uncertainty/useSetup';
import type { EditorSpec } from '../uncertainty/editor';
import { formatDuration } from '../uncertainty/budget';
import { cleanupSettings, runCleanupAnalysis, type CleanupRun } from '../uncertainty/headless';
import type { Projection } from '../uncertainty/budget';
import { RunCancelledError } from '../uncertainty/pool';
import '../uncertainty/uncertainty.css';
import { MEDIA } from '../risk/form';
import type { CleanupLegacyInput } from './build';
import { buildProbabilisticSetup, probabilisticChoices } from './probabilistic';
import { AlertDialog } from '../ui/AlertDialog';
import { ProbabilisticResults } from './ProbabilisticResults';

type Shown = CleanupRun & { label: string; input: CleanupLegacyInput };

/**
 * The probabilistic cleanup level of one chemical in one medium on the cleanup screen: the receptor
 * factors are sampled, the cleanup level is solved for every draw, and the level that protects a chosen
 * fraction of the sampled population is reported. Direct-pathway sources only.
 */
export function CleanupUncertainty(props: {
  input: CleanupLegacyInput;
  names: Readonly<Record<string, string>>;
  /** Feeds from other screens the input was taken from. */
  feeds?: readonly FeedRef[];
  /** Clock in milliseconds, replaceable in tests. */
  now?: () => number;
}) {
  const { input, names } = props;
  const now = props.now ?? ((): number => performance.now());
  const choices = useMemo(() => probabilisticChoices(input), [input]);
  const [setup0, patchSetup] = useSetup('cleanup');
  const [initialEditor] = useState(() => ({ rows: setup0.rows, entries: setup0.correlation }));
  const choiceKey = setup0.choice;
  const setChoiceKey = (v: string): void => patchSetup({ choice: v });
  const onEditorState = useCallback(
    (s: { rows: UncertaintySetup['rows']; entries: UncertaintySetup['correlation'] }) =>
      patchSetup({ rows: s.rows, correlation: s.entries }),
    [patchSetup],
  );
  const keyOf = (c: { chemicalId: string; medium: string }): string =>
    `${c.chemicalId}|${c.medium}`;
  const choice = choices.find((c) => keyOf(c) === choiceKey) ?? choices[0];
  const setup = useMemo(
    () => (choice ? buildProbabilisticSetup(input, choice.chemicalId, choice.medium) : null),
    [input, choice],
  );
  const inputs = useMemo(
    () =>
      setup?.ok ? ((setup.model.uncertainInputs ?? []) as readonly UncertainInput<unknown>[]) : [],
    [setup],
  );
  const labels = useMemo(() => Object.fromEntries(inputs.map((u) => [u.id, u.label])), [inputs]);
  const [spec, setSpec] = useState<EditorSpec | null>(null);
  const nText = setup0.iterations;
  const setNText = (v: string): void => patchSetup({ iterations: v });
  const seed = setup0.seed;
  const setSeed = (v: string): void => patchSetup({ seed: v });
  const protText = setup0.protection;
  const setProtText = (v: string): void => patchSetup({ protection: v });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ p: Projection; answer: (ok: boolean) => void } | null>(
    null,
  );
  const [shown, setShown] = useState<Shown | null>(null);

  const onSpec = useCallback((s: EditorSpec) => setSpec(s), []);
  const sampled = spec ? Object.keys(spec.distributions).length : 0;
  const canRun = !running && setup?.ok === true && spec !== null && spec.ok && sampled > 0;
  const nPlaceholder = String(DEFAULT_N.lhs);

  const run = async (): Promise<void> => {
    if (!setup?.ok || !spec || !spec.ok || !choice) return;
    setError(null);
    setShown(null);
    const settings = cleanupSettings(setup0);
    if (!settings.ok) {
      setError(settings.error);
      return;
    }
    setRunning(true);
    try {
      const ran = await runCleanupAnalysis(setup, spec, settings.value, labels, {
        now,
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
      const medium =
        MEDIA.find((m) => m.key === choice.medium)?.label.toLowerCase() ?? choice.medium;
      setShown({
        ...ran,
        label: `${names[choice.chemicalId] ?? choice.chemicalId} in ${medium}`,
        input,
      });
    } catch (e) {
      if (e instanceof RunCancelledError) setError('The run was cancelled.');
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setConfirm(null);
    }
  };

  const cancel = (): void => {
    confirm?.answer(false);
  };

  return (
    <section className="panel uncertainty" aria-label="Probabilistic cleanup level">
      <h2>Probabilistic cleanup level</h2>
      <p className="muted">
        Sample the receptor factors and solve the cleanup level for every draw. The level that
        protects a chosen fraction of the sampled population is the matching low percentile of the
        solved levels. This solves one chemical in one medium at a time, each against its full
        targets (individual allocation, risk and hazard targets), even when the screen above splits
        the targets among chemicals. A modeled source has its own panel.
      </p>
      {choices.length === 0 && <p className="muted">Switch on a pathway to sample its level.</p>}
      {choices.length > 1 && (
        <label className="field">
          <span className="field-label">Chemical and medium</span>
          <select
            className="u-select"
            value={choice ? keyOf(choice) : ''}
            onChange={(e) => {
              setChoiceKey(e.target.value);
              setShown(null);
            }}
          >
            {choices.map((c) => (
              <option key={keyOf(c)} value={keyOf(c)}>
                {names[c.chemicalId] ?? c.chemicalId} in{' '}
                {MEDIA.find((m) => m.key === c.medium)?.label.toLowerCase() ?? c.medium}
              </option>
            ))}
          </select>
        </label>
      )}
      {setup && !setup.ok && (
        <div className="alert" role="alert">
          {setup.error}
        </div>
      )}
      {setup?.ok && setup.deterministic === null && (
        <p className="alert" role="status">
          The target cannot be met for this chemical and medium (no toxicity value applies), so
          there is no level to sample.
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
            value={protText}
            onChange={setProtText}
            hint="95 protects 95 percent of the sampled population. 50 and 90 are always shown too."
          />
          <Field
            label="Iterations"
            value={nText}
            onChange={setNText}
            placeholder={nPlaceholder}
            hint={`Blank uses ${nPlaceholder}. Latin hypercube sampling.`}
          />
          <Field
            label="Seed"
            value={seed}
            onChange={setSeed}
            hint="The same seed, count and inputs give the same numbers every time."
          />
        </div>
        <div className="u-actions">
          <button type="button" className="button" disabled={!canRun} onClick={() => void run()}>
            Run probabilistic cleanup
          </button>
          {running && (
            <button type="button" className="button button-quiet" onClick={cancel}>
              Cancel run
            </button>
          )}
        </div>
        {running && !confirm && (
          <p className="muted" role="status">
            Solving the cleanup level for every draw...
          </p>
        )}
      </div>

      {confirm && (
        <AlertDialog className="alert" label="Long run" onCancel={() => confirm.answer(false)}>
          <p>
            <strong>This run is projected to take {formatDuration(confirm.p.projectedMs)}</strong> (
            {confirm.p.totalRows} iterations at {confirm.p.msPerRow.toFixed(1)} ms each). Run it
            anyway, or cancel and reduce the iteration count.
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
          stale={shown.input !== input}
          {...(props.feeds ? { feeds: props.feeds } : {})}
        />
      )}
    </section>
  );
}
