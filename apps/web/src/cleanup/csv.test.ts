import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { exportCsv } from '../export/csv';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { toScenario, DEFAULT_FORM } from '../transport/form';
import { buildCleanup, FROM_SI } from './build';
import { computeModeled, runCleanup } from './compute';
import {
  cleanupCsvTables,
  cleanupLevelRows,
  cleanupPathwayRows,
  modeledCsvTables,
  modeledCurveRows,
  modeledResultRows,
  ssgCsvTables,
} from './csv';
import { defaultCleanupForm, type CleanupForm } from './form';
import { buildModeled } from './modeledBuild';
import { computeSsg, loadCleanupProps, type CleanupProps } from './ssg';

let db: ChemicalDb;
let props: CleanupProps;
beforeAll(async () => {
  db = await loadChemicalDb();
  props = await loadCleanupProps();
}, 30000);

const BENZENE = '71-43-2';
const WATER: PathwayId[] = ['waterIngestion', 'waterDermal'];

function form(over: Partial<CleanupForm> = {}): CleanupForm {
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, WATER.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  return {
    ...f,
    chemicals: [newChemicalRow(db.byId.get(BENZENE)!)],
    a: { ...f.a, pathways },
    ...over,
  };
}

describe('direct cleanup level CSV', () => {
  it('writes one row per method, medium and chemical in the screen unit, full precision', () => {
    const built = buildCleanup(form(), db);
    if (!built.ok) throw new Error(built.errors.join('; '));
    const out = runCleanup({ legacy: built.legacy, modern: built.modern });
    const names = { [BENZENE]: 'Benzene' };
    const rows = cleanupLevelRows(out, names);
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.method))).toEqual(
      new Set(['cleanup.rags-b-1991', 'cleanup.rags-e-f-2014']),
    );
    expect(rows[0]!.chemical).toBe('Benzene');
    if (!out.modern.ok) throw new Error('modern failed');
    const gw = out.modern.result.media.find((m) => m.medium === 'groundwater')!;
    const row = rows.find(
      (r) => r.method === 'cleanup.rags-e-f-2014' && r.medium === 'groundwater',
    );
    expect(row!.unit).toBe('mg/L');
    expect(row!.level).toBe(gw.levels[0]!.level! * FROM_SI('groundwater'));
    expect(cleanupPathwayRows(out, names).length).toBeGreaterThan(0);
    for (const t of cleanupCsvTables(out, names)) {
      const lines = exportCsv(t.rows, t.columns).trimEnd().split('\r\n');
      expect(lines).toHaveLength(t.rows.length + 1);
    }
  });
  it('writes a method that did not run as no rows', () => {
    const out = runCleanup({
      legacy: { receptors: [], chemicals: [] },
      modern: { receptors: [], chemicals: [] },
    });
    expect(cleanupLevelRows(out, {})).toEqual([]);
  });
});

describe('modeled cleanup level CSV', () => {
  const r = toScenario({ ...DEFAULT_FORM, timeYr: '10' });
  if (!r.ok) throw new Error(r.errors.join('; '));
  const built = () =>
    buildModeled(form({ source: 'dissolved' }), db, {
      transport: { scenario: r.scenario, label: 'test aquifer' },
      vadose: null,
      saturated: null,
    });
  it('writes the level per method and the metric curve with unit headers', () => {
    const b = built();
    if (!b.ok) throw new Error(b.errors.join('; '));
    const outcome = computeModeled(b.request);
    const rows = modeledResultRows(outcome, 'Benzene');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.method).toBe('cleanup.modeled-chains');
    const curve = modeledCurveRows(outcome);
    expect(curve.length).toBeGreaterThan(rows.length);
    const [res, cur] = modeledCsvTables(outcome, 'Benzene');
    expect(exportCsv(res!.rows, res!.columns).split('\r\n')[0]).toContain('cleanup level (mg/L)');
    expect(exportCsv(cur!.rows, cur!.columns).split('\r\n')[0]).toContain(
      'source concentration (mg/L)',
    );
  }, 60000);
});

describe('soil screening leaching CSV', () => {
  it('writes the soil level in mg/kg and the leachate in ug/L', () => {
    const f = form();
    const res = computeSsg({ ...f, ssg: { ...f.ssg, on: true } }, db, props);
    if (!res.ok) throw new Error(res.errors.join('; '));
    const [t] = ssgCsvTables(res.rows);
    const row = res.rows[0]!;
    if (!row.ok) throw new Error(row.reason);
    expect(t!.rows[0]!.level).toBe(row.result.level * 1e6);
    expect(t!.rows[0]!.leachate).toBe(row.result.cw * 1e6);
    expect(t!.rows[0]!.method).toBe('cleanup.ssg-leaching');
  });
});
