import { describe, expect, it } from 'vitest';
import { cleanupFeedsRead, riskFeedsRead } from './feedsRead';

const rows = [
  { id: '71-43-2', produceFromPlantsEco: true },
  { id: '108-88-3', produceFromPlantsEco: false },
];

describe('the produce stale check follows the chemical', () => {
  it('a risk row reads the produce feed only when it is the feed chemical', () => {
    expect(riskFeedsRead(rows, { produce: { chemicalId: '108-88-3' } })).toEqual([]);
    expect(riskFeedsRead(rows, { produce: { chemicalId: '71-43-2' } })).toEqual(['produce']);
  });

  it('an untagged or absent produce feed is read as before', () => {
    expect(riskFeedsRead(rows, { produce: {} })).toEqual(['produce']);
    expect(riskFeedsRead(rows, {})).toEqual(['produce']);
    expect(riskFeedsRead(rows)).toEqual(['produce']);
  });

  it('cleanup reads produce only for the matching row', () => {
    const form = { source: 'direct', chemicals: rows };
    expect(cleanupFeedsRead(form, { produce: { chemicalId: '108-88-3' } })).toEqual([]);
    expect(cleanupFeedsRead(form, { produce: { chemicalId: '71-43-2' } })).toEqual(['produce']);
    expect(cleanupFeedsRead(form, {})).toEqual(['produce']);
  });
});
