// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clearVaporRiskFeed,
  getVaporRiskFeed,
  getWaterTableFeed,
  setVaporRiskFeed,
  setWaterTableFeed,
  subscribeVaporRiskFeed,
} from './feeds';

describe('feed stores', () => {
  it('hold a value, notify subscribers on change and clear', () => {
    let calls = 0;
    const off = subscribeVaporRiskFeed(() => calls++);
    expect(getVaporRiskFeed()).toBeNull();
    const feed = {
      chemicalId: '71-43-2',
      label: 'Vapor run',
      indoor: { kind: 'constant' as const, value: 1e-6, origin: 'vapor.je-1991' },
    };
    setVaporRiskFeed(feed);
    expect(getVaporRiskFeed()).toBe(feed);
    clearVaporRiskFeed();
    clearVaporRiskFeed();
    expect(getVaporRiskFeed()).toBeNull();
    expect(calls).toBe(2);
    off();
    setVaporRiskFeed(feed);
    expect(calls).toBe(2);
    clearVaporRiskFeed();
  });

  it('keep the three source feeds apart', () => {
    expect(getWaterTableFeed()).toBeNull();
    setWaterTableFeed({
      kind: 'groundwater',
      label: 'x',
      series: { times: [0, 1], values: [1, 1] },
    });
    expect(getWaterTableFeed()?.kind).toBe('groundwater');
  });
});
