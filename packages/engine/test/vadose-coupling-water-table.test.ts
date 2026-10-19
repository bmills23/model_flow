import { describe, expect, it } from 'vitest';
import { aquiferMass, loaded } from './vadoseCouplingMass.js';

describe('mass balance against the aquifer kernel (no decay in either process)', () => {
  it('infinite depth under the no-flux water table: aquifer mass equals loaded mass within 1e-6', () => {
    // Yeh (1981) semi-infinite case: the aquifer is z <= 0 and the water table reflects, so nothing
    // diffuses out of the top. The summation runs 15 m deep, past the plume's vertical reach.
    const dz = 0.5;
    const below = Array.from({ length: 30 }, (_, k) => -(k + 0.5) * dz);
    const m = aquiferMass('water-table', below, dz);
    expect(Math.abs(m - loaded) / loaded).toBeLessThan(1e-6);
  }, 60000);
});
