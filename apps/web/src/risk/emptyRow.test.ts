import { beforeAll, describe, expect, it } from 'vitest';
import { loadChemicalDb, type ChemicalDb } from './chemicalDb';
import { buildInputs } from './build';
import { runRisk } from './compute';
import { defaultForm, newChemicalRow, rowIsEmpty } from './form';
import { buildCleanup } from '../cleanup/build';
import { runCleanup } from '../cleanup/compute';
import { defaultCleanupForm } from '../cleanup/form';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const benzene = () => ({
  ...newChemicalRow(db.byId.get('71-43-2')!),
  conc: { groundwater: '0.005' },
});
const toluene = () => newChemicalRow(db.byId.get('108-88-3')!);

describe('a project chemical a screen holds no state for', () => {
  it('rowIsEmpty is true for default state and false once anything is set', () => {
    expect(rowIsEmpty(toluene())).toBe(true);
    expect(rowIsEmpty({ ...toluene(), conc: { soil: '1' } })).toBe(false);
    expect(rowIsEmpty({ ...toluene(), conc: { soil: ' ' } })).toBe(true);
    expect(rowIsEmpty({ ...toluene(), groundwaterFromWell: true })).toBe(false);
    expect(rowIsEmpty({ ...toluene(), outdoorFromHousehold: 'sprinkler' })).toBe(false);
    expect(rowIsEmpty({ ...toluene(), produceFromPlantsEco: true })).toBe(false);
  });

  it('the risk build computes nothing for the empty row and does not fail the other chemicals', () => {
    const form = { ...defaultForm(), chemicals: [benzene(), toluene()] };
    const r = buildInputs(form, db, null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = runRisk(r);
    expect(out.legacy.ok).toBe(true);
    expect(out.modern.ok).toBe(true);
    expect(r.legacy.receptors[0]!.pathways.length).toBeGreaterThan(0);
  });

  it('the cleanup build (individual allocation) still gives the levels for every row', () => {
    const form = { ...defaultCleanupForm(), chemicals: [benzene(), toluene()] };
    const r = buildCleanup(form, db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(runCleanup(r).legacy.ok).toBe(true);
  });

  it('the cleanup build with cumulative allocation does not fail when one row has no concentration', () => {
    const form = {
      ...defaultCleanupForm(),
      allocation: 'cumulative' as const,
      chemicals: [benzene(), toluene()],
    };
    const r = buildCleanup(form, db);
    expect(r.ok).toBe(true);
  });
});
