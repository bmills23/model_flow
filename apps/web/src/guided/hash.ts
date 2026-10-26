import { fingerprintForm, hashInputs } from '../project/hash';
import type { GuidedFormKey, GuidedState } from './state';
import {
  deriveChemical,
  runPlan,
  type ChemicalData,
  type DerivedChemical,
  type RunPlan,
} from './derive';

/**
 * The step 3d re-run marks (plan section 1): a hash per chemical and model over what that model's run
 * reads, which is its derived form (through `fingerprintForm`, as the workbench stale marks take it), the
 * run settings it reads that are not on the form, and the hash of the model that feeds it. An output
 * records its model's hash at Run and is current while the live hash is the same, so an edit marks exactly
 * the outputs that read it, and everything downstream of them.
 */

/** Hashes by feed key, then chemical id. */
export type OutputHashes = Record<string, Record<string, string>>;

/** The model that writes each output. */
export const OUTPUT_MODEL: Readonly<Record<string, GuidedFormKey>> = {
  vadose: 'vadose',
  saturated: 'saturated',
  vaporSaturated: 'saturated',
  well: 'transport',
  bank: 'transport',
  vaporWaterTable: 'transport',
  vaporRisk: 'vapor',
  surfaceWater: 'surfaceWater',
  household: 'household',
  produce: 'plantsEco',
};

/** The model whose result a model reads, under this plan, or null. */
function upstreamOf(m: GuidedFormKey, plan: RunPlan): GuidedFormKey | null {
  switch (m) {
    case 'transport':
      return plan.transportSource === 'soilAbove'
        ? 'vadose'
        : plan.transportSource === 'soilBelow'
          ? 'saturated'
          : null;
    case 'vapor':
      if (plan.buildingSource === 'soilBelow') return 'saturated';
      return plan.buildingSource === 'groundwater' && plan.downgradient ? 'transport' : null;
    case 'surfaceWater':
    case 'household':
      return 'transport';
    default:
      return null;
  }
}

/** What a model reads that its form does not hold. */
function extrasOf(m: GuidedFormKey, plan: RunPlan, d: DerivedChemical): unknown {
  const s = plan.settings;
  switch (m) {
    case 'transport':
      return { nCurve: s.nCurve, method: s.basis, source: plan.transportSource };
    case 'saturated':
      return { method: s.basis };
    case 'vapor':
      // the feed label carries the chemical's name; the source series wiring is part of the run
      return { name: d.chemicalName, source: plan.buildingSource, downgradient: plan.downgradient };
    case 'surfaceWater':
      return { method: s.surfaceMethod };
    default:
      return null;
  }
}

/** The live hash of each output the plan writes, for one derived chemical. */
export function chemicalHashes(plan: RunPlan, d: DerivedChemical): Record<string, string> {
  const byModel = new Map<GuidedFormKey, string>();
  const hashOf = (m: GuidedFormKey): string => {
    const known = byModel.get(m);
    if (known !== undefined) return known;
    const up = upstreamOf(m, plan);
    const h = hashInputs({
      model: m,
      chemicalId: d.chemicalId,
      form: fingerprintForm(m, d.forms[m] ?? null),
      extras: extrasOf(m, plan, d),
      upstream: up === null ? null : hashOf(up),
    });
    byModel.set(m, h);
    return h;
  };
  const out: Record<string, string> = {};
  for (const feed of plan.outputs) {
    const m = OUTPUT_MODEL[feed];
    if (m !== undefined) out[feed] = hashOf(m);
  }
  return out;
}

/** The live hashes of every output the chain chooses, for every project chemical; empty while step 2 has a problem. */
export function outputHashes(guided: GuidedState, chemicals: readonly ChemicalData[]): OutputHashes {
  const plan = runPlan(guided);
  if (plan === null) return {};
  const out: OutputHashes = {};
  for (const c of chemicals) {
    const hashes = chemicalHashes(plan, deriveChemical(guided, plan, c));
    for (const [feed, h] of Object.entries(hashes)) (out[feed] ??= {})[c.id] = h;
  }
  return out;
}
