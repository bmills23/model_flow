import { describe, expect, it } from 'vitest';
import { emptyOverrides } from './model';
import { applyFateOverrides, fateKeysUsed } from './fate';
import { fromProject, toProject } from './project';
import type { VaporChemicalRow } from '../vapor/chemicals';

const rows: VaporChemicalRow[] = [
  { id: 'a', name: 'A', rsl: { koc: { value: 10 }, s: { value: 5 } } },
  { id: 'b', name: 'B', rsl: { koc: { value: 20 } } },
];

describe('fate edits', () => {
  it('lays a usable edit over the database value for that chemical only', () => {
    const o = emptyOverrides();
    o.fate = {
      a: { koc: { value: '99', note: 'site lab' }, hPrime: { value: '0.2', note: 'lab' } },
    };
    const out = applyFateOverrides(rows, o);
    expect(out[0]!.rsl.koc?.value).toBe(99);
    expect(out[0]!.rsl.hPrime?.value).toBe(0.2);
    expect(out[0]!.rsl.s?.value).toBe(5);
    expect(out[1]).toBe(rows[1]);
    expect(rows[0]!.rsl.koc?.value).toBe(10);
  });

  it('does not apply an edit without a note or a number above zero, and returns the same list', () => {
    const o = emptyOverrides();
    o.fate = { a: { koc: { value: '99', note: '' }, s: { value: '-1', note: 'x' } } };
    expect(applyFateOverrides(rows, o)).toBe(rows);
  });

  it('is saved with the project and read back, and an empty set saves nothing', () => {
    const o = emptyOverrides();
    expect(toProject(o)).toBeUndefined();
    o.fate = { a: { koc: { value: '99', note: 'n' } } };
    expect(fromProject(toProject(o)).fate).toEqual(o.fate);
  });

  it('lists only the values the chosen models use, in screen order', () => {
    expect(fateKeysUsed([])).toEqual([]);
    expect(fateKeysUsed(['transport'])).toEqual(['koc']);
    expect(fateKeysUsed(['household'])).toEqual(['mw', 'hPrime']);
    expect(fateKeysUsed(['vadose', 'transport'])).toEqual([
      'mw',
      's',
      'hPrime',
      'koc',
      'dia',
      'diw',
    ]);
  });
});
