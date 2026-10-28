import { describe, expect, it } from 'vitest';
import { chain } from './chain';
import { defaultGuidedSite, type GuidedSite, type ModeledSourceKey } from './state';

const modeled = (
  sources: ModeledSourceKey[],
  paths: Partial<GuidedSite['paths']>,
  extra: Partial<GuidedSite> = {},
): GuidedSite => ({
  ...defaultGuidedSite(),
  basis: 'modeled',
  sources,
  paths: { leaching: false, well: false, building: false, stream: false, ...paths },
  ...extra,
});

const ids = (c: ReturnType<typeof chain>) => c.problems.map((p) => p.id);

describe('chain: measured at the receptor', () => {
  it('runs no model and writes no output', () => {
    const c = chain({
      ...defaultGuidedSite(),
      basis: 'measured',
      measured: ['soil', 'groundwater'],
    });
    expect(c.problems).toEqual([]);
    expect(c.models).toEqual([]);
    expect(c.outputs).toEqual([]);
    expect(c.valuesNeeded).toEqual(['soil', 'groundwater']);
    expect(c.notes[0]).toMatch(/measured at the exposure point/);
  });
  it('asks for a medium when none is ticked', () => {
    const c = chain({ ...defaultGuidedSite(), basis: 'measured', measured: [] });
    expect(ids(c)).toEqual(['no-source']);
  });
  it('says the downgradient choice does not change a measured value', () => {
    const c = chain({
      ...defaultGuidedSite(),
      basis: 'measured',
      measured: ['soil'],
      location: 'downgradient',
    });
    expect(c.notes[0]).toMatch(/does not change a measured value/);
  });
  it('checks produce against the measured media', () => {
    const base = { ...defaultGuidedSite(), basis: 'measured' as const };
    expect(ids(chain({ ...base, measured: ['groundwater'], produce: 'soil' }))).toEqual([
      'produce-soil-needs-soil',
    ]);
    expect(ids(chain({ ...base, measured: ['soil'], produce: 'irrigation' }))).toEqual([
      'produce-irrigation-needs-well',
    ]);
    const ok = chain({ ...base, measured: ['soil'], produce: 'soil' });
    expect(ok.models).toEqual(['plantsEco']);
    expect(ok.outputs).toEqual(['produce']);
  });
  it('supports ecological receptors on soil or surface water only', () => {
    const base = {
      ...defaultGuidedSite(),
      basis: 'measured' as const,
      receptors: 'ecological' as const,
    };
    expect(ids(chain({ ...base, measured: ['groundwater'] }))).toEqual(['eco-medium-unsupported']);
    expect(chain({ ...base, measured: ['surfaceWater'] }).problems).toEqual([]);
  });
});

