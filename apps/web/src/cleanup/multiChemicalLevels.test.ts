import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import type { HouseholdRiskFeed } from '../household/feeds';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import { buildCleanup } from './build';
import { runCleanup } from './compute';
import { defaultCleanupForm } from './form';
import { householdSourceLevels } from './householdLevels';
import { vaporSourceLevels } from './vaporLevels';
import { surfaceWaterSourceLevels } from './surfaceWaterLevels';
import { sourceLevelCsvTables } from './sourceLevelsCsv';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const ON: PathwayId[] = [
  'showerInhalation',
  'indoorInhalation',
  'outdoorInhalation',
  'swimIngestion',
  'swimDermal',
];

function outcome(ids: string[]) {
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, ON.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  const form = {
    ...f,
    chemicals: ids.map((id) => newChemicalRow(db.byId.get(id)!)),
    a: { ...f.a, pathways, bathTime: '0.25', outdoorTime: '2', swimTime: '2.6', swimDays: '12' },
  };
  const b = buildCleanup(form, db);
  if (!b.ok) throw new Error(b.errors.join('; '));
  return runCleanup(b);
}

const NAMES = { '71-43-2': 'Benzene', '108-88-3': 'Toluene' };
const EPC = { kind: 'constant' as const, value: 1e-6, origin: 'x' };
const HOUSEHOLD: HouseholdRiskFeed = {
  chemicalId: '71-43-2',
  label: 'Benzene, household run',
  coefficients: { bathroomAir: 0.002, particulateAir: 2e-9 },
  methods: { bathroomAir: 'shower.little-1992', particulateAir: 'particulate.ssg-pef-1996' },
};
const VAPOR: VaporRiskFeed = {
  chemicalId: '71-43-2',
  label: 'Benzene, vapor run',
  indoor: EPC,
  outdoor: EPC,
  coefficients: {
    indoor: { quantified: true, methodId: 'vapor.je-1991', value: 2e-4, source: 'groundwater' },
    outdoor: { quantified: true, methodId: 'outdoorAir.box', value: 3e-9, source: 'soil' },
  },
};
const SURFACE: SurfaceWaterFeed = {
  method: 'mass-discharge',
  origin: 'surfaceWater.mass-discharge',
  label: 'Modern mass-discharge surface water',
  times: [1],
  values: [1e-6],
  coefficient: {
    value: 0.04,
    reason: null,
    method: 'surfaceWater.mass-discharge',
    sourceMedium: 'groundwater',
    sourceUnit: 'mg/L',
  },
};

const BOTH = ['71-43-2', '108-88-3'];

describe('source levels with two chemicals in the cleanup run', () => {
  it('household levels are the run chemical alone and equal the single chemical run', () => {
    const two = householdSourceLevels(outcome(BOTH), HOUSEHOLD);
    const one = householdSourceLevels(outcome(['71-43-2']), HOUSEHOLD);
    expect(two.length).toBeGreaterThan(0);
    expect(two.map((r) => r.level)).toEqual(one.map((r) => r.level));
  });

  it('vapor levels are the run chemical alone and equal the single chemical run', () => {
    const two = vaporSourceLevels(outcome(BOTH), VAPOR);
    const one = vaporSourceLevels(outcome(['71-43-2']), VAPOR);
    expect(two.length).toBeGreaterThan(0);
    expect(two.map((r) => r.level)).toEqual(one.map((r) => r.level));
  });

  it('surface water levels are not quantified for any chemical, with a reason, when the run names none', () => {
    const rows = surfaceWaterSourceLevels(outcome(BOTH), SURFACE);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.level).toBeNull();
      expect(r.reason).toMatch(/more than one chemical/i);
    }
    expect(new Set(rows.map((r) => r.chemical))).toEqual(new Set(BOTH));
  });

  it('surface water levels stay quantified for a single chemical run', () => {
    const rows = surfaceWaterSourceLevels(outcome(['71-43-2']), SURFACE);
    expect(rows.some((r) => r.level !== null && r.reason === null)).toBe(true);
  });

  it('the CSV tables build for all three feeds and every unquantified row has a reason', () => {
    const tables = sourceLevelCsvTables(outcome(BOTH), NAMES, {
      household: HOUSEHOLD,
      vapor: VAPOR,
      surface: SURFACE,
    });
    expect(tables.map((t) => t.name)).toEqual([
      'cleanup-household-levels',
      'cleanup-vapor-levels',
      'cleanup-surface-water-levels',
    ]);
    for (const t of tables) {
      expect(t.rows.length).toBeGreaterThan(0);
      for (const r of t.rows) expect(r.level !== null || (r.reason ?? '') !== '').toBe(true);
    }
    const sw = tables[2]!.rows;
    expect(new Set(sw.map((r) => r.chemical))).toEqual(new Set(['Benzene', 'Toluene']));
  });

  it('a zero household coefficient writes an empty level with its reason', () => {
    const feed: HouseholdRiskFeed = { ...HOUSEHOLD, coefficients: { bathroomAir: 0 } };
    const tables = sourceLevelCsvTables(outcome(['71-43-2']), NAMES, { household: feed });
    const row = tables[0]!.rows[0]!;
    expect(row.level).toBeNull();
    expect(String(row.reason)).toMatch(/coefficient 0/);
  });
});
