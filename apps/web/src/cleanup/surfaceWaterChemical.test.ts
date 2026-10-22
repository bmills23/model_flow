import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import { buildCleanup } from './build';
import { runCleanup } from './compute';
import { defaultCleanupForm } from './form';
import { surfaceWaterSourceLevels } from './surfaceWaterLevels';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const BENZENE = '71-43-2';
const TOLUENE = '108-88-3';
const ON: PathwayId[] = ['swimIngestion', 'swimDermal'];

function outcome(ids: string[]) {
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, ON.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  const form = {
    ...f,
    chemicals: ids.map((id) => newChemicalRow(db.byId.get(id)!)),
    a: { ...f.a, pathways, swimTime: '2.6', swimDays: '12' },
  };
  const b = buildCleanup(form, db);
  if (!b.ok) throw new Error(b.errors.join('; '));
  return runCleanup(b);
}

const feed = (chemicalId?: string): SurfaceWaterFeed => ({
  method: 'mass-discharge',
  origin: 'surfaceWater.mass-discharge',
  label: 'Modern mass-discharge surface water, 10.0 years',
  times: [1],
  values: [1e-6],
  coefficient: {
    value: 0.04,
    reason: null,
    method: 'surfaceWater.mass-discharge',
    sourceMedium: 'groundwater',
    sourceUnit: 'mg/L',
  },
  ...(chemicalId ? { chemicalId } : {}),
});

const names = { [BENZENE]: 'Benzene', [TOLUENE]: 'Toluene' };

describe('surface water source levels follow the feed chemical', () => {
  it('quantifies the matching chemical of a multi-chemical run and refuses the other', () => {
    const rows = surfaceWaterSourceLevels(outcome([BENZENE, TOLUENE]), feed(BENZENE), names);
    const modern = rows.filter((r) => r.method === 'modern');
    const ben = modern.find((r) => r.chemical === BENZENE)!;
    const tol = modern.find((r) => r.chemical === TOLUENE)!;
    expect(ben.reason).toBeNull();
    expect(ben.level).not.toBeNull();
    expect(tol.level).toBeNull();
    expect(tol.reason).toMatch(/is for Benzene, not Toluene/);
  });

  it('refuses a single-chemical run whose feed is for another chemical', () => {
    const rows = surfaceWaterSourceLevels(outcome([TOLUENE]), feed(BENZENE), names);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.level).toBeNull();
      expect(r.reason).toMatch(/is for Benzene, not Toluene/);
    }
  });

  it('keeps an untagged feed for a single-chemical run', () => {
    const rows = surfaceWaterSourceLevels(outcome([BENZENE]), feed());
    expect(rows.every((r) => r.level !== null)).toBe(true);
  });

  it('refuses an untagged feed in a multi-chemical run, naming the feed', () => {
    const rows = surfaceWaterSourceLevels(outcome([BENZENE, TOLUENE]), feed(), names);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.level).toBeNull();
      expect(r.reason).toMatch(/surface water result does not record which chemical/);
    }
  });
});
