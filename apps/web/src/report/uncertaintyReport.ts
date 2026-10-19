import type { UncertainInput } from '@model-flow/engine';
import { screensOf, type Project } from '../project';
import { buildCleanup } from '../cleanup/build';
import { runCleanup } from '../cleanup/compute';
import {
  buildProbabilisticSetup,
  probabilisticChoices,
  type ProbabilisticSetup,
} from '../cleanup/probabilistic';
import { MEDIA } from '../risk/form';
import { buildInputs } from '../risk/build';
import { loadChemicalDb } from '../risk/chemicalDb';
import { runRisk } from '../risk/compute';
import {
  EXPOSURE_DISPLAYS,
  EXPOSURE_MODEL_ID,
  exposureOutputs,
  exposureUncertainty,
} from '../risk/uncertaintySetup';
import {
  cleanupSettings,
  exposureSettings,
  runCleanupAnalysis,
  runExposureAnalysis,
  specFromSetup,
  type CleanupHooks,
  type CleanupRun,
  type CleanupSettings,
  type ExposureRun,
  type ExposureSettings,
  type RunHooks,
  type RunOutput,
} from '../uncertainty/headless';
import type { EditorSpec } from '../uncertainty/editor';
import type { PanelModel } from '../uncertainty/UncertaintyPanel';
import type { LegacyScenarioInput } from '@model-flow/engine';
import { feedOf } from './results';
import type { WellFeed } from '../transport/wellFeed';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { HouseholdRiskFeed } from '../household/feeds';
import type { ProduceRiskFeed } from '../plantsEco/feeds';

/**
 * Uncertainty results for the report (docs/DECISIONS.md, "Wave G slice G2"). A project saves the setup
 * and seed of each panel, never a run, so the report repeats a run from that setup only when the reader
 * asks for it. The runs are the screens' own (`uncertainty/headless.ts`): seeded, so the numbers match
 * the screen's, and the exposure sample goes through the same worker pool and run budget.
 */

export interface ExposurePlan {
  model: PanelModel<LegacyScenarioInput>;
  base: LegacyScenarioInput;
  output: RunOutput;
  spec: EditorSpec;
  settings: ExposureSettings;
  labels: Record<string, string>;
}

export interface CleanupPlan {
  setup: ProbabilisticSetup;
  spec: EditorSpec;
  settings: CleanupSettings;
  labels: Record<string, string>;
  label: string;
}

export interface UncertaintyPlan {
  exposure: ExposurePlan | null;
  cleanup: CleanupPlan | null;
  /** Why a panel has nothing to run, one sentence each. */
  notes: string[];
}

const labelsOf = (inputs: readonly UncertainInput<unknown>[]): Record<string, string> =>
  Object.fromEntries(inputs.map((u) => [u.id, u.label]));

const NOT_SAMPLED = 'no input has a distribution in the saved setup';

/**
 * What the saved setup of each uncertainty panel would run. A panel is skipped, with a note, when its
 * screen is not in use or cannot compute, when its setup is invalid, or when no input is sampled.
 */
