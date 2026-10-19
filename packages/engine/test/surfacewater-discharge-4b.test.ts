import { describe, expect, it } from 'vitest';
import { impulse, n, rel, slab, thin, timeIntegral, v, W } from './surfacewaterHelpers.js';

describe('mass balance of the bank plane against AT123D (fixtures 4a to 4d)', () => {
  it('4b: a pulse with no decay: the time integral of W equals the released mass', () => {
    const c = impulse(thin({ dy: 0.002 }), slab, 20);
    const total = timeIntegral((t) => (t > 0 ? W(c, 40, t, n * v) : 0), 8000);
    expect(rel(total, 1)).toBeLessThan(1e-6);
  }, 120_000);
});
