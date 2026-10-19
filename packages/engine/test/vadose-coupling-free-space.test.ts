import { describe, expect, it } from 'vitest';
import { aquiferMass, loaded } from './vadoseCouplingMass.js';

describe('mass balance against the aquifer kernel (no decay in either process)', () => {
  it('unbounded infinite depth: the free-space solution spreads equally above and below the plane', () => {
    // The default infinite-depth medium (top 'unbounded', the POINT3 configuration) has no water
    // table, so the plume diffuses upward as well and only the half below z = 0 is in the aquifer.
    // Mass is conserved over all space, not over the aquifer; vadose-fed runs use top 'no-flux'.
    const dz = 0.5;
    const below = Array.from({ length: 12 }, (_, k) => -(k + 0.5) * dz);
    const above = below.map((z) => -z);
    const mBelow = aquiferMass(false, below, dz);
    const mAbove = aquiferMass(false, above, dz);
    expect(Math.abs(mBelow - mAbove) / loaded).toBeLessThan(1e-9);
    expect(Math.abs(mBelow + mAbove - loaded) / loaded).toBeLessThan(2e-3);
    expect(mBelow / loaded).toBeCloseTo(0.5, 2);
  }, 60000);
});
