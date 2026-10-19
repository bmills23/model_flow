import { describe, expect, it } from 'vitest';
import { hashInputs, stableStringify } from './hash';

describe('stableStringify', () => {
  it('orders keys so equal content gives equal text', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      stableStringify({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }),
    );
  });
  it('drops undefined members like JSON does', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('hashInputs', () => {
  it('is stable, key-order independent and sensitive to a changed value', () => {
    expect(hashInputs({ a: '1', b: '2' })).toBe(hashInputs({ b: '2', a: '1' }));
    expect(hashInputs({ a: '1', b: '2' })).not.toBe(hashInputs({ a: '1', b: '3' }));
  });
  it('is an eight digit hexadecimal string', () => {
    expect(hashInputs({ x: 'anything' })).toMatch(/^[0-9a-f]{8}$/);
  });
});
