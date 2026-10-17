import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM, LAKE_FORM, isR8Case, toRequest } from './inputs';

describe('surface water inputs', () => {
  it('converts the Table R-8 river case to SI', () => {
    const r = toRequest(DEFAULT_FORM, null);
    if (!r.ok) throw new Error(r.errors.join('; '));
    const q = r.request;
    expect(q.body).toEqual({ type: 'river', crossSection: 5 });
    expect(q.upstreamFlow).toBeCloseTo(180 / 86400, 15);
    expect(q.groundwaterConcentration).toBeCloseTo(5e-3, 15);
    expect(q.discharge).toEqual({
      kind: 'darcy',
      bedConductivity: 10 / 86400,
      thickness: 5,
      gradient: 0.05,
    });
    expect(q.reach).toEqual({ kind: 'entered', length: 100 });
    expect(q.sediment).toMatchObject({ fractionOrganicCarbon: 0.01, koc: 59 / 1000 });
    expect(q.link).toBeNull();
  });

  it('reads the lake case with volume, fraction and decay', () => {
    const r = toRequest(LAKE_FORM, null);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.request.body).toEqual({ type: 'lake', volume: 100000 });
    expect(r.request.mixingFraction).toBe(0.1);
    expect(r.request.decay).toBeCloseTo(0.005 / 86400, 15);
  });

  it('recognises the R-8 cases', () => {
    expect(isR8Case(DEFAULT_FORM)).toBe('river');
    expect(isR8Case(LAKE_FORM)).toBe('lake');
    expect(isR8Case({ ...DEFAULT_FORM, upstreamFlow: '181' })).toBeNull();
  });

  it('reports every bad field in words', () => {
    const r = toRequest(
      { ...DEFAULT_FORM, mixingFraction: '1.5', crossSection: 'abc', foc: '-1' },
      null,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const text = r.errors.join(' | ');
    expect(text).toMatch(/mixing fraction/i);
    expect(text).toMatch(/cross-section/i);
    expect(text).toMatch(/organic carbon/i);
  });

  it('needs a Koc or Kd only when sediment is asked for', () => {
    const none = toRequest({ ...DEFAULT_FORM, koc: '', kd: '' }, null);
    if (!none.ok) throw new Error(none.errors.join('; '));
    expect(none.request.sediment?.koc).toBeUndefined();
    const off = toRequest({ ...DEFAULT_FORM, sedimentOn: false }, null);
    if (!off.ok) throw new Error(off.errors.join('; '));
    expect(off.request.sediment).toBeUndefined();
  });

  it('requires the bank distance for a Domenico reach', () => {
    const r = toRequest({ ...DEFAULT_FORM, reachMode: 'domenico', sourceWidth: '10' }, null);
    expect(r.ok).toBe(false);
  });
});
