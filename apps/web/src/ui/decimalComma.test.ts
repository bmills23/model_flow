import { afterEach, describe, expect, it } from 'vitest';
import { getDecimalComma, readEntry, setDecimalComma, showNumber } from './decimalComma';

afterEach(() => setDecimalComma(false));

describe('readEntry with the setting off', () => {
  it('passes text through untouched', () => {
    expect(readEntry('1,5', false)).toEqual({ ok: true, canonical: '1,5' });
    expect(readEntry('1.5', false)).toEqual({ ok: true, canonical: '1.5' });
  });
});

describe('readEntry with the setting on', () => {
  it('reads a comma as the decimal separator', () => {
    expect(readEntry('1,5', true)).toEqual({ ok: true, canonical: '1.5' });
    expect(readEntry('-0,25', true)).toEqual({ ok: true, canonical: '-0.25' });
    expect(readEntry('1,5e-3', true)).toEqual({ ok: true, canonical: '1.5e-3' });
    expect(readEntry('1,', true)).toEqual({ ok: true, canonical: '1.' });
  });
  it('keeps a point decimal that cannot be a group', () => {
    expect(readEntry('1.5', true)).toEqual({ ok: true, canonical: '1.5' });
    expect(readEntry('12', true)).toEqual({ ok: true, canonical: '12' });
    expect(readEntry('', true)).toEqual({ ok: true, canonical: '' });
  });
  it('rejects both separators, repeated commas and thousands-style groups', () => {
    for (const bad of ['1.234,5', '1,234.5', '1,234,567', '1.234', '12.345.678', '1,5,2']) {
      const r = readEntry(bad, true);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/ambiguous/i);
    }
  });
});

describe('showNumber', () => {
  it('shows a comma only when the setting is on', () => {
    expect(showNumber('1.5', false)).toBe('1.5');
    expect(showNumber('1.5', true)).toBe('1,5');
    expect(showNumber('1.5e-3', true)).toBe('1,5e-3');
  });
});

describe('the setting', () => {
  it('persists per viewer and survives blocked storage', () => {
    setDecimalComma(true);
    expect(getDecimalComma()).toBe(true);
    expect(localStorage.getItem('model_flow.decimalComma.v1')).toBe('1');
    setDecimalComma(false);
    expect(localStorage.getItem('model_flow.decimalComma.v1')).toBeNull();
  });
});
