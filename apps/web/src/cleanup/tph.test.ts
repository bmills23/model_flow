import { describe, expect, it } from 'vitest';
import type { TphRiskFeed } from '../plantsEco/feeds';
import { TPH_METHOD_IDS, tphCsvTables, tphRows } from './csv';

// Arbitrary test values: the tests check what is written, not chemistry.
const FEED: TphRiskFeed = {
  methodId: 'tph.tphcwg',
  label: 'Total TPH, tph.tphcwg',
  targetHazardIndex: 1,
  totalMgPerKg: 640,
  fractions: [
    { label: 'Low', family: 'aliphatic', massFraction: 0.25, mapped: true, levelMgPerKg: 200 },
    { label: 'Medium', family: 'aliphatic', massFraction: 0.75, mapped: true, levelMgPerKg: 1000 },
    { label: 'Other', family: 'aromatic', massFraction: 0, mapped: false, levelMgPerKg: null },
  ],
  unmapped: ['Other'],
  warnings: [{ code: 'TPH_X', message: 'a warning' }],
};

describe('total TPH level CSV', () => {
  it('names the registered method ids of both fraction sets', () => {
    expect(TPH_METHOD_IDS).toEqual(['tph.tphcwg', 'tph.madep']);
  });

  it('writes the total first, then one row per fraction, in mg/kg at full precision', () => {
    const rows = tphRows(FEED);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      method: 'tph.tphcwg',
      item: 'Total TPH',
      levelMgPerKg: 640,
      targetHazardIndex: 1,
    });
    expect(rows[1]).toMatchObject({ item: 'Low', family: 'aliphatic', levelMgPerKg: 200 });
    expect(rows[3]).toMatchObject({ item: 'Other', mapped: 'no', levelMgPerKg: null });
  });

  it('is one table tied to the RSL edition', () => {
    const tables = tphCsvTables(FEED);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.name).toBe('cleanup-tph');
    expect(tables[0]!.editions).toEqual(['rsl']);
  });
});
