import { beforeAll, describe, expect, it } from 'vitest';
import { buildModeled } from '../cleanup/modeledBuild';
import { defaultCleanupForm } from '../cleanup/form';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { loadVaporChemicals, type VaporChemicalRow } from '../vapor/chemicals';
import type { ChemicalData } from './derive';
import { cleanupFeedsOf, outputSlots, riskFeeds } from './slots';
import { BENZENE, MTBE, guidedWith, setValue, withRunOutputs } from './forms.testkit';
import type { GuidedOutputs } from './state';

let db: ChemicalDb;
let rows: VaporChemicalRow[] = [];
beforeAll(async () => {
  db = await loadChemicalDb();
  rows = await loadVaporChemicals();
}, 30000);
const data = (id: string, name: string): ChemicalData => ({
  id,
  name,
  fate: rows.find((r) => r.id === id)!,
});

describe('outputs as feed slots', () => {
  const outputs: GuidedOutputs = {
    well: {
      [BENZENE]: { inputsHash: 'a', value: { chemicalId: BENZENE, label: 'w1' } },
      [MTBE]: { inputsHash: 'b', value: { chemicalId: MTBE, label: 'w2' } },
    },
  };

  it('is one slot per chemical holding the value, not the envelope', () => {
    const slots = outputSlots<{ label: string }>(outputs, 'well');
    expect([...slots.keys()]).toEqual([BENZENE, MTBE]);
    expect(slots.get(MTBE)?.label).toBe('w2');
  });

  it('is an empty map for a feed the Run did not write', () => {
    expect(outputSlots(outputs, 'vaporRisk').size).toBe(0);
    expect(riskFeeds({}).well.size).toBe(0);
  });

  it('riskFeeds names the five feeds the risk build reads', () => {
    const f = riskFeeds(outputs);
    expect(Object.keys(f).sort()).toEqual(['household', 'produce', 'surface', 'vapor', 'well']);
    expect(f.well.size).toBe(2);
  });
});

describe('the cleanup feeds of a chemical', () => {
  it('groundwater source: the transport scenario comes from the derived form, no vadose or saturated run', () => {
    const chems = [data(BENZENE, 'Benzene')];
    const g = withRunOutputs(
      guidedWith((x) => {
        x.site.sources = ['groundwater'];
        x.site.paths.well = true;
        setValue(x, BENZENE, 'groundwater', '2', 'mg/L');
      }),
      chems,
    );
    const feeds = cleanupFeedsOf(g, chems)(BENZENE);
    expect(feeds.transport?.chemicalId).toBe(BENZENE);
    expect(feeds.transport?.scenario).toBeDefined();
    expect(feeds.vadose).toBeNull();
    expect(feeds.saturated).toBeNull();
    const form = { ...defaultCleanupForm(), source: 'dissolved' as const };
    form.chemicals = [
      {
        id: BENZENE,
        name: 'Benzene',
        dermalForm: db.byId.get(BENZENE)!.phys?.dermalForm,
        conc: {},
        groundwaterFromWell: false,
        indoorFromVapor: false,
        outdoorFromVapor: false,
        surfaceWaterFromModel: false,
        bathroomFromHousehold: false,
        indoorFromHousehold: false,
        outdoorFromHousehold: '',
        produceFromPlantsEco: false,
      },
    ];
    for (const p of Object.keys(form.a.pathways)) {
      (form.a.pathways as Record<string, boolean>)[p] = p === 'waterIngestion';
    }
    const built = buildModeled(form, db, feeds, 1);
    expect(built.ok ? [] : built.errors).toEqual([]);
  });

  it('soil above the water table: the vadose output rides along and feeds the transport scenario', () => {
    const chems = [data(BENZENE, 'Benzene')];
    const g = withRunOutputs(
      guidedWith((x) => {
        x.site.sources = ['soilAbove'];
        x.site.paths.leaching = true;
        x.site.paths.well = true;
        setValue(x, BENZENE, 'soilAbove', '10', 'mg/kg');
      }),
      chems,
    );
    const feeds = cleanupFeedsOf(g, chems)(BENZENE);
    expect(feeds.vadose?.chemicalId).toBe(BENZENE);
    expect(feeds.transport?.scenario).toBeDefined();
  });

  it('is empty for a chemical with no model or while step 2 has a problem', () => {
    const chems = [data(BENZENE, 'Benzene')];
    const g = guidedWith(() => undefined);
    expect(cleanupFeedsOf(g, chems)(BENZENE)).toEqual({
      transport: null,
      vadose: null,
      saturated: null,
    });
    const measured = guidedWith((x) => {
      x.site.basis = 'measured';
      x.site.measured = ['soil'];
    });
    expect(cleanupFeedsOf(measured, chems)('unknown').transport).toBeNull();
  });
});
