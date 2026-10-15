import { describe, expect, it } from 'vitest';
import { erf, erfc, erfcx, expErfc } from '../src/numerics/special.js';

describe('erf family', () => {
  it('erf matches tabulated values', () => {
    expect(erf(0)).toBe(0);
    expect(erf(0.5)).toBeCloseTo(0.520499877813047, 12);
    expect(erf(1)).toBeCloseTo(0.842700792949715, 12);
    expect(erf(-1)).toBeCloseTo(-0.842700792949715, 12);
  });

  it('erfc keeps relative accuracy in the tail', () => {
    expect(erfc(3) / 2.209049699858544e-5).toBeCloseTo(1, 10);
    expect(erfc(5) / 1.5374597944280347e-12).toBeCloseTo(1, 10);
    expect(erfc(-1)).toBeCloseTo(1.842700792949715, 12);
  });

  it('erfcx is the scaled complement exp(x^2) erfc(x)', () => {
    expect(erfcx(10)).toBeCloseTo(0.0561409927438226, 12);
    expect(erfcx(-1)).toBeCloseTo(Math.E * 1.842700792949715, 10);
    // Asymptotic form 1/(x sqrt(pi)) for large x.
    expect(erfcx(1000) * 1000 * Math.sqrt(Math.PI)).toBeCloseTo(1, 5);
  });

  it('expErfc(a, b) equals exp(a) erfc(b) where that is representable', () => {
    expect(expErfc(2, 1)).toBeCloseTo(Math.exp(2) * 0.15729920705028513, 10);
    expect(expErfc(0, -1)).toBeCloseTo(1.842700792949715, 12);
  });

  it('expErfc stays finite when exp(a) overflows but the product does not', () => {
    const b = Math.sqrt(1000);
    const v = expErfc(1000, b);
    expect(Number.isFinite(v)).toBe(true);
    expect(v * b * Math.sqrt(Math.PI)).toBeCloseTo(1, 2);
  });
});
