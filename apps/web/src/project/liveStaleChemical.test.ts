import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHouseholdFeed, setHouseholdFeed } from '../household/feeds';
import { clearWellFeed, getWellFeed, getWellFeedSlots, setWellFeed } from '../transport/wellFeed';
import {
  AUTOSAVE_KEY,
  currentProject,
  flushAutosave,
  forgetMemory,
  getScreen,
  getStaleFeeds,
  getStaleSlots,
  hydrate,
  isFeedStaleNow,
  readMatches,
  setScreen,
} from './store';

const BENZENE = '71-43-2';
const TOLUENE = '108-88-3';
const well = (chemicalId: string, v = 1e-6) => ({
  method: 'modern' as const,
  label: chemicalId,
  times: [0, 10],
  values: [0, v],
  chemicalId,
});

function transportOn(chemicalId: string, K?: string): void {
  const t = getScreen('transport');
  setScreen('transport', {
    ...t,
    form: { ...t.form, chemicalId, ...(K !== undefined ? { K } : {}) },
  });
}

describe('staleness per feed and chemical', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    forgetMemory();
    clearWellFeed();
    clearHouseholdFeed();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sending for one chemical keeps the slot of the other', () => {
    transportOn(BENZENE);
    setWellFeed(well(BENZENE));
    transportOn(TOLUENE);
    setWellFeed(well(TOLUENE));
    expect([...getWellFeedSlots().keys()]).toEqual([BENZENE, TOLUENE]);
    expect(getWellFeed(BENZENE)?.label).toBe(BENZENE);
    expect(getWellFeed(TOLUENE)?.label).toBe(TOLUENE);
  });

  it('a stale benzene slot does not mark the toluene slot', () => {
    transportOn(BENZENE);
    setWellFeed(well(BENZENE));
    transportOn(TOLUENE);
    setWellFeed(well(TOLUENE));
    expect(getStaleSlots()).toEqual([]);
    // an input edit while the screen is on toluene marks only toluene's slot
    transportOn(TOLUENE, '77');
    expect(getStaleSlots()).toEqual([{ feed: 'well', chemicalId: TOLUENE }]);
    expect(getStaleFeeds()).toEqual(['well']);
    expect(isFeedStaleNow('well', TOLUENE)).toBe(true);
    expect(isFeedStaleNow('well', BENZENE)).toBe(false);
  });

  it('a slot keeps its mark while the screen is on another chemical, and is checked again on return', () => {
    transportOn(BENZENE);
    setWellFeed(well(BENZENE));
    const sent = getScreen('transport');
    transportOn(BENZENE, '55');
    expect(isFeedStaleNow('well', BENZENE)).toBe(true);
    transportOn(TOLUENE, '55');
    expect(isFeedStaleNow('well', BENZENE)).toBe(true);
    setScreen('transport', sent);
    expect(getStaleSlots()).toEqual([]);
  });

  it('a slot for another chemical than the screen shows is not marked by edits to the screen', () => {
    transportOn(BENZENE);
    setWellFeed(well(BENZENE));
    transportOn(TOLUENE, '66');
    expect(getStaleSlots()).toEqual([]);
  });

  it('each slot is saved with its own fingerprint and restored fresh', () => {
    transportOn(BENZENE);
    setWellFeed(well(BENZENE));
    transportOn(TOLUENE, '44');
    setWellFeed(well(TOLUENE));
    const saved = currentProject().feeds?.well ?? {};
    expect(Object.keys(saved)).toEqual([BENZENE, TOLUENE]);
    expect(saved[BENZENE]?.inputsHash).not.toBe(saved[TOLUENE]?.inputsHash);
    flushAutosave();
    const text = localStorage.getItem(AUTOSAVE_KEY)!;
    forgetMemory();
    clearWellFeed();
    localStorage.setItem(AUTOSAVE_KEY, text);
    hydrate();
    expect([...getWellFeedSlots().keys()]).toEqual([BENZENE, TOLUENE]);
    expect(getStaleSlots()).toEqual([]);
  });

  it('a household slot follows the well slot of its own chemical only', () => {
    const h = getScreen('household');
    setScreen('household', { form: { ...h.form, chemicalId: BENZENE, showerWaterSource: 'well' } });
    transportOn(BENZENE);
    setWellFeed(well(BENZENE));
    setHouseholdFeed({ chemicalId: BENZENE, label: 'b', coefficients: {}, methods: {} });
    transportOn(TOLUENE);
    setWellFeed(well(TOLUENE, 5e-6));
    expect(isFeedStaleNow('household', BENZENE)).toBe(false);
    transportOn(BENZENE);
    setWellFeed(well(BENZENE, 9e-6));
    expect(getStaleSlots()).toEqual([{ feed: 'household', chemicalId: BENZENE }]);
  });

  it('a read matches its own slot, the untagged slot, or any slot when it has no chemical', () => {
    const slot = (chemicalId: string) => ({ feed: 'well' as const, chemicalId });
    expect(readMatches({ feed: 'well', chemicalId: BENZENE }, slot(BENZENE))).toBe(true);
    expect(readMatches({ feed: 'well', chemicalId: BENZENE }, slot(TOLUENE))).toBe(false);
    expect(readMatches({ feed: 'well', chemicalId: BENZENE }, slot(''))).toBe(true);
    expect(readMatches({ feed: 'well' }, slot(TOLUENE))).toBe(true);
    expect(readMatches({ feed: 'bank', chemicalId: BENZENE }, slot(BENZENE))).toBe(false);
  });
});
