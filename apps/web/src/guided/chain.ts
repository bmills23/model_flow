import type { GuidedFormKey, GuidedSite, ModeledSourceKey, SourceValueKey } from './state';

/**
 * The step 2 chain: which models the step 3d Run walks for a set of site answers, the source each path
 * takes, the output slots that result, and the problems and notes step 2 explains. Pure: it reads the
 * answers only. One source per path in this wave; a second source on the well path arrives later.
 */

export type ChainPathId = 'leaching' | 'well' | 'building' | 'stream' | 'produce' | 'ecological';

export type ChainProblemId =
  | 'no-source'
  | 'no-path'
  | 'leaching-needs-soil-above'
  | 'well-needs-source'
  | 'stream-needs-source'
  | 'building-needs-source'
  | 'two-well-sources'
  | 'produce-soil-needs-soil'
  | 'produce-irrigation-needs-well'
  | 'eco-medium-unsupported';

export interface ChainProblem {
  id: ChainProblemId;
  message: string;
}

/** One line of the side panel: a path, the source it takes, and the models and outputs it adds. */
export interface ChainPath {
  path: ChainPathId;
  label: string;
  /** The source the path starts from; null when the 3b values are the exposure concentrations. */
  source: SourceValueKey | null;
  sourceLabel: string;
  models: GuidedFormKey[];
  outputs: string[];
}

export interface Chain {
  problems: ChainProblem[];
  notes: string[];
  /** The models the Run walks, in run order. Empty when there is a problem or the values are measured. */
  models: GuidedFormKey[];
  /** The output slots (feed keys) the Run writes per chemical. */
  outputs: string[];
  paths: ChainPath[];
  /** The 3b source media that need a value for every chemical. */
  valuesNeeded: SourceValueKey[];
}

export const SOURCE_LABELS: Record<SourceValueKey, string> = {
  soilAbove: 'Soil above the water table',
  groundwater: 'Groundwater',
  soilGas: 'Soil gas',
  soilBelow: 'Soil below the water table',
  soil: 'Soil',
  surfaceWater: 'Surface water',
  indoorAir: 'Indoor air',
  outdoorAir: 'Outdoor air',
};

const lower = (k: SourceValueKey): string => SOURCE_LABELS[k].toLowerCase();

/** The run order of the models. */
const ORDER: readonly GuidedFormKey[] = [
  'vadose',
  'saturated',
  'transport',
  'vapor',
  'surfaceWater',
  'household',
  'plantsEco',
];

/** Indoor air takes its source in this order (soil gas first: it measures the pore space itself). */
const BUILDING_PRECEDENCE: readonly ModeledSourceKey[] = [
  'soilGas',
  'soilAbove',
  'soilBelow',
  'groundwater',
];

const sorted = (models: Iterable<GuidedFormKey>): GuidedFormKey[] => {
  const set = new Set(models);
  return ORDER.filter((m) => set.has(m));
};

const empty = (problems: ChainProblem[], notes: string[]): Chain => ({
  problems,
  notes,
  models: [],
  outputs: [],
  paths: [],
  valuesNeeded: [],
});

