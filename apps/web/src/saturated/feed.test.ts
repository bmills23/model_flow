import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSaturatedFeed,
  getSaturatedFeed,
  setSaturatedFeed,
  subscribeSaturatedFeed,
} from './feed';
import { DEFAULT_FORM, toScenario } from './form';

const r = toScenario(DEFAULT_FORM);
if (!r.ok) throw new Error('scenario');

describe('saturated feed', () => {
  afterEach(() => clearSaturatedFeed());

  it('starts empty, holds the latest feed and clears', () => {
    expect(getSaturatedFeed()).toBeNull();
    setSaturatedFeed({ input: r.scenario.input, method: 'modern', label: 'case A' });
    expect(getSaturatedFeed()?.method).toBe('modern');
    clearSaturatedFeed();
    expect(getSaturatedFeed()).toBeNull();
  });

  it('notifies subscribers and keeps one snapshot object until it changes', () => {
    const fn = vi.fn();
    const off = subscribeSaturatedFeed(fn);
    setSaturatedFeed({ input: r.scenario.input, method: 'legacy', label: 'x' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getSaturatedFeed()).toBe(getSaturatedFeed());
    off();
    clearSaturatedFeed();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
