import { describe, expect, it } from 'vitest';
import { cleanupFeedsRead, riskFeedsRead } from './feedsRead';
import { staleAmong } from './staleFeeds';

const rows = [
  { id: '71-43-2', produceFromPlantsEco: true },
  { id: '108-88-3', produceFromPlantsEco: false },
];
const slot = (chemicalId: string) => ({ feed: 'produce' as const, chemicalId });

describe('the produce stale check follows the chemical (one slot per chemical)', () => {
  it('a risk row reads its own chemical produce slot, so another chemical slot does not mark it', () => {
    const reads = riskFeedsRead(rows);
    expect(reads).toEqual([{ feed: 'produce', chemicalId: '71-43-2' }]);
    expect(staleAmong(reads, [slot('108-88-3')])).toEqual([]);
    expect(staleAmong(reads, [slot('71-43-2')])).toEqual([slot('71-43-2')]);
  });

  it('an untagged produce slot is read as before', () => {
    expect(staleAmong(riskFeedsRead(rows), [slot('')])).toEqual([slot('')]);
  });

  it('cleanup reads produce only for the matching row', () => {
    const form = { source: 'direct', chemicals: rows };
    const reads = cleanupFeedsRead(form, {});
    expect(reads).toEqual([{ feed: 'produce', chemicalId: '71-43-2' }]);
    expect(staleAmong(reads, [slot('108-88-3')])).toEqual([]);
  });
});
