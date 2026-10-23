import { beforeAll, describe, expect, it } from 'vitest';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { buildInputs } from '../risk/build';
import { runRisk } from '../risk/compute';
import { defaultForm, newChemicalRow } from '../risk/form';
import { buildCleanup } from '../cleanup/build';
import { runCleanup } from '../cleanup/compute';
import { defaultCleanupForm } from '../cleanup/form';
import {
  emptyOverrides,
  entryProblem,
  isEmpty,
  resetField,
  setField,
  usableValue,
  type OverridesState,
} from './model';
import { applyToxOverrides, overrideRows, USER_SOURCE } from './toxicity';
import { fromProject, overridesSchema, toProject } from './project';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const BENZENE = '71-43-2';
const withField = (
  field: string,
  value: string,
  note = 'site toxicologist memo',
): OverridesState => ({
  ...emptyOverrides(),
  toxicity: setField({}, BENZENE, field, { value, note }),
});

describe('override model', () => {
  it('requires a positive number and a source note', () => {
    expect(usableValue({ value: '0.1', note: 'x' })).toBe(0.1);
    expect(usableValue({ value: '0.1', note: '  ' })).toBeNull();
    expect(usableValue({ value: '', note: 'x' })).toBeNull();
    expect(usableValue({ value: '-1', note: 'x' })).toBeNull();
    expect(usableValue({ value: '0', note: 'x' })).toBeNull();
    expect(usableValue({ value: 'abc', note: 'x' })).toBeNull();
    expect(entryProblem({ value: '0.1', note: '' })).toMatch(/source note/i);
    expect(entryProblem({ value: 'abc', note: 'x' })).toMatch(/above zero/i);
    expect(entryProblem({ value: '0.1', note: 'x' })).toBeNull();
  });

  it('sets and resets a field without mutating, dropping empty subjects', () => {
    const a = setField({}, 'c1', 'sfo', { value: '1', note: 'n' });
    const b = setField(a, 'c1', 'rfdo', { value: '2', note: 'n' });
    expect(Object.keys(a['c1']!)).toEqual(['sfo']);
    expect(Object.keys(b['c1']!).sort()).toEqual(['rfdo', 'sfo']);
    const c = resetField(resetField(b, 'c1', 'sfo'), 'c1', 'rfdo');
    expect(c).toEqual({});
    expect(isEmpty({ ...emptyOverrides(), toxicity: c })).toBe(true);
  });
});

describe('applyToxOverrides', () => {
  it('returns the same database when nothing is usable', () => {
    expect(applyToxOverrides(db, emptyOverrides())).toBe(db);
    expect(applyToxOverrides(db, withField('sfo', '0.1', ''))).toBe(db);
  });

  it('replaces the value, marks the source and keeps the database value', () => {
    const eff = applyToxOverrides(db, withField('sfo', '0.5'));
    const rec = eff.byId.get(BENZENE)!;
    expect(rec.tox.sfo).toEqual({ value: 0.5, source: USER_SOURCE });
    expect(rec.dbTox?.sfo).toEqual(db.byId.get(BENZENE)!.tox.sfo);
    expect(eff.sourceKeys[USER_SOURCE]).toMatch(/project/i);
    expect(db.byId.get(BENZENE)!.tox.sfo!.value).not.toBe(0.5);
  });

  it('can supply a value the database lacks', () => {
    const none = db.chemicals.find((c) => c.tox.rfci === undefined)!;
    const eff = applyToxOverrides(db, {
      ...emptyOverrides(),
      toxicity: setField({}, none.id, 'rfci', { value: '0.02', note: 'n' }),
    });
    expect(eff.byId.get(none.id)!.tox.rfci?.value).toBe(0.02);
  });

  it('lists overrides for the report with the database value and note', () => {
    const rows = overrideRows(db, withField('sfo', '0.5'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      chemical: 'Benzene',
      cas: BENZENE,
      label: 'Oral slope factor',
      userValue: 0.5,
      note: 'site toxicologist memo',
      applied: true,
    });
    expect(rows[0]!.dbValue).toBe(db.byId.get(BENZENE)!.tox.sfo!.value);
    expect(overrideRows(db, withField('sfo', '0.5', ''))[0]!.applied).toBe(false);
  });
});

