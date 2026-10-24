import { describe, expect, it } from 'vitest';
import { loadChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { defaultCleanupForm } from './form';
import {
  modeledLevelsFingerprint,
  modeledLevelsSchema,
  readSavedModeledLevels,
  summarizeModeledLevels,
  type SavedModeledLevels,
} from './modeledLevels';
import { fakeOutcome, savedFixture } from './modeledLevels.testkit';
import { savedLevelRows, savedLevelsTable } from './csv';
import { solubilityCeiling } from './solubility';

const ctx = {
  chemicalId: '1330-20-7',
  chemical: 'Xylenes',
  fingerprint: 'fp',
  source: 'dissolved' as const,
  notes: ['a note'],
};

describe('summarizeModeledLevels', () => {
  it('keeps the point levels of both methods and no curve', () => {
    const s = summarizeModeledLevels(
      fakeOutcome('groundwater', { modern: 0.481, legacy: 0.2 }),
      ctx,
    );
    expect(s.medium).toBe('groundwater');
    expect(s.methods.modern).toMatchObject({ ok: true, level: 0.481, limiting: 'noncancer' });
    expect(s.methods.legacy).toMatchObject({ ok: true, level: 0.2 });
    expect(JSON.stringify(s)).not.toContain('curve');
    expect(modeledLevelsSchema.safeParse(s).success).toBe(true);
  });

  it('keeps a target that is not reached as null, with a finite residual', () => {
    const s = summarizeModeledLevels(fakeOutcome('groundwater', { modern: null }), ctx);
    const m = s.methods.modern!;
    expect(m.ok && m.level).toBeNull();
    expect(m.ok && m.residual).toBeNull();
    expect(modeledLevelsSchema.safeParse(JSON.parse(JSON.stringify(s))).success).toBe(true);
  });

  it('keeps a method that did not run with its error', () => {
    const o = fakeOutcome('soil', { modern: 1 });
    (o as { legacy?: unknown }).legacy = { ok: false, error: 'bad input' };
    const s = summarizeModeledLevels(o, ctx);
    expect(s.methods.legacy).toEqual({ ok: false, error: 'bad input' });
  });
});

describe('readSavedModeledLevels', () => {
  it('reads each entry on its own and drops the ones that do not parse', () => {
    const good = savedFixture();
    const out = readSavedModeledLevels({ a: good, b: { chemicalId: 'b' }, c: 5 });
    expect(Object.keys(out)).toEqual(['a']);
    expect(readSavedModeledLevels(undefined)).toEqual({});
    expect(readSavedModeledLevels([])).toEqual({});
  });
});

describe('saved level rows', () => {
  const both = (): SavedModeledLevels => {
    const m = savedFixture().methods.modern!;
    if (!m.ok) throw new Error('fixture');
    return savedFixture({ methods: { modern: { ...m, cancerLevel: 0.9 } } });
  };

  it('prints the level in mg/L with no note when it is reached and both endpoints have a level', () => {
    const [row] = savedLevelRows(both());
    expect(row).toMatchObject({ chemical: 'Xylenes', level: 481, note: '', solubility: '' });
  });

  it('says in the note column when an endpoint has no level, so its empty cell is explained', () => {
    const [row] = savedLevelRows(savedFixture());
    expect(row!['cancerLevel']).toBeNull();
    expect(String(row!['note'])).toMatch(/^cancer level: no cancer endpoint/);
  });

  it('flags a dissolved level above the solubility, with the solubility and its source', async () => {
    const props = new Map([['1330-20-7', { s: 106 }]]);
    const ceiling = solubilityCeiling('', '1330-20-7', props, '2024-11');
    const [row] = savedLevelRows(savedFixture(), ceiling);
    expect(String(row!['solubility'])).toMatch(/481 mg\/L is above the solubility of 106 mg\/L/);
    expect(String(row!['solubility'])).toContain('2024-11');
  });

  it('does not flag a soil level against a solubility in mg/L', () => {
    const props = new Map([['1330-20-7', { s: 106 }]]);
    const ceiling = solubilityCeiling('', '1330-20-7', props, '2024-11');
    const soil = savedFixture({ medium: 'soil' });
    const [row] = savedLevelRows(soil, ceiling);
    expect(row!['solubility']).toBe('');
  });

  it('leaves a level that is not reached empty and gives the reason in the note column', () => {
    const base = savedFixture();
    const m = base.methods.modern!;
    if (!m.ok) throw new Error('fixture');
    const e = savedFixture({ methods: { modern: { ...m, level: null, limiting: null } } });
    const [row] = savedLevelRows(e);
    expect(row!['level']).toBeNull();
    expect(String(row!['note'])).toMatch(/not reached/);
    const table = savedLevelsTable(e);
    expect(table.missing).toEqual({
      keys: ['level', 'cancerLevel', 'noncancerLevel'],
      because: 'note',
    });
  });
});

describe('modeledLevelsFingerprint', () => {
  it('changes with an input of the solve and not with one it does not use', async () => {
    const db = await loadChemicalDb();
    const rec = db.byId.get('1330-20-7')!;
    const row = newChemicalRow(rec);
    const form = { ...defaultCleanupForm(), source: 'dissolved' as const, chemicals: [row] };
    const base = {
      cleanup: form,
      chemicalId: row.id,
      transportForm: { K: '10' },
      vadose: null,
      saturated: null,
      rec,
      edition: db.edition,
    };
    const fp = modeledLevelsFingerprint(base);
    expect(modeledLevelsFingerprint(base)).toBe(fp);
    // used by the solve
    expect(
      modeledLevelsFingerprint({ ...base, cleanup: { ...form, targetRisk: '1e-5' } }),
    ).not.toBe(fp);
    expect(modeledLevelsFingerprint({ ...base, cleanup: { ...form, solubility: '50' } })).not.toBe(
      fp,
    );
    expect(modeledLevelsFingerprint({ ...base, transportForm: { K: '11' } })).not.toBe(fp);
    expect(
      modeledLevelsFingerprint({
        ...base,
        rec: { ...rec, tox: { ...rec.tox, rfdo: { value: 123, source: 'user' } } },
      }),
    ).not.toBe(fp);
    // not used by the solve
    const withConc = { ...row, conc: { soil: '5' } };
    expect(modeledLevelsFingerprint({ ...base, cleanup: { ...form, chemicals: [withConc] } })).toBe(
      fp,
    );
    expect(
      modeledLevelsFingerprint({ ...base, cleanup: { ...form, ssg: { ...form.ssg, on: true } } }),
    ).toBe(fp);
  }, 30000);
});
