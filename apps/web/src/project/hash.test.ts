// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fingerprintForm, hashInputs, stableStringify } from './hash';

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

describe('fingerprintForm for the surface water form', () => {
  it('leaves the chemical out, so a file saved before the key existed is not stale', () => {
    const older = { bodyType: 'river', koc: '59' };
    expect(hashInputs(fingerprintForm('surfaceWater', { ...older, chemicalId: '' }))).toBe(
      hashInputs(fingerprintForm('surfaceWater', older)),
    );
  });
});

describe('fingerprintForm for the vadose dispersivity choice', () => {
  const older = { infiltration: '20', alphaL: '' };
  const hash = (form: unknown) => hashInputs(fingerprintForm('vadose', form));

  it('leaves the choice out while it is what a file written before it would be read as', () => {
    expect(hash({ ...older, dispersivityBasis: 'regression' })).toBe(hash(older));
    expect(hash({ ...older, alphaL: '0.4', dispersivityBasis: 'entered' })).toBe(
      hash({ ...older, alphaL: '0.4' }),
    );
  });

  it('counts the choice once it differs, so switching it marks a feed stale', () => {
    expect(hash({ ...older, dispersivityBasis: 'entered' })).not.toBe(hash(older));
    expect(hash({ ...older, alphaL: '0.4', dispersivityBasis: 'regression' })).not.toBe(
      hash({ ...older, alphaL: '0.4' }),
    );
  });
});
