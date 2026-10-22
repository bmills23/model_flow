import { describe, expect, it } from 'vitest';
import { followList, rowsMissingFromList } from './chemicalRows';

interface R {
  id: string;
  name: string;
  note?: string;
}
const make = (id: string, name: string): R | null => (id === 'unknown' ? null : { id, name });

describe('followList', () => {
  it('appends a row for each list entry the rows lack, in list order, keeping existing rows as they are', () => {
    const rows: R[] = [{ id: 'b', name: 'B', note: 'kept' }];
    const out = followList(
      rows,
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      new Set(),
      make,
    );
    expect(out.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(out[0]).toBe(rows[0]);
  });

  it('drops a row only when its chemical was removed from the list', () => {
    const rows: R[] = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];
    const out = followList(rows, [{ id: 'a', name: 'A' }], new Set(['b']), make);
    expect(out.map((r) => r.id)).toEqual(['a']);
    // a row the list has never held is kept (it is added to the list instead)
    const kept = followList(rows, [{ id: 'a', name: 'A' }], new Set(), make);
    expect(kept.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('skips a chemical the screen cannot make a row for, and returns the same array when nothing changes', () => {
    const rows: R[] = [{ id: 'a', name: 'A' }];
    expect(followList(rows, [{ id: 'unknown', name: 'U' }], new Set(), make)).toBe(rows);
    expect(followList(rows, [{ id: 'a', name: 'A' }], new Set(), make)).toBe(rows);
  });
});

describe('rowsMissingFromList', () => {
  it('lists the rows whose chemical the list lacks, once each', () => {
    const rows: R[] = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];
    expect(rowsMissingFromList(rows, [{ id: 'a', name: 'A' }], new Set())).toEqual([
      { id: 'b', name: 'B' },
    ]);
    expect(rowsMissingFromList(rows, [{ id: 'a', name: 'A' }], new Set(['b']))).toEqual([]);
  });
});