function measuredChain(site: GuidedSite): Chain {
  const problems: ChainProblem[] = [];
  const notes: string[] = [];
  const human = site.receptors === 'human';
  const media = site.measured;
  if (media.length === 0) {
    problems.push({
      id: 'no-source',
      message:
        'Tick at least one medium you measured. Step 3 asks for a concentration in each ticked medium.',
    });
  }
  if (human && site.produce === 'soil' && !media.includes('soil')) {
    problems.push({
      id: 'produce-soil-needs-soil',
      message:
        'Produce from soil needs a measured soil concentration. Tick soil, or switch the produce source.',
    });
  }
  if (human && site.produce === 'irrigation' && !media.includes('groundwater')) {
    problems.push({
      id: 'produce-irrigation-needs-well',
      message:
        'Produce from irrigation water needs a measured groundwater concentration. Tick groundwater, or switch the produce source.',
    });
  }
  if (!human && media.length > 0 && !media.includes('soil') && !media.includes('surfaceWater')) {
    problems.push({
      id: 'eco-medium-unsupported',
      message:
        'Ecological screening compares a soil or a surface water concentration with ecological benchmarks. Tick soil or surface water, or switch the receptors to human.',
    });
  }
  if (problems.length > 0) return empty(problems, notes);

  notes.push(
    site.location === 'downgradient'
      ? 'Entering concentrations directly: the exposure point does not change a measured value, so enter the concentration measured at the exposure point.'
      : 'Entering concentrations directly: enter the concentration measured at the exposure point.',
  );
  if (!human && site.produce !== 'none') {
    notes.push(
      'Homegrown produce is a human pathway, so the produce choice is not used for ecological receptors.',
    );
  }
  const models: GuidedFormKey[] = [];
  const outputs: string[] = [];
  const paths: ChainPath[] = [];
  if (human && site.produce !== 'none') {
    models.push('plantsEco');
    outputs.push('produce');
    const src: SourceValueKey = site.produce === 'soil' ? 'soil' : 'groundwater';
    paths.push({
      path: 'produce',
      label: 'Homegrown produce',
      source: src,
      sourceLabel: SOURCE_LABELS[src],
      models: ['plantsEco'],
      outputs: ['produce'],
    });
  }
  return {
    problems,
    notes,
    models: sorted(models),
    outputs,
    paths,
    valuesNeeded: [...media],
  };
}

