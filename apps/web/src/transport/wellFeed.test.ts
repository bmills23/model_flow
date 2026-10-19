// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearWellFeed, getWellFeed, setWellFeed, subscribeWellFeed } from './wellFeed';

const feed = (method: 'legacy' | 'modern' | 'domenico' = 'modern') => ({
  method,
  label: 'Receptor well, modern method',
  times: [0, 10, 20],
  values: [0, 1e-6, 2e-6],
});

describe('well feed', () => {
  afterEach(() => clearWellFeed());

  it('starts empty, holds the latest well result and clears', () => {
    expect(getWellFeed()).toBeNull();
    setWellFeed(feed());
    expect(getWellFeed()?.method).toBe('modern');
    clearWellFeed();
    expect(getWellFeed()).toBeNull();
  });

  it('notifies subscribers and keeps one snapshot object until it changes', () => {
    const fn = vi.fn();
    const off = subscribeWellFeed(fn);
    setWellFeed(feed('legacy'));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getWellFeed()).toBe(getWellFeed());
    off();
    clearWellFeed();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
