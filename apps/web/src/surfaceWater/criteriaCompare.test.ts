// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_HARDNESS } from '@model-flow/engine';
import { compute } from './compute';
import { compareAll } from './criteriaCompare';
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