export function chain(site: GuidedSite): Chain {
  if (site.basis === 'measured') return measuredChain(site);

  const problems: ChainProblem[] = [];
  const notes: string[] = [];
  const has = (k: ModeledSourceKey): boolean => site.sources.includes(k);
  const human = site.receptors === 'human';
  const { leaching, well, building, stream } = site.paths;

  if (site.sources.length === 0) {
    problems.push({
      id: 'no-source',
      message: 'Tick at least one source. The models start from the contamination you tick here.',
    });
  }
  if (site.sources.length > 0 && !leaching && !well && !building && !stream) {
    problems.push({
      id: 'no-path',
      message:
        'Tick at least one path to follow: leaching to groundwater, a well, a building or a stream.',
    });
  }
  if (leaching && !has('soilAbove')) {
    problems.push({
      id: 'leaching-needs-soil-above',
      message:
        'Leaching to groundwater starts from soil above the water table. Tick that source, or untick the leaching path.',
    });
  }

  // What can feed the groundwater transport run: groundwater itself, soil below the water table, or soil
  // above it by way of the leaching path.
  const wellSources: ModeledSourceKey[] = [];
  if (has('groundwater')) wellSources.push('groundwater');
  if (has('soilBelow')) wellSources.push('soilBelow');
  if (has('soilAbove') && leaching) wellSources.push('soilAbove');
  const wellLike = well || stream;
  if (wellLike && wellSources.length === 0 && site.sources.length > 0) {
    const id = well ? 'well-needs-source' : 'stream-needs-source';
    const what = well ? 'A well' : 'A stream';
    problems.push({
      id,
      message: `${what} needs a source that reaches groundwater: groundwater, soil below the water table, or soil above the water table with the leaching path ticked. None of those is ticked.`,
    });
  }
  if (wellLike && wellSources.length > 1) {
    problems.push({
      id: 'two-well-sources',
      message: `Groundwater transport can start from one source at a time for now, and ${wellSources
        .map(lower)
        .join(
          ' and ',
        )} would both feed it. Untick all but one, or untick the leaching path if the soil should not feed the well.`,
    });
  }
  const buildingSource = building ? BUILDING_PRECEDENCE.find(has) : undefined;
  if (building && buildingSource === undefined && site.sources.length > 0) {
    problems.push({
      id: 'building-needs-source',
      message: 'A building needs a source to take vapor from. Tick a source.',
    });
  }

  if (human && site.produce === 'soil' && !has('soilAbove')) {
    problems.push({
      id: 'produce-soil-needs-soil',
      message:
        'Produce from soil needs soil above the water table as a source. Tick it, or switch the produce source.',
    });
  }
  if (human && site.produce === 'irrigation' && !well) {
    problems.push({
      id: 'produce-irrigation-needs-well',
      message:
        'Produce from irrigation water takes its water from a well. Tick the well path, or switch the produce source.',
    });
  }
  if (!human && !has('soilAbove') && !stream) {
    problems.push({
      id: 'eco-medium-unsupported',
      message:
        'Ecological screening compares soil or stream water with ecological benchmarks. Tick soil above the water table or the stream path, or switch the receptors to human.',
    });
  }
  if (problems.length > 0) return empty(problems, notes);

  const models = new Set<GuidedFormKey>();
  const outputs = new Set<string>();
  const needed = new Set<SourceValueKey>();
  const paths: ChainPath[] = [];
  const add = (
    path: ChainPathId,
    label: string,
    source: SourceValueKey | null,
    ms: GuidedFormKey[],
    os: string[],
  ): void => {
    ms.forEach((m) => models.add(m));
    os.forEach((o) => outputs.add(o));
    if (source !== null) needed.add(source);
    paths.push({
      path,
      label,
      source,
      sourceLabel: source === null ? 'Another path' : SOURCE_LABELS[source],
      models: sorted(ms),
      outputs: os,
    });
  };

  if (leaching) add('leaching', 'Leaching to groundwater', 'soilAbove', ['vadose'], ['vadose']);

  const wellSource = wellSources[0];
  let transportRuns = false;
  if (wellLike && wellSource !== undefined) {
    transportRuns = true;
    if (wellSource === 'soilAbove') {
      // The vadose run feeds transport; the vadose model is already part of the leaching path.
      models.add('vadose');
      outputs.add('vadose');
    }
    const ms: GuidedFormKey[] = ['transport'];
    if (wellSource === 'soilBelow') ms.push('saturated');
    const os = wellSource === 'soilBelow' ? ['saturated', 'well'] : ['well'];
    if (well) add('well', 'Well', wellSource, ms, os);
    else {
      ms.forEach((m) => models.add(m));
      os.forEach((o) => outputs.add(o));
      needed.add(wellSource);
    }
  }
  if (stream) {
    add(
      'stream',
      'Stream',
      wellSource ?? null,
      ['transport', 'surfaceWater'],
      ['bank', 'surfaceWater'],
    );
  }

  if (building && buildingSource !== undefined) {
    const ms: GuidedFormKey[] = ['vapor'];
    const os: string[] = ['vaporRisk'];
    if (buildingSource === 'soilBelow') {
      ms.push('saturated');
      os.unshift('vaporSaturated');
    }
    if (buildingSource === 'groundwater' && site.location === 'downgradient') {
      ms.push('transport');
      os.unshift('vaporWaterTable');
      transportRuns = true;
    }
    add('building', 'Building', buildingSource, ms, os);
    if (buildingSource !== 'groundwater' && site.location === 'downgradient') {
      notes.push(
        'Vapor intrusion is modeled beneath the building, so its exposure point is onsite; the downgradient choice does not apply to it.',
      );
    }
  }

  if (human && site.produce !== 'none') {
    const src: SourceValueKey = site.produce === 'soil' ? 'soilAbove' : 'groundwater';
    add(
      'produce',
      'Homegrown produce',
      site.produce === 'soil' ? src : (wellSource ?? null),
      ['plantsEco'],
      ['produce'],
    );
  }
  if (human && transportRuns && outputs.has('well')) {
    // Shower and irrigation read the well series.
    const p = paths.find((x) => x.path === 'well');
    models.add('household');
    outputs.add('household');
    if (p) {
      p.models = sorted([...p.models, 'household']);
      p.outputs = [...p.outputs, 'household'];
    } else {
      add('well', 'Well', wellSource ?? null, ['household'], ['household']);
    }
  }
  if (!human) {
    models.add('plantsEco');
    add(
      'ecological',
      'Ecological screening',
      has('soilAbove') ? 'soilAbove' : null,
      ['plantsEco'],
      [],
    );
    if (site.produce !== 'none') {
      notes.push(
        'Homegrown produce is a human pathway, so the produce choice is not used for ecological receptors.',
      );
    }
  }

  return {
    problems,
    notes,
    models: sorted(models),
    outputs: [...outputs],
    paths,
    valuesNeeded: [...needed],
  };
}
