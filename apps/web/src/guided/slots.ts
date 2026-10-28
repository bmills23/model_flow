import type { Feeds } from '../cleanup/modeledBuild';
import type { HouseholdRiskFeed } from '../household/feeds';
import type { ProduceRiskFeed } from '../plantsEco/feeds';
import type { FeedSlots } from '../project/feedSlots';
import type { SaturatedFeed } from '../saturated/feed';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import { toScenario as transportScenario } from '../transport/form';
import { buildTransportFeed } from '../transport/sendBuild';
import type { WellFeed } from '../transport/wellFeed';
import type { VadoseFeed } from '../vadose/feed';
import type { VaporRiskFeed } from '../vapor/feeds';
import { deriveChemical, runPlan, type ChemicalData } from './derive';
import type { GuidedOutputs, GuidedState } from './state';

/**
 * The step 3d outputs as the slots the risk and cleanup builders take (plan section 2): one value per
 * chemical, the same shape as the workbench's sent feeds, so `buildInputs` and `buildCleanup` read a guided
 * project with no change to their logic.
 */

/** One feed of the outputs as feed slots: the chemical's id to its value (not the hash envelope). */
export function outputSlots<T>(outputs: GuidedOutputs, feed: string): FeedSlots<T> {
  const slots = new Map<string, T>();
  for (const [chemical, o] of Object.entries(outputs[feed] ?? {}))
    slots.set(chemical, o.value as T);
  return slots;
}

/** The five feeds `buildInputs` (risk) reads, in the order and names of its arguments. */
export interface GuidedRiskFeeds {
  well: FeedSlots<WellFeed>;
  vapor: FeedSlots<VaporRiskFeed>;
  surface: FeedSlots<SurfaceWaterFeed>;
  household: FeedSlots<HouseholdRiskFeed>;
  produce: FeedSlots<ProduceRiskFeed>;
}

export function riskFeeds(outputs: GuidedOutputs): GuidedRiskFeeds {
  return {
    well: outputSlots<WellFeed>(outputs, 'well'),
    vapor: outputSlots<VaporRiskFeed>(outputs, 'vaporRisk'),
    surface: outputSlots<SurfaceWaterFeed>(outputs, 'surfaceWater'),
    household: outputSlots<HouseholdRiskFeed>(outputs, 'household'),
    produce: outputSlots<ProduceRiskFeed>(outputs, 'produce'),
  };
}

/**
 * The upstream runs the modeled cleanup build reads for one chemical (`buildModeledRows`' `feedsOf`). The
 * transport scenario is derived from the chemical's guided transport form, fed by its vadose or saturated
 * output as the Run feeds it, so it needs no session-only groundwater run and works after a reload. A
 * missing piece is null, which the build reports in its own words.
 */
export function cleanupFeedsOf(
  guided: GuidedState,
  chemicals: readonly ChemicalData[],
): (chemicalId: string) => Feeds {
  const plan = runPlan(guided);
  const vadose = outputSlots<VadoseFeed>(guided.outputs, 'vadose');
  const saturated = outputSlots<SaturatedFeed>(guided.outputs, 'saturated');
  return (id) => {
    const v = vadose.get(id) ?? null;
    const s = saturated.get(id) ?? null;
    const chem = chemicals.find((c) => c.id === id);
    if (plan === null || plan.problems.length > 0 || chem === undefined) {
      return { transport: null, vadose: v, saturated: s };
    }
    const form = deriveChemical(guided, plan, chem).forms.transport;
    if (form === undefined) return { transport: null, vadose: v, saturated: s };
    const parsed = transportScenario(form, v, s);
    return {
      transport: parsed.ok
        ? buildTransportFeed({
            scenario: parsed.scenario,
            timeYr: form.timeYr,
            rx: form.rx,
            chemicalId: id,
          })
        : null,
      vadose: v,
      saturated: s,
    };
  };
}
