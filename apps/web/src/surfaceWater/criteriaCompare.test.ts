// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_HARDNESS } from '@model-flow/engine';
import { compute } from './compute';
import { compareAll, coveredBy, coveredCsvRows, coveringRows } from './criteriaCompare';
import { loadCriteriaDbFor } from './criteriaSets';
import { loadCriteriaDb, type CriteriaDb } from './criteriaDb';
import { DEFAULT_FORM, toRequest } from './inputs';
import { reportCriteria } from './reportCriteria';

const ARSENIC = '7440-38-2';

const run = (over: Partial<typeof DEFAULT_FORM>) => {
  const r = toRequest({ ...DEFAULT_FORM, ...over }, null);
  if (!r.ok) throw new Error(r.errors.join('; '));
  const out = compute(r.request);
  if (!out.ok) throw new Error(out.error);
  return out.result;
};

let db: CriteriaDb;
beforeAll(async () => {
  db = await loadCriteriaDb();
}, 60000);

describe('compareAll and the sediment switch', () => {
  it('compares sediment only when the sediment screen section is on', () => {
    const chemical = db.chemicals.find((c) => c.id === ARSENIC)!;
    expect(chemical.hasSediment).toBe(true);
    const on = compareAll(db, chemical, run({ sedimentOn: true }), { foc: 0.01 });
    const off = compareAll(db, chemical, run({ sedimentOn: false }), {});
    expect(on.some((c) => c.medium === 'sediment')).toBe(true);
    expect(off.some((c) => c.medium === 'sediment')).toBe(false);
    expect(off.some((c) => c.medium === 'surfaceWater')).toBe(true);
  });
});

describe('reportCriteria', () => {
  it('names the default hardness from the engine constant', async () => {
    const out = await reportCriteria('us', ARSENIC, run({ sedimentOn: false }), undefined);
    expect(out).not.toBeNull();
    expect(out!.note).toContain(`default hardness of ${DEFAULT_HARDNESS} mg/L as CaCO3`);
  });

  it('prints no sediment row while sediment is off', async () => {
    const out = await reportCriteria('us', ARSENIC, run({ sedimentOn: false }), undefined);
    expect(out!.rows.some((r) => r['medium'] === 'sediment')).toBe(false);
  });
});

describe('a chemical covered by a group row', () => {
  const PFOS = '1763-23-1';
  it('shows the covering row name and value instead of saying the set lacks the chemical', async () => {
    const eu = await loadCriteriaDbFor('eu2026');
    const pointer = coveredBy(eu, PFOS)!;
    expect(pointer.group.name).toMatch(/PFAS/);
    const rows = coveringRows(eu, pointer);
    expect(rows.map((r) => r.value)).toEqual([0.0044, 0.0044]);
    const csv = coveredCsvRows(eu, { id: PFOS, name: pointer.name }, pointer);
    expect(csv).toHaveLength(2);
    expect(csv[0]).toMatchObject({
      chemicalId: PFOS,
      status: 'covered by group',
      criterionValue: 0.0044,
      peak: null,
      ratio: null,
    });
    expect(String(csv[0]!['note'])).toMatch(/entry 35.*Covered by substance group 65.*entry 65/s);
  });

  it('is in the report with the covering row, and a chemical with no pointer still returns null', async () => {
    const out = await reportCriteria('eu2026', PFOS, run({ sedimentOn: false }), undefined);
    expect(out).not.toBeNull();
    expect(out!.rows.every((r) => r['status'] === 'covered by group')).toBe(true);
    expect(out!.note).toContain('Covered by substance group 65');
    expect(
      await reportCriteria('eu2026', '999-99-9', run({ sedimentOn: false }), undefined),
    ).toBeNull();
  });

  it('does not use the pointer for a chemical the set has rows for', async () => {
    const eu = await loadCriteriaDbFor('eu2026');
    expect(coveredBy(eu, '71-43-2')).toBeUndefined();
  });
});
