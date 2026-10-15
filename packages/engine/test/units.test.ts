import { describe, expect, it } from 'vitest';
import { convert } from '../src/numerics/units.js';

describe('convert', () => {
  it('converts lengths', () => {
    expect(convert(100, 'cm', 'm')).toBeCloseTo(1, 12);
    expect(convert(1, 'ft', 'm')).toBeCloseTo(0.3048, 12);
  });

  it('converts times using a 365.25 day year', () => {
    expect(convert(1, 'yr', 'd')).toBeCloseTo(365.25, 12);
    expect(convert(86400, 's', 'd')).toBeCloseTo(1, 12);
  });

  it('converts compound rates such as infiltration', () => {
    expect(convert(20, 'cm/yr', 'm/d')).toBeCloseTo(0.2 / 365.25, 15);
    expect(convert(1, 'm/d', 'cm/s')).toBeCloseTo(100 / 86400, 15);
  });

  it('rejects incompatible dimensions', () => {
    expect(() => convert(1, 'm', 'd')).toThrow(/incompatible/i);
  });
});
