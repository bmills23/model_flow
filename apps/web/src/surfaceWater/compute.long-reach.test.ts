import { describe, expect, it } from 'vitest';
import { linkedRun } from './computeLinked';

describe('surface water compute, long reaches', () => {
  it('keeps the modern loading for a long entered reach (it must not collapse to zero)', () => {
    const short = linkedRun({ reachLength: '40', thickness: '3' });
    const long = linkedRun({ reachLength: '2000', thickness: '3' });
    const peak = (a: number[]) => Math.max(...a);
    // the same plume flux over a 50 times longer reach: the flux-averaged concentration falls by
    // about the reach ratio, never to zero
    const ratio = peak(long.modern.fluxAveraged) / peak(short.modern.fluxAveraged);
    expect(ratio).toBeGreaterThan(0.5 * (40 / 2000));
    expect(ratio).toBeLessThan(1.5 * (40 / 2000));
  }, 30000);
});
