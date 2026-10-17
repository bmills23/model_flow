import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { toScenario, DEFAULT_FORM } from '../transport/form';
import { toScenario as vadoseScenario, DEFAULT_FORM as VADOSE_FORM } from '../vadose/form';
import type { TransportFeed } from '../transport/chainFeed';
import type { VadoseFeed } from '../vadose/feed';
import { buildModeled, NEEDS_TRANSPORT, ONE_CHEMICAL } from './modeledBuild';
import { chainChemicalFor, computeModeled } from './compute';
import { defaultCleanupForm, type CleanupForm } from './form';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const BENZENE = '71-43-2';
const WATER: PathwayId[] = ['waterIngestion', 'waterDermal'];

function transportFeed(): TransportFeed {
  const r = toScenario({ ...DEFAULT_FORM, timeYr: '10' });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return { scenario: r.scenario, label: 'test aquifer' };
}

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
    source: 'dissolved',
    ...over,
  };
}

function request(over: Partial<CleanupForm> = {}) {
  const r = buildModeled(form(over), db, {
    transport: transportFeed(),
    vadose: null,
    saturated: null,
  });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.request;
}

describe('buildModeled', () => {
  it('asks for the groundwater screen when no transport feed is held', () => {
    const r = buildModeled(form(), db, { transport: null, vadose: null, saturated: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain(NEEDS_TRANSPORT);
  });

  it('takes one chemical only', () => {
    const f = form();
    f.chemicals.push(newChemicalRow(db.byId.get('108-88-3')!));
    const r = buildModeled(f, db, { transport: transportFeed(), vadose: null, saturated: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain(ONE_CHEMICAL);
  });

  it('converts the database MCL from ug/L to kg/m3 and the window from years to s', () => {
    const req = request({ targetKind: 'well', windowYr: '2' });
    expect(req.target).toEqual({ kind: 'mcl' });
    expect(req.chemical.mcl).toBeCloseTo(5e-6, 12);
    expect(req.windowSeconds).toBeCloseTo(2 * 365.25 * 86400, 0);
  });

  it('a typed well target replaces the database MCL (mg/L to kg/m3)', () => {
    const req = request({ targetKind: 'well', wellTarget: '0.02' });
    expect(req.target).toEqual({ kind: 'user', value: 2e-5 });
  });

  it('needs the vadose feed for a vadose source', () => {
    const r = buildModeled(form({ source: 'vadose' }), db, {
      transport: transportFeed(),
      vadose: null,
      saturated: null,
    });
    expect(r.ok).toBe(false);
  });
});

describe('pathways of a modeled source', () => {
  it('leaves out pathways the source cannot give a concentration and says so', () => {
    const f = form();
    f.a = defaultCleanupForm().a; // every pathway on
    const r = buildModeled(f, db, { transport: transportFeed(), vadose: null, saturated: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const on = r.request.modern.receptors[0]!.pathways;
    expect(on).toContain('waterIngestion');
    expect(on).not.toContain('soilIngestion');
    expect(on).not.toContain('outdoorInhalation');
    expect(r.notes.some((n) => /left out/i.test(n))).toBe(true);
    const out = computeModeled({ ...r.request, only: 'modern', target: { kind: 'mcl' } });
    expect(out.modern!.ok).toBe(true);
  }, 60000);

  it('keeps soil pathways, linked to the same concentration, for a soil source', () => {
    const v = vadoseScenario({ ...VADOSE_FORM });
    if (!v.ok) throw new Error('vadose scenario');
    const f = form({ source: 'vadose' });
    f.a = defaultCleanupForm().a;
    const r = buildModeled(f, db, {
      transport: transportFeed(),
      vadose: { scenario: v.scenario, method: 'modern', label: 'v' },
      saturated: null,
    });
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.request.modern.receptors[0]!.pathways).toContain('soilIngestion');
  });

  it('asks for a reachable pathway when none is left', () => {
    const f = form();
    const pathways = Object.fromEntries(
      PATHWAY_IDS.map((p) => [p, p === 'soilIngestion']),
    ) as Record<PathwayId, boolean>;
    f.a = { ...f.a, pathways };
    const r = buildModeled(f, db, { transport: transportFeed(), vadose: null, saturated: null });
    expect(r.ok).toBe(false);
  });
});

describe('computeModeled', () => {
  it('meets an MCL at the well: the level round-trips through the same chain', () => {
    const out = computeModeled(request({ targetKind: 'well' }));
    expect(out.medium).toBe('groundwater');
    for (const m of ['legacy', 'modern'] as const) {
      const o = out[m]!;
      expect(o.ok).toBe(true);
      if (!o.ok) continue;
      const lv = o.run.result.levels[0]!;
      expect(lv.limiting).toBe('concentration');
      expect(lv.level).toBeGreaterThan(0);
      expect(o.run.shown.endpoint).toBe('concentration');
      expect(o.run.shown.target).toBeCloseTo(5e-6, 12);
      // the curve crosses the target at the solution
      const at = o.run.curve.peak.map((p, i) => ({ c: o.run.curve.conc[i]!, p: p! }));
      const below = at.filter((x) => x.p < 5e-6).length;
      expect(below).toBeGreaterThan(0);
      expect(below).toBeLessThan(at.length);
      expect(Math.abs(o.run.convergence.residual)).toBeLessThan(1e-9);
    }
  }, 60000);

  it('reports a target that cannot be reached instead of a level', () => {
    // a dissolved source cannot exceed its solubility (cap), so a 1 kg/m3 target is not reachable
    const req = request({ targetKind: 'well', wellTarget: '1000', solubility: '10' });
    const out = computeModeled(req);
    const o = out.modern!;
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    const lv = o.run.result.levels[0]!;
    expect(lv.level).toBeNull();
    expect(o.run.result.warnings.some((w) => w.code === 'cleanup.target-not-reachable')).toBe(true);
  }, 60000);

  it('reports a legacy refusal for a vadose profile the legacy method cannot describe, modern still runs', () => {
    const v = vadoseScenario({ ...VADOSE_FORM });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const vadose: VadoseFeed = {
      scenario: { ...v.scenario, legacy: null, legacyReason: 'too many layers' },
      method: 'modern',
      label: 'v',
    };
    const r = buildModeled(form({ source: 'vadose' }), db, {
      transport: transportFeed(),
      vadose,
      saturated: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.source.kind).toBe('vadose');
    const legacyOnly = computeModeled({ ...r.request, only: 'legacy' });
    expect(legacyOnly.modern).toBeUndefined();
    const l = legacyOnly.legacy!;
    expect(l.ok).toBe(false);
    if (!l.ok) expect(l.error).toMatch(/too many layers/);
  }, 60000);

  it('solves a soil source through the vadose column for the risk targets with both methods', () => {
    const v = vadoseScenario({ ...VADOSE_FORM });
    if (!v.ok) throw new Error('vadose scenario');
    const vadose: VadoseFeed = { scenario: v.scenario, method: 'modern', label: 'v' };
    const r = buildModeled(form({ source: 'vadose' }), db, {
      transport: transportFeed(),
      vadose,
      saturated: null,
    });
    if (!r.ok) throw new Error(r.errors.join('; '));
    const out = computeModeled(r.request);
    expect(out.medium).toBe('soil');
    for (const m of ['legacy', 'modern'] as const) {
      const o = out[m]!;
      if (!o.ok) throw new Error(o.error);
      const lv = o.run.result.levels[0]!;
      // either a level that meets the target to the acceptance, or an honest not-reachable report
      if (lv.level !== null) {
        expect(Math.abs(o.run.convergence.residual)).toBeLessThanOrEqual(
          o.run.convergence.acceptance,
        );
        expect(lv.level).toBeGreaterThan(0);
      } else {
        expect(o.run.result.warnings.length).toBeGreaterThan(0);
      }
    }
  }, 120000);
});

describe('review fixes (data and web)', () => {
  it('an MCL not in mass per volume (asbestos, fibers/L) is never a concentration target', () => {
    const asb = db.byId.get('1332-21-4');
    expect(asb).toBeDefined();
    const f = form({ chemicals: [newChemicalRow(asb!)], targetKind: 'well' });
    const r = buildModeled(f, db, { transport: transportFeed(), vadose: null, saturated: null });
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.request.chemical.mcl).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/fibers\/L/);
  });

  it('the chart and the solver share one start: a blank start behaves as the source concentration typed in', () => {
    const v = vadoseScenario({ ...VADOSE_FORM });
    if (!v.ok) throw new Error('vadose scenario');
    const vadose: VadoseFeed = { scenario: v.scenario, method: 'modern', label: 'v' };
    const r = buildModeled(form({ source: 'vadose' }), db, {
      transport: transportFeed(),
      vadose,
      saturated: null,
    });
    if (!r.ok) throw new Error(r.errors.join('; '));
    const { cc, start, chain } = chainChemicalFor(r.request, 'modern');
    expect(start).toBeGreaterThan(chain.reference);
    expect(cc.entered).toBe(start);
    const typed = chainChemicalFor({ ...r.request, start: 2e-4 }, 'modern');
    expect(typed.cc.entered).toBe(2e-4);
    expect(typed.start).toBe(2e-4);
  }, 60000);
});
