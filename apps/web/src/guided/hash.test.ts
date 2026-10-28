import { beforeAll, describe, expect, it } from 'vitest';
import { loadVaporChemicals, type VaporChemicalRow } from '../vapor/chemicals';
import { defaultGuided, type GuidedState } from './state';
import type { ChemicalData } from './derive';
import { outputHashes, type OutputHashes } from './hash';

let rows: VaporChemicalRow[] = [];
beforeAll(async () => {
  rows = await loadVaporChemicals();
});
const BENZENE = '71-43-2';
const MTBE = '1634-04-4';
const row = (id: string): VaporChemicalRow => rows.find((r) => r.id === id)!;
const chems = (benzeneRow?: VaporChemicalRow): ChemicalData[] => [
  { id: BENZENE, name: 'Benzene', fate: benzeneRow ?? row(BENZENE) },
  { id: MTBE, name: 'MTBE', fate: row(MTBE) },
];

const value = (g: GuidedState, id: string, medium: string, v: string, unit: string): void => {
  g.sources[id] ??= { values: {}, note: '', tph: '' };
  (g.sources[id].values as Record<string, { value: string; unit: string }>)[medium] = {
    value: v,
    unit,
  };
};

/** Groundwater to a well and a downgradient building: well, water table, indoor air and household. */
const wellAndBuilding = (): GuidedState => {
  const g = defaultGuided();
  g.site.sources = ['groundwater'];
  g.site.paths.well = true;
  g.site.paths.building = true;
  g.site.location = 'downgradient';
  value(g, BENZENE, 'groundwater', '1', 'mg/L');
  value(g, MTBE, 'groundwater', '2', 'mg/L');
  return g;
};

/** The outputs whose hash differs between two hash sets, as `feed:chemical`. */
const changed = (a: OutputHashes, b: OutputHashes): string[] => {
  const out: string[] = [];
  const feeds = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const f of feeds) {
    const ids = new Set([...Object.keys(a[f] ?? {}), ...Object.keys(b[f] ?? {})]);
    for (const id of ids) if (a[f]?.[id] !== b[f]?.[id]) out.push(`${f}:${id}`);
  }
  return out.sort();
};
const edit = (patch: (g: GuidedState) => void, base = wellAndBuilding): string[] => {
  const before = outputHashes(base(), chems());
  const g = base();
  patch(g);
  return changed(before, outputHashes(g, chems()));
};

describe('outputHashes', () => {
  it('gives a hash per chemical for each output the chain chooses, the same for the same inputs', () => {
    const h = outputHashes(wellAndBuilding(), chems());
    expect(Object.keys(h).sort()).toEqual(['household', 'vaporRisk', 'vaporWaterTable', 'well']);
    for (const slots of Object.values(h)) {
      expect(Object.keys(slots).sort()).toEqual([BENZENE, MTBE].sort());
      expect(slots[BENZENE]).not.toBe(slots[MTBE]);
    }
    expect(outputHashes(wellAndBuilding(), chems())).toEqual(h);
  });

  it('is empty while step 2 has a problem', () => {
    expect(outputHashes(defaultGuided(), chems())).toEqual({});
  });

  it("a chemical's 3b value marks that chemical's outputs only", () => {
    expect(edit((g) => value(g, BENZENE, 'groundwater', '1500', 'ug/L'))).toEqual(
      [
        `household:${BENZENE}`,
        `vaporRisk:${BENZENE}`,
        `vaporWaterTable:${BENZENE}`,
        `well:${BENZENE}`,
      ].sort(),
    );
  });

  it('a value typed in another unit that reads the same number marks nothing; a note marks nothing', () => {
    expect(edit((g) => value(g, BENZENE, 'groundwater', '1000', 'ug/L'))).toEqual([]);
    expect(edit((g) => (g.sources[BENZENE]!.note = 'Well MW-3, March'))).toEqual([]);
  });

  it('the indoor air template marks indoor air only, for every chemical', () => {
    expect(edit((g) => (g.forms.vapor = { floorArea: '200' }))).toEqual(
      [`vaporRisk:${BENZENE}`, `vaporRisk:${MTBE}`].sort(),
    );
    expect(edit((g) => (g.site.indoorModel = 'legacy'))).toEqual(
      [`vaporRisk:${BENZENE}`, `vaporRisk:${MTBE}`].sort(),
    );
  });

  it('a chemical name change alone marks no output, with indoor air, household and produce in the plan', () => {
    const base = (): GuidedState => {
      const g = wellAndBuilding();
      g.site.paths.leaching = false;
      g.site.produce = 'irrigation';
      return g;
    };
    const before = outputHashes(base(), chems());
    expect(Object.keys(before).sort()).toContain('produce');
    const renamed = chems().map((c) => (c.id === BENZENE ? { ...c, name: 'Benzene (renamed)' } : c));
    expect(changed(before, outputHashes(base(), renamed))).toEqual([]);
  });

  it('the household template marks the household output only', () => {
    expect(edit((g) => (g.forms.household = { showerMinutes: '12' }))).toEqual(
      [`household:${BENZENE}`, `household:${MTBE}`].sort(),
    );
  });

  it('the aquifer marks the transport outputs and everything that reads them', () => {
    expect(edit((g) => (g.forms.transport = { K: '3' }))).toHaveLength(8);
  });

  it('a 3c edit marks the outputs of the models that read that property', () => {
    const before = outputHashes(wellAndBuilding(), chems());
    const da = { ...row(BENZENE), rsl: { ...row(BENZENE).rsl, dia: { value: 0.07 } } };
    expect(changed(before, outputHashes(wellAndBuilding(), chems(da)))).toEqual(
      [`vaporRisk:${BENZENE}`].sort(),
    );
    const koc = { ...row(BENZENE), rsl: { ...row(BENZENE).rsl, koc: { value: 90 } } };
    expect(changed(before, outputHashes(wellAndBuilding(), chems(koc)))).toEqual(
      [
        `household:${BENZENE}`,
        `vaporRisk:${BENZENE}`,
        `vaporWaterTable:${BENZENE}`,
        `well:${BENZENE}`,
      ].sort(),
    );
  });

  it('the time step marks the well curve and what reads it, not the vadose run', () => {
    const leaching = (): GuidedState => {
      const g = defaultGuided();
      g.site.sources = ['soilAbove'];
      g.site.paths.leaching = true;
      g.site.paths.well = true;
      value(g, BENZENE, 'soilAbove', '10', 'mg/kg');
      value(g, MTBE, 'soilAbove', '10', 'mg/kg');
      return g;
    };
    expect(edit((g) => (g.run.stepYr = '0.5'), leaching)).toEqual(
      [`household:${BENZENE}`, `household:${MTBE}`, `well:${BENZENE}`, `well:${MTBE}`].sort(),
    );
    // the vadose template marks the vadose run and the well it feeds
    expect(edit((g) => (g.forms.vadose = { infiltration: '30' }), leaching)).toHaveLength(6);
    // the simulation time and the basis bind every model
    expect(edit((g) => (g.run.timeYr = '40'), leaching)).toHaveLength(6);
    expect(edit((g) => (g.run.basis = 'legacy'), leaching)).toHaveLength(6);
  });
});
