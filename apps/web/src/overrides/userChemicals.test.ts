import { beforeAll, describe, expect, it } from 'vitest';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { buildInputs } from '../risk/build';
import { defaultForm, newChemicalRow } from '../risk/form';
import { projectChemicalSchema, type ProjectChemical } from '../project/chemicals';
import { buildProject, chemicalsOf, defaultScreens, parseProject } from '../project';
import { USER_SOURCE } from './toxicity';
import { emptyOverrides } from './model';
import {
  applyUserChemicals,
  casProblem,
  effectiveDb,
  copiedValues,
  isUserChemical,
  missingFateLabels,
  nextUserId,
  userChemicalRows,
  userFateRows,
} from './userChemicals';
import { buildBrowse } from '../chemicals/browse';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const mine = (over: Partial<ProjectChemical> = {}): ProjectChemical => ({
  id: 'user-1',
  name: 'Test solvent',
  values: {
    rfdo: { value: '0.02', note: 'lab memo 2026' },
    koc: { value: '150', note: 'measured at site' },
    sfo: { value: '0.3', note: '' },
  },
  ...over,
});

describe('user chemical schema', () => {
  it('keeps cas and values through the schema and the project file', () => {
    const c = mine({ cas: '999-99-5' });
    expect(projectChemicalSchema.parse(c)).toEqual(c);
    const list = [c, { id: 'x', name: 'X' }];
    const doc = buildProject({ screens: defaultScreens(), chemicals: list, createdWith: 't' });
    const back = parseProject(JSON.parse(JSON.stringify(doc)));
    expect(back.ok).toBe(true);
    if (back.ok) expect(chemicalsOf(back.project)).toEqual(list);
  });
  it('tells a user chemical by its values', () => {
    expect(isUserChemical(mine())).toBe(true);
    expect(isUserChemical({ id: '71-43-2', name: 'Benzene' })).toBe(false);
  });
  it('numbers a new id after the last one', () => {
    expect(nextUserId([])).toBe('user-1');
    expect(nextUserId([mine({ id: 'user-3' }), { id: 'a', name: 'A' }])).toBe('user-4');
  });
});

describe('overlay into the chemical database', () => {
  it('puts a user record in byId with source user, using only usable values', () => {
    const out = applyUserChemicals(db, [mine()]);
    const rec = out.byId.get('user-1')!;
    expect(rec.name).toBe('Test solvent');
    expect(rec.tox.rfdo).toEqual({ value: 0.02, source: USER_SOURCE });
    // no note: not used
    expect(rec.tox.sfo).toBeUndefined();
    expect(out.sourceKeys[USER_SOURCE]).toBe('User value (this project)');
    expect(db.byId.has('user-1')).toBe(false);
  });
  it('returns the same database when there is no user chemical', () => {
    expect(applyUserChemicals(db, [{ id: '71-43-2', name: 'Benzene' }])).toBe(db);
  });
  it('is laid under the toxicity overrides by effectiveDb', () => {
    const out = effectiveDb(db, emptyOverrides(), [mine()]);
    expect(out.byId.get('user-1')).toBeDefined();
  });
  it('builds a risk row from the user record', () => {
    const eff = applyUserChemicals(db, [mine()]);
    const form = defaultForm();
    const row = newChemicalRow(eff.byId.get('user-1')!);
    form.chemicals = [{ ...row, conc: { soil: '10' } }];
    const built = buildInputs(form, eff, null);
    expect(built.ok).toBe(true);
  });
});

describe('fate rows', () => {
  it('gives a row with the usable fate values, and the labels of the missing ones', () => {
    const rows = userFateRows([mine()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('user-1');
    expect(rows[0]!.rsl.koc?.value).toBe(150);
    expect(rows[0]!.rsl.mw).toBeUndefined();
    expect(missingFateLabels(mine(), ['koc', 'hPrime'])).toEqual(["Henry's constant"]);
    expect(userFateRows([{ id: 'a', name: 'A' }])).toEqual([]);
  });
});

describe('CAS refusal', () => {
  const known = [{ cas: '71-43-2', name: 'Benzene' }];
  it('refuses a CAS the database holds, pointing at the overrides', () => {
    const p = casProblem('71-43-2', known);
    expect(p).toMatch(/Benzene/);
    expect(p).toMatch(/overrides/i);
  });
  it('refuses a malformed number and accepts a new one or blank', () => {
    expect(casProblem('abc', known)).toMatch(/CAS/);
    expect(casProblem('999-99-5', known)).toBeNull();
    expect(casProblem('', known)).toBeNull();
  });
});

describe('copy of a database chemical', () => {
  it('copies the values with a note that names the RSL source and the chemical', () => {
    const rec = db.byId.get('71-43-2')!;
    const full = buildBrowse(
      { chemicals: [], units: {} } as never,
      {
        edition: '2024-11',
        source: { retrieved: 'r' },
        units: { sfo: 'u', iur: 'u', rfdo: 'u', rfci: 'u', csat: 'u', mcl: 'u' },
        sourceKeys: { I: 'IRIS' },
        toxicity: [rec.tox],
      } as never,
    );
    const copy = copiedValues(full.records[0]!, '2024-11');
    expect(copy.cas).toBeUndefined();
    expect(Object.keys(copy.values).sort()).toEqual(['iur', 'rfci', 'rfdo', 'sfo']);
    expect(copy.values['sfo']!.note).toMatch(/Copied from the EPA RSL tables, edition 2024-11/);
    expect(copy.values['sfo']!.note).toMatch(/Benzene/i);
    expect(Number(copy.values['sfo']!.value)).toBe(rec.tox.sfo!.value);
  });
});

describe('report rows', () => {
  it('lists every value with its note, source user, and flags the unused', () => {
    const rows = userChemicalRows([mine({ cas: '999-99-5' }), { id: 'q', name: 'Q' }]);
    expect(rows.map((r) => r.label)).toEqual(['Oral slope factor', 'Oral reference dose', 'Koc']);
    const rfdo = rows.find((r) => r.label === 'Oral reference dose')!;
    expect(rfdo).toMatchObject({
      chemical: 'Test solvent',
      cas: '999-99-5',
      source: 'user',
      note: 'lab memo 2026',
      value: 0.02,
      applied: true,
    });
    expect(rows.find((r) => r.label === 'Oral slope factor')!.applied).toBe(false);
  });
});
