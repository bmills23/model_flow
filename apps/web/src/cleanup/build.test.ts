import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { buildCleanup } from './build';
import { runCleanup } from './compute';
import { defaultCleanupForm, type CleanupForm } from './form';
import { newChemicalRow } from '../risk/form';
import { computeSsg, loadCleanupProps, type CleanupProps } from './ssg';

let db: ChemicalDb;
let props: CleanupProps;
beforeAll(async () => {
  db = await loadChemicalDb();
  props = await loadCleanupProps();
}, 30000);

const BENZENE = '71-43-2';
const TAP: PathwayId[] = ['waterIngestion', 'waterDermal'];

function formWith(
  rows: { id: string; conc?: Record<string, string> }[],
  over: Partial<CleanupForm> = {},
): CleanupForm {
  const f = defaultCleanupForm();
  return {
    ...f,
    chemicals: rows.map((r) => ({ ...newChemicalRow(db.byId.get(r.id)!), conc: r.conc ?? {} })),
    ...over,
  };
}

/** Receptor A with only the listed pathways on. */
function only(form: CleanupForm, on: PathwayId[]): CleanupForm {
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, on.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  return { ...form, a: { ...form.a, pathways } };
}

function built(form: CleanupForm) {
  const r = buildCleanup(form, db);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r;
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('buildCleanup', () => {
  it('needs no concentration for the individual levels and keeps the switched-on pathways', () => {
    const r = built(only(formWith([{ id: BENZENE }]), TAP));
    expect(r.modern.receptors[0]!.pathways).toEqual(TAP);
    expect(r.legacy.receptors[0]!.pathways).toEqual(TAP);
    expect(r.modern.allocation).toBe('individual');
  });

  it('H1 through the screen path: benzene in tap water, modern resident (mg/L, 1e-7)', () => {
    const r = built(only(formWith([{ id: BENZENE }]), TAP));
    const out = runCleanup(r);
    expect(out.modern.ok).toBe(true);
    if (!out.modern.ok) return;
    const gw = out.modern.result.media.find((m) => m.medium === 'groundwater')!;
    const lv = gw.levels[0]!;
    // SI kg/m^3 times 1e3 is mg/L
    expect(rel(lv.cancerLevel! * 1e3, 1.2381251e-3)).toBeLessThan(1e-7);
    expect(rel(lv.noncancerLevel! * 1e3, 7.0833327e-2)).toBeLessThan(1e-7);
    expect(lv.limiting).toBe('cancer');
    expect(lv.noncancerGroup).toBe('child');
  });

  it('passes the target risk and hazard quotient, defaulting blanks to 1e-6 and 1', () => {
    const base = only(formWith([{ id: BENZENE }]), TAP);
    expect(built(base).modern.targets).toEqual({});
    const r = built({ ...base, targetRisk: '1e-5', targetHq: '0.5' });
    expect(r.modern.targets).toEqual({ risk: 1e-5, hq: 0.5 });
    const out = runCleanup(r);
    const def = runCleanup(built(base));
    if (!out.modern.ok || !def.modern.ok) throw new Error('did not run');
    const a = out.modern.result.media[0]!.levels[0]!;
    const b = def.modern.result.media[0]!.levels[0]!;
    expect(rel(a.cancerLevel!, b.cancerLevel! * 10)).toBeLessThan(1e-12);
    expect(rel(a.noncancerLevel!, b.noncancerLevel! * 0.5)).toBeLessThan(1e-12);
  });

  it('rejects a non-positive or unreadable target', () => {
    const base = only(formWith([{ id: BENZENE }]), TAP);
    const r = buildCleanup({ ...base, targetRisk: '0' }, db);
    expect(r.ok).toBe(false);
    const r2 = buildCleanup({ ...base, targetHq: 'abc' }, db);
    expect(r2.ok).toBe(false);
  });

  it('asks for a chemical first and for a pathway', () => {
    const none = buildCleanup(defaultCleanupForm(), db);
    expect(none.ok).toBe(false);
    const nopath = buildCleanup(only(formWith([{ id: BENZENE }]), []), db);
    expect(nopath.ok).toBe(false);
  });

  it('cumulative: media without an entered concentration drop out with a note; blanks count as zero', () => {
    const form = only(
      formWith(
        [
          { id: BENZENE, conc: { groundwater: '0.01' } },
          { id: '7440-38-2', conc: {} },
        ],
        { allocation: 'cumulative' },
      ),
      [...TAP, 'soilIngestion'],
    );
    const r = built(form);
    expect(r.modern.receptors[0]!.pathways).toEqual(TAP);
    expect(r.notes.join(' ')).toMatch(/soil.*no concentration/i);
    const ch = r.modern.chemicals;
    expect(ch[0]!.entered!.groundwater).toBeCloseTo(1e-5, 15);
    expect(ch[1]!.entered!.groundwater).toBe(0);
  });

  it('H2 through the screen path: ratio benzene to arsenic stays 5 and the scaled mix meets the target', () => {
    const form = only(
      formWith(
        [
          { id: BENZENE, conc: { groundwater: '0.01' } },
          { id: '7440-38-2', conc: { groundwater: '0.002' } },
        ],
        { allocation: 'cumulative' },
      ),
      TAP,
    );
    const out = runCleanup(built(form));
    if (!out.modern.ok) throw new Error(out.modern.error);
    const m = out.modern.result.media[0]!;
    const [b, a] = m.levels;
    expect(rel(b!.level! / a!.level!, 5)).toBeLessThan(1e-12);
    expect(m.scale).not.toBeNull();
    expect(m.allocation).toBe('cumulative');
  });

  it('adds the additive flag only with two receptors', () => {
    const form = { ...only(formWith([{ id: BENZENE }]), TAP), additive: true };
    expect(buildCleanup(form, db).ok).toBe(true);
    const two = buildCleanup({ ...form, b: { ...form.a, preset: 'worker' } }, db);
    expect(two.ok).toBe(true);
    if (two.ok) expect(two.legacy.additive).toBe(true);
  });
});

describe('computeSsg (H3 through the screen)', () => {
  const ssgForm = (over: Partial<CleanupForm['ssg']> = {}, ids: string[] = [BENZENE]) => {
    const f = formWith(ids.map((id) => ({ id })));
    return { ...f, ssg: { ...f.ssg, on: true, ...over } };
  };
  const rowOf = (form: CleanupForm, i = 0) => {
    const r = computeSsg(form, db, props);
    if (!r.ok) throw new Error(r.errors.join('; '));
    const row = r.rows[i]!;
    if (!row.ok) throw new Error(row.reason);
    return row;
  };

  it('site-specific DAF, aquifer 10 m: DAF 12.71548841 and benzene 3.25430114e-2 mg/kg', () => {
    const row = rowOf(ssgForm({ daf: 'site', targetKind: 'mcl' }));
    expect(rel(row.result.daf, 12.71548841)).toBeLessThan(1e-9);
    expect(row.result.mixingDepth).toBeCloseTo(5.19619198, 8);
    expect(rel(row.result.level * 1e6, 3.25430114e-2)).toBeLessThan(1e-9);
    expect(row.warnings.map((w) => w.code)).not.toContain('cleanup.mixing-depth-capped');
  });

  it('a 3 m aquifer caps the mixing depth, DAF 7.76388889, and says so', () => {
    const row = rowOf(ssgForm({ daf: 'site', siteDa: '3' }));
    expect(rel(row.result.daf, 7.76388889)).toBeLessThan(1e-9);
    expect(row.result.mixingDepth).toBe(3);
    expect(row.warnings.map((w) => w.code)).toContain('cleanup.mixing-depth-capped');
  });

  it('generic DAF 1 and 20 scale the level by 20 and sit beside the published MCL-based SSL', () => {
    const one = rowOf(ssgForm({ daf: '1' }));
    const twenty = rowOf(ssgForm({ daf: '20' }));
    expect(rel(twenty.result.level / one.result.level, 20)).toBeLessThan(1e-12);
    expect(one.published.mcl).toBe(0.0026);
    expect(one.compare?.kind).toBe('mcl');
    expect(one.compare!.ratio).toBeGreaterThan(0.98);
    expect(one.compare!.ratio).toBeLessThan(1.02);
    expect(twenty.compare).toBeUndefined();
  });

  it('the mass-limit level governs for a shallow source and is warned', () => {
    const deep = rowOf(ssgForm({ daf: '20', sourceDepth: '2000' }));
    expect(deep.result.governs).toBe('partition');
    const shallow = rowOf(ssgForm({ daf: '20', sourceDepth: '0.01' }));
    expect(shallow.result.governs).toBe('mass-limit');
    expect(shallow.warnings.map((w) => w.code)).toContain('cleanup.mass-limit-governs');
  });

  it('a user target replaces the MCL; the risk-based tap water level warns for a volatile chemical', () => {
    const user = rowOf(ssgForm({ daf: '1', targetKind: 'user', userTarget: '10' }));
    const mcl = rowOf(ssgForm({ daf: '1' }));
    expect(rel(user.result.level / mcl.result.level, 2)).toBeLessThan(1e-12);
    const tap = rowOf(ssgForm({ daf: '1', targetKind: 'tap' }));
    expect(tap.targetUgL).toBeGreaterThan(0);
    expect(tap.warnings.map((w) => w.code)).toContain('cleanup.tapwater-inhalation-omitted');
    expect(tap.compare?.kind).toBe('risk');
  });

  it('flags a level above the soil saturation limit', () => {
    const row = rowOf(ssgForm({ daf: '20', targetKind: 'user', userTarget: '1e9' }));
    expect(row.warnings.map((w) => w.code)).toContain('cleanup.csat-exceeded');
  });

  it('says why a chemical without an MCL or partition data has no level, and rejects bad numbers', () => {
    const noMcl = computeSsg(ssgForm({}, ['91-20-3', BENZENE]), db, props);
    if (!noMcl.ok) throw new Error('should build');
    expect(noMcl.rows).toHaveLength(2);
    const first = noMcl.rows[0]!;
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.reason).toMatch(/no mcl/i);
    expect(noMcl.rows[1]!.ok).toBe(true);
    const bad = computeSsg(ssgForm({ siteK: '-1', daf: 'site' }), db, props);
    expect(bad.ok).toBe(false);
  });
});
