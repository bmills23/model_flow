import {
  PATHWAYS,
  resolveRiskTargets,
  runLegacyScenario,
  runProbabilisticCleanup,
  solveSourceLevel,
  type CleanupResult,
  type CleanupSpec,
  type Distribution,
  type LegacyScenarioInput,
  type LegacyScenarioReceptor,
  type Medium,
  type PathwayId,
  type SolveInput,
} from '@model-flow/engine';
import type { UnitDisplay } from '../uncertainty/DistributionEditor';
import type { PanelModel } from '../uncertainty/UncertaintyPanel';
import { exposureUncertainty, EXPOSURE_DISPLAYS } from '../risk/uncertaintySetup';
import { FROM_SI, MEDIUM_UNIT, type CleanupLegacyInput } from './build';

/**
 * Probabilistic cleanup levels on the cleanup screen (docs/methods/uncertainty.md, "Probabilistic
 * cleanup levels"). A direct-pathway level of one chemical in one source medium is solved per sampled
 * set of receptor factors with the M5 root finder: the metric of a source concentration C is the
 * largest of the cancer risk over its target and the hazard index over its target (and, for two
 * additive receptors, the summed risk over its target), so the root is the lowest of the cancer and
 * noncancer levels exactly as the closed-form back-calculation takes it. Modeled sources are not
 * sampled: the transport methods declare no uncertain inputs yet.
 */

export interface ProbabilisticChoice {
  chemicalId: string;
  medium: Medium;
}

/** The chemical and medium pairs with at least one switched-on pathway of that medium. */
export function probabilisticChoices(input: CleanupLegacyInput): ProbabilisticChoice[] {
  const media = new Set<Medium>();
  for (const r of input.receptors) for (const p of r.pathways) media.add(PATHWAYS[p].medium);
  return input.chemicals.flatMap((c) => [...media].map((medium) => ({ chemicalId: c.id, medium })));
}

export interface ProbabilisticSetup {
  ok: true;
  chemicalId: string;
  medium: Medium;
  /** Screen unit of the medium (mg/kg, mg/L or mg/m3) and the factor from SI to it. */
  unit: string;
  fromSi: number;
  model: PanelModel<LegacyScenarioInput>;
  base: LegacyScenarioInput;
  displays: Record<string, UnitDisplay>;
  problem: (input: LegacyScenarioInput) => SolveInput;
  /** The level of the point-value inputs, SI; null when the target is not reachable. */
  deterministic: number | null;
}

export type ProbabilisticBuild = ProbabilisticSetup | { ok: false; error: string };

/** The scenario holding one chemical at concentration `c` (SI) in every pathway of one medium. */
function scenarioAt(
  input: CleanupLegacyInput,
  chemicalId: string,
  medium: Medium,
  c: number,
): LegacyScenarioInput {
  const chem = input.chemicals.find((x) => x.id === chemicalId);
  if (!chem) throw new RangeError(`${chemicalId} is not in the scenario`);
  const receptors: LegacyScenarioReceptor[] = [];
  for (const r of input.receptors) {
    const pathways = r.pathways.filter((p: PathwayId) => PATHWAYS[p].medium === medium);
    if (pathways.length === 0) continue;
    const epcs: LegacyScenarioReceptor['chemicals'][number]['epcs'] = {};
    for (const p of pathways) epcs[p] = { kind: 'constant', value: c, origin: 'entered' };
    receptors.push({
      label: r.label,
      receptor: r.receptor,
      pathways,
      chemicals: [{ id: chem.id, chemical: chem.chemical, epcs }],
      ...(r.routeExtrapolation !== undefined ? { routeExtrapolation: r.routeExtrapolation } : {}),
    });
  }
  return {
    receptors,
    ...(input.additive === true && receptors.length === 2 ? { additive: true } : {}),
  };
}

export function buildProbabilisticSetup(
  input: CleanupLegacyInput,
  chemicalId: string,
  medium: Medium,
): ProbabilisticBuild {
  let base: LegacyScenarioInput;
  const reference = 1 / FROM_SI(medium);
  try {
    base = scenarioAt(input, chemicalId, medium, reference);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (base.receptors.length === 0) {
    return { ok: false, error: 'No receptor has a pathway switched on for that medium.' };
  }
  const { risk, hq } = resolveRiskTargets(input.targets);
  const names = new Map(base.receptors.map((r, i) => [i, r.label]));
  const inner = exposureUncertainty(base);
  const model: PanelModel<LegacyScenarioInput> = {
    run: inner.run,
    uncertainInputs: (inner.uncertainInputs ?? []).map((u) => {
      const m = /^exposure\.receptor(\d+)\./.exec(u.id);
      const name = m ? names.get(Number(m[1])) : undefined;
      return name === undefined ? u : { ...u, label: u.label.replace(/^Receptor \d+/, name) };
    }),
  };
  const problem = (scenario: LegacyScenarioInput): SolveInput => ({
    reference,
    target: 1,
    metric: (c) => {
      const s = runLegacyScenario({
        ...scenario,
        receptors: scenario.receptors.map((r) => ({
          ...r,
          chemicals: r.chemicals.map((x) => ({
            ...x,
            epcs: Object.fromEntries(
              r.pathways.map((p) => [p, { kind: 'constant', value: c, origin: 'entered' }]),
            ),
          })),
        })),
      }).summary;
      let m = 0;
      for (const r of s.receptors) m = Math.max(m, r.cancerRisk / risk, r.hi / hq);
      if (s.additiveCancerRisk !== null) m = Math.max(m, s.additiveCancerRisk / risk);
      return m;
    },
  });
  let deterministic: number | null;
  try {
    deterministic = solveSourceLevel(problem(base)).level;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return {
    ok: true,
    chemicalId,
    medium,
    unit: MEDIUM_UNIT(medium),
    fromSi: FROM_SI(medium),
    model,
    base,
    displays: EXPOSURE_DISPLAYS,
    problem,
    deterministic,
  };
}

export interface ProbabilisticOptions {
  distributions: Record<string, Distribution>;
  correlation?: { ids: string[]; matrix: number[][] };
  n?: number;
  seed?: string;
  protection?: number;
}

/** Sample, solve per iteration and summarise (engine E6). SI levels in the result. */
export function runCleanupProbabilistic(
  setup: ProbabilisticSetup,
  opts: ProbabilisticOptions,
): CleanupResult {
  const spec: CleanupSpec<LegacyScenarioInput> = {
    model: setup.model,
    base: setup.base,
    distributions: opts.distributions,
    problem: setup.problem,
    ...(opts.correlation ? { correlation: opts.correlation } : {}),
    ...(opts.n !== undefined ? { n: opts.n } : {}),
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
    ...(opts.protection !== undefined ? { protection: opts.protection } : {}),
  };
  return runProbabilisticCleanup(spec);
}
