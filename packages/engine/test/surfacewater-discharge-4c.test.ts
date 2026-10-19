import { describe, expect, it } from 'vitest';
import { impulse, n, rel, slab, thin, timeIntegral, v, W } from './surfacewaterHelpers.js';

describe('mass balance of the bank plane against AT123D (fixtures 4a to 4d)', () => {
  it('4c: with decay, a source: ratio (v/s) exp((v-s)x/(2 Dx)) for the steady flux and the pulse integral', () => {
    const cases: [number, number, number][] = [
      [0, 1, 1],
      [0.001, 1, 0.338133023],
      [0.001, 2, 0.135051747],
    ];
    for (const [lambda, R, expected] of cases) {
      // a plane in x (a point in x), since the closed form is for a point source along the flow
      const c = impulse(
        thin({ decayRate: lambda, retardation: R, dy: 0.001 }),
        { ...slab, x1: 0, x2: 0 },
        100,
      );
      const total = timeIntegral((t) => (t > 0 ? W(c, 60, t, n * v) : 0), 20000);
      expect(rel(total, expected)).toBeLessThan(1e-6);
    }
  }, 120_000);
});