describe('chain: each row of the site model table', () => {
  it('soil above with leaching runs vadose leaching', () => {
    const c = chain(modeled(['soilAbove'], { leaching: true }));
    expect(c.problems).toEqual([]);
    expect(c.models).toEqual(['vadose']);
    expect(c.outputs).toEqual(['vadose']);
  });
  it('leaching and well run transport fed from the vadose run', () => {
    const c = chain(modeled(['soilAbove'], { leaching: true, well: true }));
    expect(c.models).toEqual(['vadose', 'transport', 'household']);
    expect(c.outputs).toEqual(expect.arrayContaining(['vadose', 'well', 'household']));
    expect(c.paths.find((p) => p.path === 'well')?.source).toBe('soilAbove');
  });
  it('groundwater with a well runs transport from the 3b value', () => {
    const c = chain(modeled(['groundwater'], { well: true }));
    expect(c.models).toEqual(['transport', 'household']);
    expect(c.outputs).toEqual(['well', 'household']);
    expect(c.valuesNeeded).toEqual(['groundwater']);
  });
  it('soil below the water table runs the saturated source then transport', () => {
    const c = chain(modeled(['soilBelow'], { well: true }));
    expect(c.models).toEqual(['saturated', 'transport', 'household']);
    expect(c.outputs).toEqual(expect.arrayContaining(['saturated', 'well']));
  });
  it('a building takes the source by precedence, soil gas first', () => {
    const all: ModeledSourceKey[] = ['groundwater', 'soilBelow', 'soilAbove', 'soilGas'];
    const pick = (sources: ModeledSourceKey[]) =>
      chain(modeled(sources, { building: true })).paths[0]?.source;
    expect(pick(all)).toBe('soilGas');
    expect(pick(['groundwater', 'soilBelow', 'soilAbove'])).toBe('soilAbove');
    expect(pick(['groundwater', 'soilBelow'])).toBe('soilBelow');
    expect(pick(['groundwater'])).toBe('groundwater');
  });
  it('building with soil gas or soil above reads the 3b value and writes vaporRisk', () => {
    for (const s of ['soilGas', 'soilAbove'] as const) {
      const c = chain(modeled([s], { building: true }));
      expect(c.models).toEqual(['vapor']);
      expect(c.outputs).toEqual(['vaporRisk']);
    }
  });
  it('building with groundwater: downgradient runs the water table, onsite does not', () => {
    const down = chain(modeled(['groundwater'], { building: true }, { location: 'downgradient' }));
    expect(down.models).toEqual(['transport', 'vapor']);
    expect(down.outputs).toEqual(['vaporWaterTable', 'vaporRisk']);
    const on = chain(modeled(['groundwater'], { building: true }, { location: 'onsite' }));
    expect(on.models).toEqual(['vapor']);
    expect(on.outputs).toEqual(['vaporRisk']);
  });
  it('building with soil below runs the saturated run', () => {
    const c = chain(modeled(['soilBelow'], { building: true }));
    expect(c.models).toEqual(['saturated', 'vapor']);
    expect(c.outputs).toEqual(['vaporSaturated', 'vaporRisk']);
  });
  it('the stream path links surface water to the transport run', () => {
    const c = chain(modeled(['groundwater'], { stream: true }));
    expect(c.models).toEqual(['transport', 'surfaceWater', 'household']);
    expect(c.outputs).toEqual(expect.arrayContaining(['well', 'bank', 'surfaceWater']));
  });
  it('household needs a well output and a human receptor', () => {
    expect(chain(modeled(['soilGas'], { building: true })).models).not.toContain('household');
    const eco = chain(
      modeled(['soilAbove', 'groundwater'], { well: true }, { receptors: 'ecological' }),
    );
    expect(eco.models).not.toContain('household');
  });
  it('produce adds the produce factors', () => {
    const soil = chain(modeled(['soilAbove'], { leaching: true }, { produce: 'soil' }));
    expect(soil.models).toEqual(['vadose', 'plantsEco']);
    expect(soil.outputs).toContain('produce');
    const irr = chain(modeled(['groundwater'], { well: true }, { produce: 'irrigation' }));
    expect(irr.outputs).toContain('produce');
  });
  it('ecological receptors with soil or a stream read live and write no output', () => {
    const c = chain(modeled(['soilAbove'], { leaching: true }, { receptors: 'ecological' }));
    expect(c.problems).toEqual([]);
    expect(c.models).toEqual(['vadose', 'plantsEco']);
    expect(c.outputs).toEqual(['vadose']);
    const s = chain(modeled(['groundwater'], { stream: true }, { receptors: 'ecological' }));
    expect(s.problems).toEqual([]);
    expect(s.models).toContain('plantsEco');
  });
});