describe('overrides change results by the expected ratio', () => {
  const waterForm = () => {
    const f = defaultForm();
    f.a.pathways = Object.fromEntries(
      Object.keys(f.a.pathways).map((k) => [k, false]),
    ) as typeof f.a.pathways;
    f.a.pathways.waterIngestion = true;
    return {
      ...f,
      chemicals: [{ ...newChemicalRow(db.byId.get(BENZENE)!), conc: { groundwater: '0.005' } }],
    };
  };
  const dbSfo = () => db.byId.get(BENZENE)!.tox.sfo!.value;
  const dbRfd = () => db.byId.get(BENZENE)!.tox.rfdo!.value;

  const risk = (d: ChemicalDb) => {
    const b = buildInputs(waterForm(), d, null);
    if (!b.ok) throw new Error(b.errors.join(';'));
    const o = runRisk(b);
    if (!o.legacy.ok || !o.modern.ok) throw new Error('a method failed');
    const leg = o.legacy.result.summary.receptors[0]!;
    return {
      legacy: leg.cancerRisk,
      modern: o.modern.result.summary.receptors[0]!.cancerRisk,
    };
  };

  it('doubles the drinking water cancer risk of both methods when the slope factor doubles', () => {
    const base = risk(db);
    const eff = risk(applyToxOverrides(db, withField('sfo', String(dbSfo() * 2))));
    expect(eff.legacy / base.legacy).toBeCloseTo(2, 9);
    expect(eff.modern / base.modern).toBeCloseTo(2, 9);
  });

  it('applies the trichloroethylene equations to an overridden slope factor, in proportion, and warns', () => {
    const TCE = '79-01-6';
    const form = () => {
      const f = waterForm();
      return {
        ...f,
        chemicals: [{ ...newChemicalRow(db.byId.get(TCE)!), conc: { groundwater: '0.005' } }],
      };
    };
    const modern = (d: ChemicalDb) => {
      const b = buildInputs(form(), d, null);
      if (!b.ok) throw new Error(b.errors.join(';'));
      const o = runRisk(b);
      if (!o.modern.ok) throw new Error('the modern method failed');
      return {
        risk: o.modern.result.summary.receptors[0]!.cancerRisk,
        codes: o.modern.result.warnings.map((w) => w.code),
      };
    };
    const sfo = db.byId.get(TCE)!.tox.sfo!.value;
    const base = modern(db);
    const eff = modern(
      applyToxOverrides(db, {
        ...emptyOverrides(),
        toxicity: setField({}, TCE, 'sfo', { value: String(sfo * 2), note: 'site memo' }),
      }),
    );
    expect(eff.risk / base.risk).toBeCloseTo(2, 9);
    expect(base.codes).not.toContain('exposure.special-case-override');
    expect(base.codes).not.toContain('exposure.special-case-not-modelled');
    expect(eff.codes).toContain('exposure.special-case-override');
  });

  it('restores the database result when the override is removed', () => {
    const base = risk(db);
    const set = withField('sfo', String(dbSfo() * 3));
    const removed: OverridesState = { ...set, toxicity: resetField(set.toxicity, BENZENE, 'sfo') };
    expect(risk(applyToxOverrides(db, removed))).toEqual(base);
  });

  const levels = (d: ChemicalDb) => {
    const f = defaultCleanupForm();
    f.a.pathways = Object.fromEntries(
      Object.keys(f.a.pathways).map((k) => [k, false]),
    ) as typeof f.a.pathways;
    f.a.pathways.waterIngestion = true;
    f.chemicals = [{ ...newChemicalRow(d.byId.get(BENZENE)!), conc: {} }];
    f.targetRisk = '1e-6';
    f.targetHq = '1';
    const b = buildCleanup(f, d);
    if (!b.ok) throw new Error(b.errors.join(';'));
    const out = runCleanup(b);
    if (!out.legacy.ok) throw new Error('legacy failed');
    const lv = out.legacy.result.media
      .find((m) => m.medium === 'groundwater')!
      .levels.find((l) => l.chemical === BENZENE)!;
    return { cancer: lv.cancerLevel, noncancer: lv.noncancerLevel };
  };

  it('halves the cancer cleanup level when the slope factor doubles, and the noncancer level with the reference dose', () => {
    const base = levels(db);
    const sfo = levels(applyToxOverrides(db, withField('sfo', String(dbSfo() * 2))));
    expect(sfo.cancer! / base.cancer!).toBeCloseTo(0.5, 9);
    expect(sfo.noncancer).toBe(base.noncancer);
    const rfd = levels(applyToxOverrides(db, withField('rfdo', String(dbRfd() / 2))));
    expect(rfd.noncancer! / base.noncancer!).toBeCloseTo(0.5, 9);
    expect(rfd.cancer).toBe(base.cancer);
  });
});

describe('overrides project state', () => {
  it('round trips and stays absent when empty', () => {
    expect(toProject(emptyOverrides())).toBeUndefined();
    const s = withField('sfo', '0.5');
    const back = fromProject(overridesSchema.parse(JSON.parse(JSON.stringify(toProject(s)))));
    expect(back).toEqual(s);
    expect(fromProject(undefined)).toEqual(emptyOverrides());
  });
});
