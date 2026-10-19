// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decodeJson, encodeJson } from './codec';

describe('feed value codec', () => {
  it('round trips non-finite numbers that plain JSON would turn into null', () => {
    const value = { terms: [{ start: 0, end: Infinity, factor: 1 }], low: -Infinity, nan: NaN };
    const text = JSON.stringify(encodeJson(value));
    expect(text).not.toContain('null');
    const back = decodeJson(JSON.parse(text)) as typeof value;
    expect(back.terms[0]?.end).toBe(Infinity);
    expect(back.low).toBe(-Infinity);
    expect(Number.isNaN(back.nan)).toBe(true);
  });

  it('drops undefined fields and keeps strings, booleans, null and nesting', () => {
    const value = { a: undefined, b: 'x', c: true, d: null, e: { f: [1, 2, { g: 3 }] } };
    expect(decodeJson(JSON.parse(JSON.stringify(encodeJson(value))))).toEqual({
      b: 'x',
      c: true,
      d: null,
      e: { f: [1, 2, { g: 3 }] },
    });
  });
});
