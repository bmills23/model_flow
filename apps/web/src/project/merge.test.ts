import { describe, expect, it } from 'vitest';
import { cloneData, mergeDefaults, unknownKeyPaths } from './merge';

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

describe('untrusted __proto__ keys', () => {
  const hostile = () => JSON.parse('{"__proto__":{"polluted":1},"a":1}') as Record<string, unknown>;

  it('cloneData copies a __proto__ key as a property and leaves the prototype alone', () => {
    const out = cloneData(hostile());
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as { polluted?: number }).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(true);
    expect(out['a']).toBe(1);
  });

  it('mergeDefaults does the same and pollutes nothing global', () => {
    const out = mergeDefaults({ a: 0 } as Record<string, unknown>, hostile());
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as { polluted?: number }).polluted).toBeUndefined();
    expect(({} as { polluted?: number }).polluted).toBeUndefined();
    expect(out['a']).toBe(1);
  });
});
