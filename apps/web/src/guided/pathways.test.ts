import { describe, expect, it } from 'vitest';
import { PATHWAY_IDS } from '@model-flow/engine';
import { defaultGuided, type GuidedState } from './state';
import { pathwayStatuses, pathwaysOn } from './pathways';

const guidedWith = (patch: (g: GuidedState) => void): GuidedState => {
  const g = defaultGuided();
  patch(g);
  return g;
};
const status = (g: GuidedState, id: string) => pathwayStatuses(g).find((p) => p.id === id)!;

const modeled = (g: GuidedState): void => {
  g.site.sources = ['groundwater'];
  g.site.paths.well = true;
  g.site.paths.building = true;
  g.site.location = 'downgradient';
};

describe('pathway statuses follow the chain', () => {
  it('lists every pathway once, in the engine order', () => {
    expect(pathwayStatuses(defaultGuided()).map((p) => p.id)).toEqual([...PATHWAY_IDS]);
  });

  it('groundwater to a well and a building: water, shower and air are available, the rest named off', () => {
    const g = guidedWith(modeled);
    for (const id of [
      'waterIngestion',
      'waterDermal',
      'showerInhalation',
      'indoorInhalation',
      'outdoorInhalation',
    ]) {
      expect(status(g, id)).toMatchObject({ available: true, reason: null, on: true });
    }
    for (const id of ['soilIngestion', 'soilDermal']) {
      expect(status(g, id).available).toBe(false);
      expect(status(g, id).reason).toMatch(/soil above the water table/i);
      expect(status(g, id).on).toBe(false);
    }
    expect(status(g, 'swimIngestion').reason).toMatch(/stream/i);
    expect(status(g, 'produce').reason).toMatch(/produce/i);
  });

  it('a ruled-out pathway stays off even when the saved ticks say on', () => {
    const g = guidedWith((x) => {
      modeled(x);
      x.exposure.pathways = { soilIngestion: true };
    });
    expect(status(g, 'soilIngestion')).toMatchObject({ available: false, on: false });
    expect(pathwaysOn(g).soilIngestion).toBe(false);
  });

  it('a pathway the user unticked is available but off', () => {
    const g = guidedWith((x) => {
      modeled(x);
      x.exposure.pathways = { waterIngestion: false };
    });
    expect(status(g, 'waterIngestion')).toMatchObject({ available: true, reason: null, on: false });
    expect(pathwaysOn(g).waterIngestion).toBe(false);
    expect(pathwaysOn(g).waterDermal).toBe(true);
  });

  it('soil above the water table at the source gives the soil pathways, unless downgradient', () => {
    const onsite = guidedWith((x) => {
      x.site.sources = ['soilAbove'];
      x.site.paths.leaching = true;
      x.site.paths.well = true;
    });
    expect(status(onsite, 'soilIngestion').available).toBe(true);
    expect(status(onsite, 'waterIngestion').available).toBe(true);
    const down = guidedWith((x) => {
      x.site.sources = ['soilAbove'];
      x.site.paths.leaching = true;
      x.site.paths.well = true;
      x.site.location = 'downgradient';
    });
    expect(status(down, 'soilIngestion').available).toBe(false);
    expect(status(down, 'soilIngestion').reason).toMatch(/downgradient/i);
  });

  it('a stream path gives swimming; the produce choice gives produce when soil is there', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['soilAbove', 'groundwater'];
      x.site.paths.stream = true;
      x.site.produce = 'soil';
    });
    expect(status(g, 'swimIngestion').available).toBe(true);
    expect(status(g, 'swimDermal').available).toBe(true);
    expect(status(g, 'produce').available).toBe(true);
  });

  it('measured concentrations give a pathway for each medium measured', () => {
    const g = guidedWith((x) => {
      x.site.basis = 'measured';
      x.site.measured = ['soil', 'groundwater', 'indoorAir'];
    });
    expect(status(g, 'soilDermal').available).toBe(true);
    expect(status(g, 'waterDermal').available).toBe(true);
    expect(status(g, 'indoorInhalation').available).toBe(true);
    expect(status(g, 'outdoorInhalation')).toMatchObject({ available: false });
    expect(status(g, 'outdoorInhalation').reason).toMatch(/outdoor air/i);
    expect(status(g, 'showerInhalation').available).toBe(false);
    expect(status(g, 'showerInhalation').reason).toMatch(/shower/i);
  });

  it('ecological receptors and a step 2 problem turn every human pathway off with the reason', () => {
    const eco = guidedWith((x) => {
      modeled(x);
      x.site.receptors = 'ecological';
    });
    expect(pathwayStatuses(eco).every((p) => !p.available && p.reason !== null)).toBe(true);
    expect(status(eco, 'waterIngestion').reason).toMatch(/ecological/i);
    const none = defaultGuided();
    expect(pathwayStatuses(none).every((p) => !p.available && !p.on)).toBe(true);
    expect(status(none, 'waterIngestion').reason).toMatch(/step 2/i);
  });
});
