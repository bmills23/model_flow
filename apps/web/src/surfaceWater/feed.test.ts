import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSurfaceWaterFeed,
  getSurfaceWaterFeed,
  setSurfaceWaterFeed,
  subscribeSurfaceWaterFeed,
} from './feed';

const feed = () => ({
  method: 'well-mixed' as const,
  origin: 'surfaceWater.well-mixed',
  label: 'Legacy well-mixed surface water',
  times: [10, 20],
  values: [1e-6, 2e-6],
});

describe('surface water feed', () => {
  afterEach(() => clearSurfaceWaterFeed());

  it('starts empty, holds the latest series and clears', () => {
    expect(getSurfaceWaterFeed()).toBeNull();
    setSurfaceWaterFeed(feed());
    expect(getSurfaceWaterFeed()?.origin).toBe('surfaceWater.well-mixed');
    clearSurfaceWaterFeed();
    expect(getSurfaceWaterFeed()).toBeNull();
  });

  it('notifies subscribers and keeps one snapshot object until it changes', () => {
    const fn = vi.fn();
    const off = subscribeSurfaceWaterFeed(fn);
    setSurfaceWaterFeed(feed());
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getSurfaceWaterFeed()).toBe(getSurfaceWaterFeed());
    off();
    clearSurfaceWaterFeed();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
