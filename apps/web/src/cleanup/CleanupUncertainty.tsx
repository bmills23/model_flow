import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_N,
  DEFAULT_SEED,
  buildSampleMatrix,
  solveCleanupRows,
  sourceLevelSolve,
  spearmanWithOutput,
  type CleanupResult,
  type UncertainInput,
  type UncertainModel,
  type UncertaintySpec,
} from '@model-flow/engine';
import { Field } from '../ui/controls';
import { DistributionEditor } from '../uncertainty/DistributionEditor';
import type { EditorSpec } from '../uncertainty/editor';
import { PILOT_ROWS, assertWithinBudget, formatDuration, projectRun } from '../uncertainty/budget';
import type { Projection } from '../uncertainty/budget';
import { RunCancelledError } from '../uncertainty/pool';
import { CdfChart, HistogramChart, SpearmanChart } from '../uncertainty/ResultsCharts';
import { empiricalCdf, fmtNum, histogram } from '../uncertainty/resultsData';
import '../uncertainty/uncertainty.css';
import { MEDIA } from '../risk/form';
import type { CleanupLegacyInput } from './build';
import {
  buildProbabilisticSetup,
  probabilisticChoices,
  runCleanupProbabilistic,
} from './probabilistic';

const DEFAULT_PROTECTION_PERCENT = '95';

