import { describe, expect, it } from 'vitest';
import {
  clearHouseholdFeed,
  getHouseholdFeed,
  setHouseholdFeed,
  subscribeHouseholdFeed,
} from './feeds';

describe('household feed store', () => {
  it('holds a feed, notifies and clears', () => {
    let calls = 0;
    const off = subscribeHouseholdFeed(() => calls++);
    expect(getHouseholdFeed()).toBeNull();
    const feed = {
      chemicalId: '71-43-2',
      label: 'Benzene household run',
      bathroomAir: { kind: 'constant' as const, value: 1e-7, origin: 'shower.little-1992' },
      coefficients: { bathroomAir: 0.01 },
      methods: {},
    };
    setHouseholdFeed(feed);
    expect(getHouseholdFeed()).toBe(feed);
    clearHouseholdFeed();
    expect(getHouseholdFeed()).toBeNull();
    expect(calls).toBe(2);
    off();
  });
});
