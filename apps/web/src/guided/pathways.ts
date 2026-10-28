import { PATHWAY_IDS, PATHWAYS, type Medium, type PathwayId } from '@model-flow/engine';
import { PATHWAY_LABELS } from '../risk/chartData';
import { chain } from './chain';
import type { GuidedState } from './state';

/**
 * Step 4a: which exposure pathways the step 2 answers allow, and which are ticked. A pathway is available
 * when the chain gives it a concentration (a measured medium, or a model output); an unavailable one is off
 * and carries the reason in plain words. Available pathways start ticked: `exposure.pathways` holds only the
 * ticks the user changed, and an absent entry means ticked. Pure: it reads the answers only.
 */

export interface PathwayStatus {
  id: PathwayId;
  label: string;
  medium: Medium;
  /** The chain gives the pathway a concentration. */
  available: boolean;
  /** Why an unavailable pathway is off; null when it is available. */
  reason: string | null;
  /** Available and not unticked by the user. */
  on: boolean;
}

/** What each pathway reads from a measured project: the 3b medium, or null when only a model gives it. */
const MEASURED_MEDIUM: Partial<
  Record<PathwayId, 'soil' | 'groundwater' | 'indoorAir' | 'outdoorAir' | 'surfaceWater'>
> = {
  soilIngestion: 'soil',
  soilDermal: 'soil',
  waterIngestion: 'groundwater',
  waterDermal: 'groundwater',
  indoorInhalation: 'indoorAir',
  outdoorInhalation: 'outdoorAir',
  swimIngestion: 'surfaceWater',
  swimDermal: 'surfaceWater',
};

const MEASURED_WORDS = {
  soil: ['Soil contact', 'soil'],
  groundwater: ['Drinking and bathing water', 'groundwater'],
  indoorAir: ['Indoor air', 'indoor air'],
  outdoorAir: ['Outdoor air', 'outdoor air'],
  surfaceWater: ['Swimming', 'surface water'],
} as const;

/** The output slot of the chain that gives a modeled pathway its concentration. */
const MODEL_OUTPUT: Partial<Record<PathwayId, string>> = {
  waterIngestion: 'well',
  waterDermal: 'well',
  showerInhalation: 'household',
  indoorInhalation: 'vaporRisk',
  outdoorInhalation: 'vaporRisk',
  swimIngestion: 'surfaceWater',
  swimDermal: 'surfaceWater',
  produce: 'produce',
};

const MODEL_REASON: Partial<Record<PathwayId, string>> = {
  waterIngestion:
    'Drinking and bathing water need a well that a source reaches. Tick the well path in step 2.',
  waterDermal:
    'Drinking and bathing water need a well that a source reaches. Tick the well path in step 2.',
  showerInhalation:
    'Shower air comes from the shower and irrigation model, which needs the well path in step 2.',
  indoorInhalation: 'Indoor air needs the building path in step 2.',
  outdoorInhalation:
    'Outdoor air comes from the indoor air model, so it needs the building path in step 2.',
  swimIngestion: 'Swimming needs the stream path in step 2.',
  swimDermal: 'Swimming needs the stream path in step 2.',
  produce: 'Homegrown produce needs the produce choice in step 2.',
};

const SOIL_REASON =
  'Homegrown produce is driven by a soil concentration, and the answers in step 2 give none. Tick soil above the water table (or measured soil) in step 2.';

const fieldOf = (value: unknown, field: string): unknown =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[field]
    : undefined;

/** True when the Run wrote this chemical's output of a feed and it holds no value for the field. */
export function outputLacks(
  g: GuidedState,
  feed: string,
  chemicalId: string,
  field: string,
): boolean {
  const slot = g.outputs[feed]?.[chemicalId];
  return slot !== undefined && fieldOf(slot.value, field) === undefined;
}

/** True when the Run wrote the feed for some chemical and none of them holds a value for the field. */
function everyOutputLacks(g: GuidedState, feed: string, field: string): boolean {
  const ids = Object.keys(g.outputs[feed] ?? {});
  return ids.length > 0 && ids.every((id) => outputLacks(g, feed, id, field));
}

/** The reason a pathway is ruled out, or null when it is available. */
function ruledOut(g: GuidedState, id: PathwayId, outputs: readonly string[]): string | null {
  const site = g.site;
  if (site.receptors === 'ecological') {
    return 'Ecological receptors are screened against benchmarks, not human exposure pathways (step 2).';
  }
  if (outputsProblem(g)) {
    return 'Step 2 has a problem to fix first, so no pathway can be offered yet.';
  }
  const measured = site.basis === 'measured';
  if (id === 'produce') {
    if (!outputs.includes('produce')) return MODEL_REASON.produce ?? null;
    const hasSoil = measured ? site.measured.includes('soil') : site.sources.includes('soilAbove');
    return hasSoil ? null : SOIL_REASON;
  }
  if (measured) {
    const medium = MEASURED_MEDIUM[id];
    if (medium === undefined) {
      return 'Shower air comes from the shower and irrigation model, which needs modeled concentrations. Switch step 2 to modeled sources to use it.';
    }
    if (site.measured.includes(medium)) return null;
    const [what, word] = MEASURED_WORDS[medium];
    return `${what} needs a measured ${word} concentration. Tick ${word} in step 2.`;
  }
  const soilPath = PATHWAYS[id].medium === 'soil';
  if (soilPath) {
    if (!site.sources.includes('soilAbove')) {
      return 'Soil contact needs soil above the water table as a source. Tick it in step 2.';
    }
    if (site.location === 'downgradient') {
      return 'The receptor is downgradient of the source (step 2), so it does not contact the source soil.';
    }
    return null;
  }
  const out = MODEL_OUTPUT[id];
  if (out !== undefined && outputs.includes(out)) {
    // the models decide what they give: the indoor air model gives outdoor air for some sources only
    if (id === 'outdoorInhalation' && everyOutputLacks(g, 'vaporRisk', 'outdoor')) {
      return 'The indoor air model gave no outdoor air for this source, so outdoor air has no concentration.';
    }
    if (id === 'showerInhalation' && everyOutputLacks(g, 'household', 'bathroomAir')) {
      return 'The shower and irrigation model gave no shower air for this chemical, so shower inhalation has no concentration.';
    }
    return null;
  }
  return MODEL_REASON[id] ?? 'Step 2 gives this pathway no concentration.';
}

const outputsProblem = (g: GuidedState): boolean => chain(g.site).problems.length > 0;

/** Every pathway with its availability, reason and tick, in the engine's order. */
export function pathwayStatuses(guided: GuidedState): PathwayStatus[] {
  const outputs = chain(guided.site).outputs;
  return PATHWAY_IDS.map((id): PathwayStatus => {
    const reason = ruledOut(guided, id, outputs);
    const available = reason === null;
    return {
      id,
      label: PATHWAY_LABELS[id],
      medium: PATHWAYS[id].medium,
      available,
      reason,
      on: available && guided.exposure.pathways[id] !== false,
    };
  });
}

/** The effective tick of every pathway: available and not unticked. */
export function pathwaysOn(guided: GuidedState): Record<PathwayId, boolean> {
  return Object.fromEntries(pathwayStatuses(guided).map((p) => [p.id, p.on])) as Record<
    PathwayId,
    boolean
  >;
}