interface Shown {
  result: CleanupResult;
  label: string;
  unit: string;
  fromSi: number;
  deterministic: number | null;
  spearman: { label: string; rho: number }[];
  input: CleanupLegacyInput;
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * The probabilistic cleanup level of one chemical in one medium on the cleanup screen: the receptor
 * factors are sampled, the cleanup level is solved for every draw, and the level that protects a chosen
 * fraction of the sampled population is reported. Direct-pathway sources only.
 */
export function CleanupUncertainty(props: {
  input: CleanupLegacyInput;
  names: Readonly<Record<string, string>>;
  /** Clock in milliseconds, replaceable in tests. */
  now?: () => number;
}) {
  const { input, names } = props;
  const now = props.now ?? ((): number => performance.now());
  const choices = useMemo(() => probabilisticChoices(input), [input]);
  const [choiceKey, setChoiceKey] = useState('');
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
  const [nText, setNText] = useState('');
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [protText, setProtText] = useState(DEFAULT_PROTECTION_PERCENT);
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
    const n = nText.trim() === '' ? DEFAULT_N.lhs : Number(nText);
    if (!Number.isInteger(n) || n < 1) {
      setError('The number of iterations must be a positive whole number.');
      return;
    }
    const percent = Number(protText);
    if (!(Number.isFinite(percent) && percent > 0 && percent < 100)) {
      setError(
        'The protected fraction must be a percentage between 0 and 100, not including either.',
      );
      return;
    }
    const useSeed = seed.trim() === '' ? DEFAULT_SEED : seed;
    setRunning(true);
    try {
      await tick();
      const full: UncertaintySpec<unknown, unknown> = {
        model: setup.model as UncertainModel<unknown, unknown>,
        base: setup.base,
        distributions: spec.distributions,
        output: () => 0,
        ...(spec.correlation ? { correlation: spec.correlation } : {}),
        n,
        seed: useSeed,
      };
      // The pilot times the first rows alone; the run budget (ruling 11) is projected from it.
      const matrix = buildSampleMatrix('lhs', full);
      const pilotRows = matrix.samples.slice(0, Math.min(PILOT_ROWS, n));
      const t0 = now();
      solveCleanupRows(setup.model, setup.base, matrix.ids, pilotRows, (i) =>
        sourceLevelSolve(setup.problem(i)),
      );
      const projection = projectRun({
        pilotMs: now() - t0,
        pilotRows: pilotRows.length,
        totalRows: n,
        workers: 1,
      });
      assertWithinBudget(projection);
      if (projection.decision === 'confirm') {
        const ok = await new Promise<boolean>((resolve) =>
          setConfirm({
            p: projection,
            answer: (a) => {
              setConfirm(null);
              resolve(a);
            },
          }),
        );
        if (!ok) throw new RunCancelledError();
        await tick();
      }
      const result = runCleanupProbabilistic(setup, {
        distributions: spec.distributions,
        ...(spec.correlation ? { correlation: spec.correlation } : {}),
        n,
        seed: useSeed,
        protection: percent / 100,
      });
      const censored = new Set(result.censoredRows);
      const rho = spearmanWithOutput(
        result.samples,
        result.iterationLevels.map((v, i) => (censored.has(i) ? Number.NaN : v)),
      );
      const medium =
        MEDIA.find((m) => m.key === choice.medium)?.label.toLowerCase() ?? choice.medium;
      setShown({
        result,
        label: `${names[choice.chemicalId] ?? choice.chemicalId} in ${medium}`,
        unit: setup.unit,
        fromSi: setup.fromSi,
        deterministic: setup.deterministic,
        spearman: result.ids.map((id, j) => ({ label: labels[id] ?? id, rho: rho[j] as number })),
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

  const conv = (x: number): number => x * (shown?.fromSi ?? 1);
  const solvedLevels = shown
    ? shown.result.iterationLevels.filter(
        (v, i) => Number.isFinite(v) && !shown.result.censoredRows.includes(i),
      )
    : [];
  const levelsScreen = solvedLevels.map(conv);
  const detScreen = shown?.deterministic != null ? conv(shown.deterministic) : undefined;

  return (
    <section className="panel uncertainty" aria-label="Probabilistic cleanup level">
      <h2>Probabilistic cleanup level</h2>
      <p className="muted">
        Sample the receptor factors and solve the cleanup level for every draw. The level that
        protects a chosen fraction of the sampled population is the matching low percentile of the
        solved levels. This solves one chemical in one medium at a time, each against its full
        targets (individual allocation, risk and hazard targets), even when the screen above splits
        the targets among chemicals. Modeled sources are not sampled yet.
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
        <DistributionEditor inputs={inputs} displays={setup.displays} onChange={onSpec} />
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
        <div className="alert" role="alertdialog" aria-label="Long run">
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
        </div>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {shown && (
        <div className="u-results" aria-label="Probabilistic cleanup results">
          <h3>Results: {shown.label}</h3>
          {shown.input !== input && (
            <p className="alert" role="status">
              The scenario inputs changed after this run. Run again to update the results.
            </p>
          )}
          <p>
            {shown.result.succeeded} of {shown.result.n} iterations ran (Latin hypercube sampling,
            seed <code>{shown.result.seed}</code>, {shown.result.forwardRuns} forward runs).{' '}
            {shown.deterministic !== null ? (
              <>
                The deterministic cleanup level is{' '}
                <strong>
                  {fmtNum(conv(shown.deterministic))} {shown.unit}
                </strong>
                .
              </>
            ) : (
              'The deterministic target is not reachable.'
            )}
          </p>
          {shown.result.warnings.length > 0 && (
            <ul className="warnings">
              {shown.result.warnings.map((w) => (
                <li key={`${w.code}-${w.message}`}>
                  <code>{w.code}</code>: {w.message}
                </li>
              ))}
            </ul>
          )}
          <div className="table-wrap">
            <table aria-label="Protective cleanup levels">
              <caption>
                Level that protects a fraction of the sampled population ({shown.unit})
              </caption>
              <thead>
                <tr>
                  <th scope="col">Protected</th>
                  <th scope="col">Cleanup level ({shown.unit})</th>
                </tr>
              </thead>
              <tbody>
                {shown.result.levels.map((l) => (
                  <tr key={l.p}>
                    <th scope="row">
                      {Number((l.p * 100).toFixed(4))} percent
                      {l.p === shown.result.protection.p ? ' (chosen)' : ''}
                    </th>
                    <td>
                      {l.level === null ? 'not reachable below the cap' : fmtNum(conv(l.level))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {levelsScreen.length > 0 ? (
            <>
              <CdfChart points={empiricalCdf(levelsScreen)} base={detScreen} unit={shown.unit} />
              <HistogramChart hist={histogram(levelsScreen)} base={detScreen} unit={shown.unit} />
            </>
          ) : (
            <p className="muted">No iteration reached the target, so there is nothing to chart.</p>
          )}
          <h3>Which inputs matter</h3>
          <SpearmanChart rows={shown.spearman} />
        </div>
      )}
    </section>
  );
}
