import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { exportCsv } from '../export/csv';
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
import { solveSurfaceJob } from './surfaceSolve';
import { unlinkedRequest } from './surfaceSolve.testkit';
import { CLEANUP_METHOD_IDS } from './csv';
import { sourceLevelCsvTables, sourceLevelsHeld, surfaceSolveJobs } from './sourceLevelsCsv';

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

function outcome() {
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, ON.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  const form = {
    ...f,
    chemicals: [newChemicalRow(db.byId.get('71-43-2')!)],
    a: { ...f.a, pathways, bathTime: '0.25', outdoorTime: '2', swimTime: '2.6', swimDays: '12' },
  };
  const b = buildCleanup(form, db);
  if (!b.ok) throw new Error(b.errors.join('; '));
  return runCleanup(b);
}

const NAMES = { '71-43-2': 'Benzene' };
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
    outdoor: { quantified: false, methodId: 'outdoorAir.box', reason: 'TPH mixture in the soil' },
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

describe('source level CSV tables', () => {
  it('writes no table for a feed that is not held', () => {
    expect(sourceLevelCsvTables(outcome(), NAMES, {})).toEqual([]);
    expect(sourceLevelsHeld({})).toBe(false);
    expect(sourceLevelsHeld({ vapor: VAPOR })).toBe(true);
  });

  it('household rows carry the panel levels in screen units with both method ids', () => {
    const out = outcome();
    const tables = sourceLevelCsvTables(out, NAMES, { household: HOUSEHOLD });
    expect(tables.map((t) => t.name)).toEqual(['cleanup-household-levels']);
    const panel = householdSourceLevels(out, HOUSEHOLD);
    const rows = tables[0]!.rows;
    expect(rows).toHaveLength(panel.length);
    const first = panel[0]!;
    expect(rows[0]).toMatchObject({
      method: CLEANUP_METHOD_IDS[first.method],
      sourceMethod: first.householdMethod,
      source: first.what,
      unit: first.unit,
      chemical: 'Benzene',
      level: first.level! * first.fromSi,
      reason: null,
    });
    expect(exportCsv(rows, tables[0]!.columns)).toContain('household method');
  });

  it('vapor rows keep a not quantified path with its reason and no level', () => {
    const out = outcome();
    const tables = sourceLevelCsvTables(out, NAMES, { vapor: VAPOR });
    expect(tables.map((t) => t.name)).toEqual(['cleanup-vapor-levels']);
    const panel = vaporSourceLevels(out, VAPOR);
    const rows = tables[0]!.rows;
    expect(rows).toHaveLength(panel.length);
    const quant = rows.find((r) => r.source === 'Groundwater (indoor air)')!;
    const p = panel.find((r) => r.what === 'Groundwater (indoor air)')!;
    expect(quant.level).toBe(p.level! * p.fromSi);
    expect(quant.unit).toBe('mg/L');
    const none = rows.find((r) => r.sourceMethod === 'outdoorAir.box')!;
    expect(none.level).toBeNull();
    expect(none.cancerLevel).toBeNull();
    expect(none.reason).toBe('TPH mixture in the soil');
    expect(none.level).not.toBe(0);
    // each row says where its level came from: the linear coefficient, the solve, or neither
    expect(quant.basis).toBe('linear coefficient');
    expect(none.basis).toBeNull();
    expect(exportCsv(rows, tables[0]!.columns)).toContain('level from');
  });

  it('surface water rows give the source level in mg/L and the surface water level it reproduces', () => {
    const out = outcome();
    const tables = sourceLevelCsvTables(out, NAMES, { surface: SURFACE });
    expect(tables.map((t) => t.name)).toEqual(['cleanup-surface-water-levels']);
    const panel = surfaceWaterSourceLevels(out, SURFACE);
    const rows = tables[0]!.rows;
    expect(rows).toHaveLength(panel.length);
    expect(rows[0]).toMatchObject({
      sourceMethod: 'surfaceWater.mass-discharge',
      unit: 'mg/L',
      chemical: 'Benzene',
      level: panel[0]!.level! * 1e3,
      surfaceWaterLevel: panel[0]!.mediumLevel! * 1e3,
      reason: null,
      path: 'linear',
    });
    expect(String(rows[0]!.solver)).toMatch(/linear/i);
    expect(tables[0]!.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(['path', 'solver']),
    );
  });

  it('surface water rows of a run with a background say solved, with the detail, once the worker has answered', () => {
    const out = outcome();
    const request = unlinkedRequest({ background: '0.0001' });
    const f: SurfaceWaterFeed = {
      ...SURFACE,
      coefficient: {
        ...SURFACE.coefficient!,
        value: null,
        reason: 'The run has an upstream background concentration.',
        path: 'background',
      },
      solve: { request },
    };
    const waiting = sourceLevelCsvTables(out, NAMES, { surface: f })[0]!.rows;
    expect(waiting.every((r) => r.level === null && r.path === null)).toBe(true);
    const jobs = surfaceSolveJobs(out, NAMES, { surface: f });
    expect(jobs).toHaveLength(1);
    const solves = new Map(jobs.map((j) => [j.key, solveSurfaceJob(j)]));
    const rows = sourceLevelCsvTables(out, NAMES, { surface: f }, { solves })[0]!.rows;
    for (const r of rows) {
      expect(r.path).toBe('solved');
      expect(String(r.solver)).toMatch(/forward run|shortcut|Brent/);
      expect(r.unit).toBe('mg/L');
      expect(typeof r.level).toBe('number');
      expect(r.source).toBe('Groundwater source (surface water)');
      expect(r.reason).toBeNull();
    }
  });

  it('surface water rows from a feed with no coefficient are not quantified with the reason', () => {
    const bare: SurfaceWaterFeed = { ...SURFACE };
    delete bare.coefficient;
    const rows = sourceLevelCsvTables(outcome(), NAMES, { surface: bare })[0]!.rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.level).toBeNull();
      expect(String(r.reason)).toMatch(/send the surface water result again/i);
    }
  });

  it('orders the tables household, vapor, surface water', () => {
    const tables = sourceLevelCsvTables(outcome(), NAMES, {
      surface: SURFACE,
      vapor: VAPOR,
      household: HOUSEHOLD,
    });
    expect(tables.map((t) => t.name)).toEqual([
      'cleanup-household-levels',
      'cleanup-vapor-levels',
      'cleanup-surface-water-levels',
    ]);
  });
});
