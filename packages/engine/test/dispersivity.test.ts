import { describe, expect, it } from 'vitest';
import {
  gelhar1985Api1987,
  gelhar1985Longitudinal,
  schulzeMakuch2005,
  schulzeMakuch2005Longitudinal,
  ssg1996Longitudinal,
  xuEckstein1995,
  xuEckstein1995Longitudinal,
} from '../src/processes/dispersivity/index.js';

describe('Gelhar et al. 1985 regression as used for saturated-zone longitudinal dispersivity', () => {
  it('gives about 11.05 m at 100 m and about 0.82 m at 10 m', () => {
    expect(gelhar1985Longitudinal(100)).toBeCloseTo(11.048, 2);
    expect(gelhar1985Longitudinal(10)).toBeCloseTo(0.816, 2);
  });

  it('legacy method derives transverse and vertical values with the API 1987 ratios 3 and 87', () => {
    const out = gelhar1985Api1987.run({ distance: 100 });
    expect(out.alphaL).toBeCloseTo(11.048, 2);
    expect(out.alphaT).toBeCloseTo(out.alphaL / 3, 12);
    expect(out.alphaV).toBeCloseTo(out.alphaT / 87, 12);
    expect(gelhar1985Api1987.kind).toBe('legacy');
    expect(gelhar1985Api1987.process).toBe('dispersivity');
  });

  it('rejects non-positive distances', () => {
    expect(() => gelhar1985Longitudinal(0)).toThrow(RangeError);
  });

  it('warns that the regression has no primary source whenever the law value is used', () => {
    const w = gelhar1985Api1987.validate?.({ distance: 100 });
    expect(w?.map((x) => x.code)).toEqual(['dispersivity.regression-unsourced']);
    expect(w?.[0]?.message).toMatch(/no primary source/i);
  });

  it('leaves the numbers unchanged by the warning', () => {
    expect(gelhar1985Api1987.run({ distance: 100 }).alphaL).toBeCloseTo(11.048, 2);
  });
});

describe('EPA 1996 Soil Screening Guidance rule', () => {
  it('is 0.1 times the distance to the receptor', () => {
    expect(ssg1996Longitudinal(100)).toBeCloseTo(10, 12);
    expect(ssg1996Longitudinal(25)).toBeCloseTo(2.5, 12);
  });

  it('rejects non-positive and non-finite distances', () => {
    expect(() => ssg1996Longitudinal(0)).toThrow(RangeError);
    expect(() => ssg1996Longitudinal(-5)).toThrow(RangeError);
    expect(() => ssg1996Longitudinal(NaN)).toThrow(RangeError);
  });
});

describe('Xu and Eckstein 1995 regression', () => {
  it('gives 0.83 (log10 L)^2.414: about 4.42 m at 100 m and 0.83 m at 10 m', () => {
    expect(xuEckstein1995Longitudinal(100)).toBeCloseTo(4.423, 2);
    expect(xuEckstein1995Longitudinal(10)).toBeCloseTo(0.83, 6);
  });

  it('modern method uses the BIOSCREEN ratios alphaT = alphaL/10 and alphaV = alphaL/100', () => {
    const out = xuEckstein1995.run({ distance: 100 });
    expect(out.alphaT).toBeCloseTo(out.alphaL / 10, 12);
    expect(out.alphaV).toBeCloseTo(out.alphaL / 100, 12);
    expect(xuEckstein1995.kind).toBe('modern');
  });

  it('warns below one metre, where the regression collapses to zero', () => {
    expect(xuEckstein1995.validate?.({ distance: 0.5 }).length).toBeGreaterThan(0);
    expect(xuEckstein1995.validate?.({ distance: 50 })).toEqual([]);
  });
});

describe('Schulze-Makuch 2005 power law (unconsolidated media, most reliable data)', () => {
  it('gives 0.20 L^0.44, worked by hand at three scales', () => {
    // L = 10: 10^0.44 = 2.75423, times 0.20 = 0.550846
    expect(schulzeMakuch2005Longitudinal(10)).toBeCloseTo(0.2 * 2.75423, 4);
    // L = 100: 100^0.44 = 10^0.88 = 7.58578, times 0.20 = 1.517156
    expect(schulzeMakuch2005Longitudinal(100)).toBeCloseTo(0.2 * 7.58578, 4);
    // L = 1000: 1000^0.44 = 10^1.32 = 20.89296, times 0.20 = 4.178592
    expect(schulzeMakuch2005Longitudinal(1000)).toBeCloseTo(0.2 * 20.89296, 4);
  });

  it('is positive and strictly increasing with scale', () => {
    const xs = [0.1, 1, 5, 20, 80, 300, 2000];
    const ys = xs.map(schulzeMakuch2005Longitudinal);
    for (const y of ys) expect(y).toBeGreaterThan(0);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i]).toBeGreaterThan(ys[i - 1]!);
  });

  it('rejects non-positive scale lengths', () => {
    expect(() => schulzeMakuch2005Longitudinal(0)).toThrow(RangeError);
  });

  it('modern method uses the BIOSCREEN ratios alphaT = alphaL/10 and alphaV = alphaL/100', () => {
    const out = schulzeMakuch2005.run({ distance: 100 });
    expect(out.alphaL).toBeCloseTo(1.517156, 4);
    expect(out.alphaT).toBeCloseTo(out.alphaL / 10, 12);
    expect(out.alphaV).toBeCloseTo(out.alphaL / 100, 12);
    expect(schulzeMakuch2005.id).toBe('dispersivity.schulze-makuch2005');
    expect(schulzeMakuch2005.kind).toBe('modern');
    expect(schulzeMakuch2005.citations).toContain('schulzemakuch2005');
  });
});