export async function planUncertainty(project: Project): Promise<UncertaintyPlan> {
  const screens = screensOf(project);
  const setups = screens.uncertainty;
  const plan: UncertaintyPlan = { exposure: null, cleanup: null, notes: [] };
  let db;
  try {
    db = await loadChemicalDb();
  } catch (e) {
    plan.notes.push(
      `The chemical database did not load (${e instanceof Error ? e.message : String(e)}), so no uncertainty run was made.`,
    );
    return plan;
  }
  const feed = <T>(key: string): T | null => feedOf<T>(project, key);

  // Exposure panel: the legacy method's receptor factors.
  {
    const name = 'Exposure and risk';
    const built = buildInputs(
      screens.risk.form,
      db,
      feed<WellFeed>('well'),
      feed<VaporRiskFeed>('vaporRisk'),
      feed<SurfaceWaterFeed>('surfaceWater'),
      feed<HouseholdRiskFeed>('household'),
      feed<ProduceRiskFeed>('produce'),
    );
    const setup = setups.risk;
    if (Object.keys(setup.rows).length === 0) {
      // Nothing was set up on this panel; stay quiet unless the other panel has something.
    } else if (!built.ok) {
      plan.notes.push(
        `${name}: not run, the screen's inputs do not compute (${built.errors.join('; ')}).`,
      );
    } else if (!runRisk(built).legacy.ok) {
      plan.notes.push(`${name}: not run, the legacy method did not compute.`);
    } else {
      const base = built.legacy;
      const model = exposureUncertainty(base);
      const inputs = (model.uncertainInputs ?? []) as readonly UncertainInput<unknown>[];
      const spec = specFromSetup(inputs, setup, EXPOSURE_DISPLAYS);
      const outputs = exposureOutputs(base);
      const output = outputs.find((o) => o.id === setup.output) ?? outputs[0];
      const settings = exposureSettings(setup);
      if (!spec.ok) plan.notes.push(`${name}: not run, ${spec.issues.join('; ')}.`);
      else if (Object.keys(spec.distributions).length === 0)
        plan.notes.push(`${name}: not run, ${NOT_SAMPLED}.`);
      else if (!output) plan.notes.push(`${name}: not run, the scenario has no receptor.`);
      else if (!settings.ok) plan.notes.push(`${name}: not run, ${settings.error}`);
      else {
        plan.exposure = {
          model,
          base,
          output,
          spec,
          settings: settings.value,
          labels: labelsOf(inputs),
        };
      }
    }
  }

  // Cleanup panel: the probabilistic cleanup level of one chemical in one medium (direct source).
  {
    const name = 'Cleanup levels';
    const form = screens.cleanup.form;
    const setup = setups.cleanup;
    if (Object.keys(setup.rows).length === 0) {
      // Nothing was set up on this panel.
    } else if (form.source !== 'direct') {
      plan.notes.push(`${name}: not run, the probabilistic level samples a direct source only.`);
    } else {
      const built = buildCleanup(form, db);
      if (!built.ok) {
        plan.notes.push(
          `${name}: not run, the screen's inputs do not compute (${built.errors.join('; ')}).`,
        );
      } else if (!runCleanup(built).legacy.ok) {
        plan.notes.push(`${name}: not run, the legacy method did not compute.`);
      } else {
        const choices = probabilisticChoices(built.legacy);
        const choice =
          choices.find((c) => `${c.chemicalId}|${c.medium}` === setup.choice) ?? choices[0];
        if (!choice) {
          plan.notes.push(`${name}: not run, no pathway is switched on.`);
        } else {
          const ps = buildProbabilisticSetup(built.legacy, choice.chemicalId, choice.medium);
          if (!ps.ok) {
            plan.notes.push(`${name}: not run, ${ps.error}`);
          } else {
            const inputs = (ps.model.uncertainInputs ?? []) as readonly UncertainInput<unknown>[];
            const spec = specFromSetup(inputs, setup, ps.displays);
            const settings = cleanupSettings(setup);
            const chem = form.chemicals.find((c) => c.id === choice.chemicalId);
            const medium =
              MEDIA.find((m) => m.key === choice.medium)?.label.toLowerCase() ?? choice.medium;
            if (!spec.ok) plan.notes.push(`${name}: not run, ${spec.issues.join('; ')}.`);
            else if (Object.keys(spec.distributions).length === 0)
              plan.notes.push(`${name}: not run, ${NOT_SAMPLED}.`);
            else if (ps.deterministic === null)
              plan.notes.push(
                `${name}: not run, the target cannot be met for this chemical and medium.`,
              );
            else if (!settings.ok) plan.notes.push(`${name}: not run, ${settings.error}`);
            else {
              plan.cleanup = {
                setup: ps,
                spec,
                settings: settings.value,
                labels: labelsOf(inputs),
                label: `${chem?.name ?? choice.chemicalId} in ${medium}`,
              };
            }
          }
        }
      }
    }
  }
  return plan;
}

export interface UncertaintyReportRuns {
  exposure: ExposureRun | null;
  cleanup: (CleanupRun & { label: string; protection: number }) | null;
}

export type RunHooksAll = RunHooks & Pick<CleanupHooks, 'now' | 'yieldToUi'>;

/** Runs every panel the plan holds, the exposure sample on the worker pool, then the cleanup solve. */
export async function runUncertaintyPlan(
  plan: UncertaintyPlan,
  hooks: RunHooksAll = {},
): Promise<UncertaintyReportRuns> {
  const out: UncertaintyReportRuns = { exposure: null, cleanup: null };
  if (plan.exposure) {
    const p = plan.exposure;
    out.exposure = await runExposureAnalysis(
      {
        model: p.model,
        modelId: EXPOSURE_MODEL_ID,
        base: p.base,
        output: p.output,
        spec: p.spec,
        settings: p.settings,
        labels: p.labels,
      },
      hooks,
    );
  }
  if (plan.cleanup) {
    const p = plan.cleanup;
    const ran = await runCleanupAnalysis(p.setup, p.spec, p.settings, p.labels, {
      ...(hooks.now ? { now: hooks.now } : {}),
      ...(hooks.yieldToUi ? { yieldToUi: hooks.yieldToUi } : {}),
      ...(hooks.confirm ? { confirm: hooks.confirm } : {}),
    });
    out.cleanup = { ...ran, label: p.label, protection: p.settings.protection };
  }
  return out;
}
