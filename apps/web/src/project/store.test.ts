import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearBankFeed, getBankFeed, setBankFeed } from '../transport/bankFeed';
import { clearWellFeed, getWellFeed, setWellFeed } from '../transport/wellFeed';
import { DEFAULT_FORM, toScenario } from '../transport/form';
import { clearVadoseFeed, getVadoseFeed, setVadoseFeed } from '../vadose/feed';
import { DEFAULT_FORM as VADOSE_FORM, toScenario as vadoseScenario } from '../vadose/form';
import { clearSaturatedFeed, getSaturatedFeed } from '../saturated/feed';
import { clearVaporRiskFeed, getVaporRiskFeed, setVaporRiskFeed } from '../vapor/feeds';
import { clearSurfaceWaterFeed } from '../surfaceWater/feed';
import {
  AUTOSAVE_KEY,
  flushAutosave,
  forgetMemory,
  getEpoch,
  getScreen,
  getStaleFeeds,
  hydrate,
  newProject,
  setScreen,
} from './store';

const wellFeed = {
  method: 'modern' as const,
  label: 'Receptor well',
  times: [0, 10, 20],
  values: [0, 1e-6, 2e-6],
};

interface Saved {
  format?: string;
  screens?: { transport?: { form?: { K?: string } } };
  feeds?: Record<string, unknown>;
}

function saved(): Saved | null {
  const t = localStorage.getItem(AUTOSAVE_KEY);
  return t === null ? null : JSON.parse(t);
}

function wipeFeeds(): void {
  clearWellFeed();
  clearBankFeed();
  clearVadoseFeed();
  clearSaturatedFeed();
  clearVaporRiskFeed();
  clearSurfaceWaterFeed();
}

/** Simulate a reload: keep only what is in storage. */
function reload(): void {
  const text = localStorage.getItem(AUTOSAVE_KEY);
  forgetMemory();
  wipeFeeds();
  if (text !== null) localStorage.setItem(AUTOSAVE_KEY, text);
  hydrate();
}

describe('project store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    forgetMemory();
    wipeFeeds();
    vi.runAllTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces: nothing is written at once, one write after the delay', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const s = getScreen('transport');
    setScreen('transport', { ...s, form: { ...s.form, K: '9' } });
    setScreen('transport', { ...s, form: { ...s.form, K: '10' } });
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(saved()?.screens?.transport?.form?.K).toBe('10');
    expect(saved()?.format).toBe('model_flow.project');
  });

  it('does not write for a set that changes nothing', () => {
    setScreen('transport', getScreen('transport'));
    vi.advanceTimersByTime(2000);
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull();
  });

  it('restores forms and feeds after a reload', () => {
    const s = getScreen('vadose');
    setScreen('vadose', { form: { ...s.form, infiltration: '0.2' } });
    setWellFeed(wellFeed);
    flushAutosave();
    reload();
    expect(getScreen('vadose').form.infiltration).toBe('0.2');
    expect(getWellFeed()).toEqual(wellFeed);
  });

  it('round trips scenario feeds that hold infinity, and the vapor feeds', () => {
    const bank = toScenario(DEFAULT_FORM);
    expect(bank.ok).toBe(true);
    if (!bank.ok) return;
    const { zOf, ...scenario } = bank.scenario;
    void zOf;
    setBankFeed({ scenario, label: 'bank' });
    const vad = vadoseScenario(VADOSE_FORM);
    expect(vad.ok).toBe(true);
    if (!vad.ok) return;
    setVadoseFeed({ scenario: vad.scenario, method: 'modern', label: 'vadose' });
    setVaporRiskFeed({ chemicalId: '71-43-2', label: 'benzene' });
    flushAutosave();
    reload();
    // JSON keeps -0 as 0 and drops undefined fields; everything else must come back as it went
    expect(getBankFeed()?.label).toBe('bank');
    expect(getBankFeed()?.scenario.terms).toEqual(scenario.terms);
    expect(getBankFeed()?.scenario.terms[0]?.end).toBe(Infinity);
    expect(getBankFeed()?.scenario.velocity).toBe(scenario.velocity);
    expect(getBankFeed()?.scenario.time).toBe(scenario.time);
    expect(getVadoseFeed()?.scenario.duration).toBe(vad.scenario.duration);
    expect(getVaporRiskFeed()?.chemicalId).toBe('71-43-2');
    expect(getSaturatedFeed()).toBeNull();
  });

  it('flags a restored feed whose source form changed after it was built', () => {
    setWellFeed(wellFeed);
    const s = getScreen('transport');
    setScreen('transport', { ...s, form: { ...s.form, K: '99' } });
    flushAutosave();
    reload();
    expect(getWellFeed()).toEqual(wellFeed);
    expect(getStaleFeeds()).toEqual(['well']);
  });

  it('does not flag a feed whose source form is unchanged', () => {
    setWellFeed(wellFeed);
    flushAutosave();
    reload();
    expect(getStaleFeeds()).toEqual([]);
  });

  it('ignores corrupt, foreign and newer saves quietly', () => {
    const newer = JSON.stringify({ format: 'model_flow.project', version: 99 });
    for (const bad of ['{not json', '{"a":1}', newer]) {
      localStorage.setItem(AUTOSAVE_KEY, bad);
      forgetMemory();
      expect(() => hydrate()).not.toThrow();
      expect(getScreen('transport').form.K).toBe(DEFAULT_FORM.K);
    }
  });

  it('survives a storage that throws on read and on write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => hydrate()).not.toThrow();
    const s = getScreen('transport');
    setScreen('transport', { ...s, form: { ...s.form, K: '5' } });
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    expect(getScreen('transport').form.K).toBe('5');
  });

  it('new project clears forms, feeds, the autosave and any pending write, and bumps the epoch', () => {
    const s = getScreen('transport');
    setScreen('transport', { ...s, form: { ...s.form, K: '5' } });
    setWellFeed(wellFeed);
    flushAutosave();
    expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull();
    setScreen('transport', { ...s, form: { ...s.form, K: '6' } });
    const before = getEpoch();
    newProject();
    expect(getEpoch()).toBe(before + 1);
    expect(getScreen('transport').form.K).toBe(DEFAULT_FORM.K);
    expect(getWellFeed()).toBeNull();
    vi.advanceTimersByTime(5000);
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull();
  });

  it('writes only the feeds that were sent', () => {
    setWellFeed(wellFeed);
    flushAutosave();
    expect(Object.keys(saved()?.feeds ?? {})).toEqual(['well']);
  });
});
