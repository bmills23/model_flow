import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { buildCleanup } from './build';
import { runCleanup } from './compute';
import { defaultCleanupForm, type CleanupForm } from './form';
import { newChemicalRow } from '../risk/form';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
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