describe('chain: several sources at once', () => {
  it('allows groundwater with soil gas, which the old checklist refused', () => {
    const c = chain(modeled(['groundwater', 'soilGas'], { well: true, building: true }));
    expect(c.problems).toEqual([]);
    expect(c.models).toEqual(['transport', 'vapor', 'household']);
    expect(c.paths.find((p) => p.path === 'well')?.source).toBe('groundwater');
    expect(c.paths.find((p) => p.path === 'building')?.source).toBe('soilGas');
    expect(c.valuesNeeded.sort()).toEqual(['groundwater', 'soilGas']);
  });
  it('allows soil above for leaching with groundwater for the well', () => {
    const c = chain(modeled(['soilAbove', 'groundwater'], { leaching: true, well: true }));
    expect(ids(c)).toEqual(['two-well-sources']);
    const ok = chain(modeled(['soilAbove', 'groundwater'], { leaching: true, building: true }));
    expect(ok.problems).toEqual([]);
  });
  it('refuses a second source on the well path with a plain reason', () => {
    const c = chain(modeled(['groundwater', 'soilBelow'], { well: true }));
    expect(ids(c)).toEqual(['two-well-sources']);
    expect(c.problems[0]!.message).toMatch(/groundwater and soil below the water table/);
    expect(c.models).toEqual([]);
  });
});

describe('chain: problems are explained', () => {
  it('no source', () => {
    expect(ids(chain(modeled([], { well: true })))).toEqual(['no-source']);
  });
  it('a source with no path', () => {
    expect(ids(chain(modeled(['groundwater'], {})))).toEqual(['no-path']);
  });
  it('leaching without soil above the water table', () => {
    expect(ids(chain(modeled(['groundwater'], { leaching: true })))).toEqual([
      'leaching-needs-soil-above',
    ]);
  });
  it('a well, a stream or a building with nothing to feed it', () => {
    expect(ids(chain(modeled(['soilGas'], { well: true })))).toEqual(['well-needs-source']);
    expect(ids(chain(modeled(['soilGas'], { stream: true })))).toEqual(['stream-needs-source']);
    expect(ids(chain(modeled(['soilAbove'], { well: true })))).toEqual(['well-needs-source']);
  });
  it('produce from irrigation without a well path', () => {
    expect(
      ids(chain(modeled(['groundwater'], { building: true }, { produce: 'irrigation' }))),
    ).toEqual(['produce-irrigation-needs-well']);
  });
  it('produce from soil without soil above the water table', () => {
    expect(ids(chain(modeled(['groundwater'], { well: true }, { produce: 'soil' })))).toEqual([
      'produce-soil-needs-soil',
    ]);
  });
  it('ecological receptors with neither soil nor a stream', () => {
    expect(
      ids(chain(modeled(['groundwater'], { well: true }, { receptors: 'ecological' }))),
    ).toEqual(['eco-medium-unsupported']);
  });
  it('reports every problem at once and gives no models', () => {
    const c = chain(modeled(['soilGas'], { leaching: true, well: true }, { produce: 'soil' }));
    expect(ids(c)).toEqual(
      expect.arrayContaining(['leaching-needs-soil-above', 'well-needs-source']),
    );
    expect(c.models).toEqual([]);
    expect(c.paths).toEqual([]);
  });
  it('no message uses the long dash', () => {
    const all = [
      chain(modeled([], {})),
      chain(modeled(['groundwater', 'soilBelow'], { well: true })),
      chain({ ...defaultGuidedSite(), basis: 'measured', measured: [] }),
    ];
    for (const c of all) for (const p of c.problems) expect(p.message).not.toContain('\u2014');
  });
});

describe('chain: notes', () => {
  it('building with a non-groundwater source downgradient says its exposure point is onsite', () => {
    const c = chain(modeled(['soilGas'], { building: true }, { location: 'downgradient' }));
    expect(c.notes.join(' ')).toMatch(/exposure point is onsite/);
    const w = chain(modeled(['groundwater'], { building: true }, { location: 'downgradient' }));
    expect(w.notes).toEqual([]);
  });
  it('produce is not used for ecological receptors', () => {
    const c = chain(
      modeled(['soilAbove'], { leaching: true }, { receptors: 'ecological', produce: 'soil' }),
    );
    expect(c.notes.join(' ')).toMatch(/not used for ecological/);
  });
});

describe('chain: purity', () => {
  it('does not change its input and gives the same answer twice', () => {
    const s = modeled(['groundwater', 'soilGas'], { well: true, building: true });
    const before = JSON.stringify(s);
    expect(chain(s)).toEqual(chain(s));
    expect(JSON.stringify(s)).toBe(before);
  });
});
