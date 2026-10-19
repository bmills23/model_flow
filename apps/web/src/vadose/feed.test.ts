// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearVadoseFeed, getVadoseFeed, setVadoseFeed, subscribeVadoseFeed } from './feed';
import { DEFAULT_FORM, toScenario } from './form';

const r = toScenario(DEFAULT_FORM);
if (!r.ok) throw new Error('scenario');

describe('vadose feed', () => {
  afterEach(() => clearVadoseFeed());

  it('starts empty, holds the latest feed and clears', () => {
    expect(getVadoseFeed()).toBeNull();
    setVadoseFeed({ scenario: r.scenario, method: 'modern', label: 'Table R-7 case' });
    expect(getVadoseFeed()?.method).toBe('modern');
    clearVadoseFeed();
    expect(getVadoseFeed()).toBeNull();
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const fn = vi.fn();
    const off = subscribeVadoseFeed(fn);
    setVadoseFeed({ scenario: r.scenario, method: 'legacy', label: 'x' });
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    clearVadoseFeed();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps the same snapshot object until it changes, for useSyncExternalStore', () => {
    setVadoseFeed({ scenario: r.scenario, method: 'legacy', label: 'x' });
    expect(getVadoseFeed()).toBe(getVadoseFeed());
  });
});
