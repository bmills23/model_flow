import { describe, expect, it } from 'vitest';
import {
  gelhar1985Api1987,
  gelhar1985Longitudinal,
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
