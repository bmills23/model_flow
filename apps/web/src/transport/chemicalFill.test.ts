// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { kdText } from './chemicalFill';

describe('kdText', () => {
  it('formats Koc times foc without floating point tails', () => {
    expect(String(1486.97 * 0.0006)).not.toBe('0.892182');
    expect(kdText(1486.97, '0.0006', 'keep')).toBe('0.892182');
    expect(kdText(891.2, '0.001', 'keep')).toBe('0.8912');
  });
  it('keeps the typed Kd without a Koc or with a blank or bad fraction', () => {
    expect(kdText(undefined, '0.001', '3')).toBe('3');
    expect(kdText(10, '  ', '3')).toBe('3');
    expect(kdText(10, 'abc', '3')).toBe('3');
  });
  it('returns the plain product when it is already short', () => {
    expect(kdText(100, '0.01', 'x')).toBe('1');
  });
});
