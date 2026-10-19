import { describe, expect, it } from 'vitest';
import { mergeDefaults, unknownKeyPaths } from './merge';

describe('mergeDefaults', () => {
  it('fills absent keys from the defaults and keeps present ones', () => {
    expect(mergeDefaults({ a: '1', b: '2' }, { b: '9' })).toEqual({ a: '1', b: '9' });
  });
  it('merges nested objects key by key', () => {
    const d = { s: { x: '1', y: '2' }, t: 'k' };
    expect(mergeDefaults(d, { s: { y: '7' } })).toEqual({ s: { x: '1', y: '7' }, t: 'k' });
  });
  it('replaces arrays whole and keeps explicit null', () => {
    expect(
      mergeDefaults({ l: ['a', 'b'], n: { q: 1 } as { q: number } | null }, { l: ['z'], n: null }),
    ).toEqual({
      l: ['z'],
      n: null,
    });
  });
  it('returns the defaults when the partial is undefined and does not alias them', () => {
    const d = { s: { x: '1' }, l: ['a'] };
    const out = mergeDefaults(d, undefined);
    expect(out).toEqual(d);
    out.s.x = 'changed';
    out.l.push('b');
    expect(d).toEqual({ s: { x: '1' }, l: ['a'] });
  });
});

describe('unknownKeyPaths', () => {
  it('lists keys present in the input and missing from the parsed output', () => {
    const input = { a: 1, extra: 2, n: { keep: 1, drop: 2 }, l: [{ k: 1, z: 1 }] };
    const output = { a: 1, n: { keep: 1 }, l: [{ k: 1 }] };
    expect(unknownKeyPaths(input, output, 'root')).toEqual([
      'root.extra',
      'root.n.drop',
      'root.l[0].z',
    ]);
  });
  it('is empty when nothing was dropped', () => {
    expect(unknownKeyPaths({ a: { b: 1 } }, { a: { b: 1 } }, 'r')).toEqual([]);
  });
});
