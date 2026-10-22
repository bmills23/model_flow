import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { toScenario } from '../transport/form';
import { toScenario as vadoseScenario, R7_FORM as VADOSE_FORM } from '../vadose/form';
import type { TransportFeed } from '../transport/chainFeed';
import type { VadoseFeed } from '../vadose/feed';
import type { SaturatedFeed } from '../saturated/feed';
import { buildModeled } from './modeledBuild';
import { defaultCleanupForm, type CleanupForm } from './form';
import { REGRESSION_FORM as DEFAULT_FORM } from '../transport/regression.testkit';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const BENZENE = '71-43-2';
const TOLUENE = '108-88-3';
const WATER: PathwayId[] = ['waterIngestion', 'waterDermal'];

function transportFeed(chemicalId?: string): TransportFeed {
  const r = toScenario({ ...DEFAULT_FORM, timeYr: '10' });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return { scenario: r.scenario, label: 'test aquifer', ...(chemicalId ? { chemicalId } : {}) };
}

function vadoseFeed(chemicalId?: string): VadoseFeed {
  const v = vadoseScenario({ ...VADOSE_FORM });
  if (!v.ok) throw new Error('vadose scenario');
  return {
    scenario: v.scenario,
    method: 'modern',
    label: 'v',
    ...(chemicalId ? { chemicalId } : {}),
  };
}

function saturatedFeed(chemicalId?: string): SaturatedFeed {
  return {
    input: {} as SaturatedFeed['input'],
    method: 'modern',
    label: 's',
    ...(chemicalId ? { chemicalId } : {}),
  };
}

function form(source: CleanupForm['source'], id = BENZENE): CleanupForm {
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, WATER.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  return {
    ...f,
    chemicals: [newChemicalRow(db.byId.get(id)!)],
    a: { ...f.a, pathways },
    source,
  };
}

describe('modeled cleanup checks the chemical of each upstream run', () => {
  it('refuses a transport run for another chemical, naming both', () => {
    const r = buildModeled(form('dissolved', TOLUENE), db, {
      transport: transportFeed(BENZENE),
      vadose: null,
      saturated: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(' ')).toMatch(/groundwater transport run is for Benzene, not Toluene/i);
    }
  });

  it('refuses a vadose run for another chemical', () => {
    const r = buildModeled(form('vadose', TOLUENE), db, {
      transport: transportFeed(TOLUENE),
      vadose: vadoseFeed(BENZENE),
      saturated: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/vadose zone run is for Benzene, not Toluene/i);
  });

  it('refuses a saturated run for another chemical', () => {
    const r = buildModeled(form('saturated', TOLUENE), db, {
      transport: transportFeed(TOLUENE),
      vadose: null,
      saturated: saturatedFeed(BENZENE),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(' ')).toMatch(/saturated soil source run is for Benzene, not Toluene/i);
    }
  });

  it('takes matching and untagged runs for the one chemical of the run', () => {
    expect(
      buildModeled(form('dissolved'), db, {
        transport: transportFeed(BENZENE),
        vadose: null,
        saturated: null,
      }).ok,
    ).toBe(true);
    expect(
      buildModeled(form('vadose'), db, {
        transport: transportFeed(),
        vadose: vadoseFeed(),
        saturated: null,
      }).ok,
    ).toBe(true);
  });

  it('does not check a vadose run the source does not use', () => {
    const r = buildModeled(form('dissolved'), db, {
      transport: transportFeed(BENZENE),
      vadose: vadoseFeed(TOLUENE),
      saturated: null,
    });
    expect(r.ok).toBe(true);
  });
});
