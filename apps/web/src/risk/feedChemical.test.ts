import { beforeAll, describe, expect, it } from 'vitest';
import { loadChemicalDb, type ChemicalDb } from './chemicalDb';
import { buildInputs } from './build';
import { defaultForm, newChemicalRow, type RiskForm } from './form';
import type { WellFeed } from '../transport/wellFeed';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const YR = 365.25 * 86400;
const BENZENE = '71-43-2';
const TOLUENE = '108-88-3';

type Row = { id: string; conc?: Record<string, string>; well?: boolean; surface?: boolean };

function formWith(rows: Row[]): RiskForm {
  const f: RiskForm = {
    ...defaultForm(),
    chemicals: rows.map((r) => ({
      ...newChemicalRow(db.byId.get(r.id)!),
      conc: r.conc ?? {},
      groundwaterFromWell: r.well ?? false,
      surfaceWaterFromModel: r.surface ?? false,
    })),
  };
  f.a.pathways.swimIngestion = true;
  f.a.swimTime = '2';
  f.a.swimDays = '30';
  return f;
}

const well = (chemicalId?: string): WellFeed => ({
  method: 'modern',
  label: 'Receptor well, modern method',
  times: [0, 10 * YR, 20 * YR],
  values: [0, 1e-6, 4e-6],
  ...(chemicalId ? { chemicalId } : {}),
});
const surf = (chemicalId?: string): SurfaceWaterFeed => ({
  method: 'well-mixed',
  origin: 'surfaceWater.well-mixed',
  label: 'Legacy well-mixed surface water',
  times: [10 * YR, 20 * YR],
  values: [1e-6, 4e-6],
  ...(chemicalId ? { chemicalId } : {}),
});

describe('well result tagged by chemical', () => {
  it('errors the other row with both chemicals named and keeps the matching row', () => {
    const f = formWith([
      { id: BENZENE, well: true },
      { id: TOLUENE, well: true },
    ]);
    const r = buildInputs(f, db, well(BENZENE));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toMatch(/^Toluene: .*is for Benzene, not Toluene/i);
    }
  });

  it('gives the series to the matching row when the other row reads no well', () => {
    const f = formWith([
      { id: BENZENE, well: true },
      { id: TOLUENE, conc: { groundwater: '0.01' } },
    ]);
    const r = buildInputs(f, db, well(BENZENE));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ben = r.legacy.receptors[0]!.chemicals[0]!;
      expect(ben.epcs.waterIngestion).toMatchObject({ kind: 'series', origin: 'transport.modern' });
    }
  });

  it('errors a single row whose well result is for another chemical', () => {
    const r = buildInputs(formWith([{ id: TOLUENE, well: true }]), db, well(BENZENE));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/Toluene: .*is for Benzene, not Toluene/i);
  });

  it('takes an untagged well result when the run holds one chemical', () => {
    expect(buildInputs(formWith([{ id: BENZENE, well: true }]), db, well()).ok).toBe(true);
  });

  it('refuses an untagged well result in a run of two chemicals, naming the feed', () => {
    const f = formWith([
      { id: BENZENE, well: true },
      { id: TOLUENE, well: true },
    ]);
    const r = buildInputs(f, db, well());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(2);
      expect(r.errors.join(' ')).toMatch(/well result does not record which chemical/i);
    }
  });
});

describe('surface water result tagged by chemical', () => {
  const two = () =>
    formWith([
      { id: BENZENE, surface: true },
      { id: TOLUENE, surface: true },
    ]);

  it('errors the other row naming both chemicals', () => {
    const r = buildInputs(two(), db, null, null, surf(BENZENE));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toMatch(/^Toluene: .*is for Benzene, not Toluene/i);
    }
  });

  it('keeps the matching row value', () => {
    const f = formWith([
      { id: BENZENE, surface: true },
      { id: TOLUENE, conc: { surfaceWater: '0.01' } },
    ]);
    const r = buildInputs(f, db, null, null, surf(BENZENE));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ben = r.legacy.receptors[0]!.chemicals[0]!;
      expect(ben.epcs.swimIngestion).toMatchObject({ kind: 'series' });
    }
  });

  it('takes an untagged result in a single-chemical run and refuses it in two', () => {
    const one = formWith([{ id: BENZENE, surface: true }]);
    expect(buildInputs(one, db, null, null, surf()).ok).toBe(true);
    const r = buildInputs(two(), db, null, null, surf());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/surface water result does not record/i);
  });
});
