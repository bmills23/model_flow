import { beforeAll, describe, expect, it } from 'vitest';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { inhalationBasis, neededToxFields, toxicityGaps } from './toxNeeds';
import { setPathwayTick } from './exposure';
import { BENZENE, guidedWith } from './forms.testkit';
import type { GuidedState } from './state';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const soilOnly = (g: GuidedState): void => {
  g.site.basis = 'measured';
  g.site.measured = ['soil'];
};
const airOnly = (g: GuidedState): void => {
  g.site.basis = 'measured';
  g.site.measured = ['indoorAir'];
};

describe('neededToxFields', () => {
  it('asks for the oral values when only soil contact is ticked', () => {
    expect(neededToxFields(guidedWith(soilOnly))).toEqual(['sfo', 'rfdo']);
  });
  it('asks for the inhalation values when only indoor air is ticked', () => {
    expect(neededToxFields(guidedWith(airOnly))).toEqual(['iur', 'rfci']);
  });
  it('drops the values of a route whose pathways are all unticked', () => {
    let g = guidedWith(soilOnly);
    g = setPathwayTick(g, 'soilIngestion', false);
    g = setPathwayTick(g, 'soilDermal', false);
    expect(neededToxFields(g)).toEqual([]);
  });
  it('lists the four values for both routes in screen order', () => {
    const g = guidedWith((x) => {
      x.site.basis = 'measured';
      x.site.measured = ['soil', 'indoorAir'];
    });
    expect(neededToxFields(g)).toEqual(['sfo', 'iur', 'rfdo', 'rfci']);
  });
});

describe('inhalationBasis', () => {
  it('follows the 3d method with the other basis as the check', () => {
    const m = inhalationBasis('modern');
    expect(m.main).toMatch(/unit risk and reference concentration/i);
    expect(m.check).toMatch(/slope factor and reference dose/i);
    const l = inhalationBasis('legacy');
    expect(l.main).toMatch(/slope factor and reference dose/i);
    expect(l.check).toMatch(/unit risk and reference concentration/i);
  });
});

describe('toxicityGaps', () => {
  it('is empty for benzene soil contact and names a chemical with no value for a ticked route', () => {
    const g = guidedWith(soilOnly);
    expect(toxicityGaps(g, [{ id: BENZENE, name: 'Benzene' }], db)).toEqual([]);
    const bare = db.chemicals.find((c) => c.tox.sfo === undefined && c.tox.rfdo === undefined);
    expect(bare).toBeDefined();
    const gaps = toxicityGaps(g, [{ id: bare!.id, name: bare!.name }], db);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.text).toMatch(/oral slope factor or oral reference dose/i);
    expect(gaps[0]!.text).toContain(bare!.name);
    expect(gaps[0]!.text).toMatch(/soil/i);
  });
});
