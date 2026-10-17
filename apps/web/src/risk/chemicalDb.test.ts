import { beforeAll, describe, expect, it } from 'vitest';
import { loadChemicalDb, searchChemicals, toxRows, type ChemicalDb } from './chemicalDb';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

describe('chemical database', () => {
  it('joins the 890 chemical and toxicity rows by id', () => {
    expect(db.chemicals.length).toBe(890);
    expect(db.chemicals.every((c) => c.tox.id === c.id && c.phys?.id === c.id)).toBe(true);
    expect(db.edition).toBe('2024-11');
  });

  it('loads once and returns the same object afterwards', async () => {
    expect(await loadChemicalDb()).toBe(db);
  });

  it('finds a chemical by name, best match first, case-insensitively', () => {
    const hits = searchChemicals(db, 'BENZENE');
    expect(hits[0]?.name).toBe('Benzene');
    expect(hits.length).toBeGreaterThan(3);
    expect(hits.every((h) => h.name.toLowerCase().includes('benzene'))).toBe(true);
  });

  it('finds a chemical by CAS number and by a part of it', () => {
    expect(searchChemicals(db, '71-43-2').map((c) => c.name)).toEqual(['Benzene']);
    expect(searchChemicals(db, '7440-38').map((c) => c.id)).toContain('7440-38-2');
  });

  it('caps the number of hits and returns nothing for a blank query', () => {
    expect(searchChemicals(db, 'a', 5).length).toBe(5);
    expect(searchChemicals(db, '   ')).toEqual([]);
    expect(searchChemicals(db, 'zzzz-not-a-chemical')).toEqual([]);
  });

  it('lists every toxicity value of benzene with its RSL unit and the source it came from', () => {
    const benzene = db.byId.get('71-43-2')!;
    const rows = toxRows(benzene, db.sourceKeys);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.sfo).toMatchObject({ value: 0.055, unit: '(mg/kg-d)^-1', source: 'IRIS' });
    expect(byKey.iur).toMatchObject({ value: 7.8e-6, unit: '(ug/m3)^-1', source: 'IRIS' });
    expect(byKey.rfdo).toMatchObject({ value: 0.004, unit: 'mg/kg-d', source: 'IRIS' });
    expect(byKey.rfci).toMatchObject({ value: 0.03, unit: 'mg/m3', source: 'IRIS' });
  });

  it('names the other source of a value (Cal EPA for the arsenic reference concentration)', () => {
    const rows = toxRows(db.byId.get('7440-38-2')!, db.sourceKeys);
    expect(rows.find((r) => r.key === 'rfci')?.source).toBe('Cal EPA OEHHA');
  });

  it('omits a value the RSL does not give, rather than showing zero', () => {
    const rows = toxRows(db.byId.get('30560-19-1')!, db.sourceKeys); // acephate: oral reference dose only
    expect(rows.map((r) => r.key)).toEqual(['rfdo']);
  });
});
