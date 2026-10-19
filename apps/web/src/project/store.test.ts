import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyOverrides, setField } from '../overrides/model';
import { defaultSite, type SiteState } from '../site/model';
import { hashInputs, parseProject } from './index';
import { clearBankFeed, getBankFeed, setBankFeed } from '../transport/bankFeed';
import { clearWellFeed, getWellFeed, setWellFeed } from '../transport/wellFeed';
import { DEFAULT_FORM, toScenario } from '../transport/form';
import { clearVadoseFeed, getVadoseFeed, setVadoseFeed } from '../vadose/feed';
import { DEFAULT_FORM as VADOSE_FORM, toScenario as vadoseScenario } from '../vadose/form';
import { DEFAULT_FORM as SAT_FORM, toScenario as toSaturated } from '../saturated/form';
import { clearSaturatedFeed, getSaturatedFeed, setSaturatedFeed } from '../saturated/feed';
import {
  clearVadoseVaporFeed,
  clearVaporRiskFeed,
  getVaporRiskFeed,
  setVadoseVaporFeed,
  setVaporRiskFeed,
} from '../vapor/feeds';
import { clearSurfaceWaterFeed } from '../surfaceWater/feed';
import { clearHouseholdFeed, getHouseholdFeed, setHouseholdFeed } from '../household/feeds';
import {
  clearProduceFeed,
  clearTphFeed,
  getProduceFeed,
  getTphFeed,
  setProduceFeed,
  setTphFeed,
} from '../plantsEco/feeds';
import {
  AUTOSAVE_KEY,
  flushAutosave,
  forgetMemory,
  getEpoch,
  getScreen,
  getDroppedFeeds,
  getStaleFeeds,
  getOverrides,
  getSite,
  hasUnsavedChanges,
  hydrate,
  currentProject,
  loadProject,
  markSaved,
  newProject,
  setOverrides,
  setScreen,
  setSite,
  startProjectStore,
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
  clearVadoseVaporFeed();
  clearSurfaceWaterFeed();
  clearHouseholdFeed();
  clearProduceFeed();
  clearTphFeed();
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

  it('restores the household and plants screens, their feeds and the uncertainty setup', () => {
    const h = getScreen('household');
    setScreen('household', { form: { ...h.form, waterConcentration: '0.01' } });
    const pl = getScreen('plantsEco');
    setScreen('plantsEco', { form: { ...pl.form, soilConcentration: '12' } });
    const u = getScreen('uncertainty');
    setScreen('uncertainty', { ...u, risk: { ...u.risk, seed: 'abc', iterations: '300' } });
    setHouseholdFeed({
      chemicalId: '71-43-2',
      label: 'benzene',
      coefficients: { bathroomAir: 0.5 },
      methods: { bathroomAir: 'shower.little-1992' },
    });
    setProduceFeed({
      chemicalId: '71-43-2',
      label: 'benzene',
      method: 'plantUptake.hhrap-2005',
      factors: {} as never,
      intakes: {} as never,
      intakeLabel: 'user entered',
    });
    setTphFeed({
      methodId: 'tph.tphcwg',
      label: 'Total TPH, tph.tphcwg',
      targetHazardIndex: 1,
      totalMgPerKg: 640,
      fractions: [],
      unmapped: [],
      warnings: [],
    });
    flushAutosave();
    reload();
    expect(getTphFeed()?.totalMgPerKg).toBe(640);
    expect(getScreen('household').form.waterConcentration).toBe('0.01');
    expect(getScreen('plantsEco').form.soilConcentration).toBe('12');
    expect(getScreen('uncertainty').risk.seed).toBe('abc');
    expect(getScreen('uncertainty').risk.iterations).toBe('300');
    expect(getHouseholdFeed()?.coefficients.bathroomAir).toBe(0.5);
    expect(getProduceFeed()?.method).toBe('plantUptake.hhrap-2005');
    expect(getStaleFeeds()).toEqual([]);
  });

  it('flags a household feed whose source form changed after it was built', () => {
    setHouseholdFeed({ chemicalId: 'x', label: 'x', coefficients: {}, methods: {} });
    const h = getScreen('household');
    setScreen('household', { form: { ...h.form, waterConcentration: '9' } });
    flushAutosave();
    reload();
    expect(getStaleFeeds()).toEqual(['household']);
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

  describe('a file written before the wave H keys existed', () => {
    type Obj = Record<string, unknown>;
    const strip = (o: unknown, keys: string[]): void => {
      if (Array.isArray(o)) o.forEach((x) => strip(x, keys));
      else if (typeof o === 'object' && o !== null)
        for (const k of Object.keys(o)) {
          if (keys.includes(k)) delete (o as Obj)[k];
          else strip((o as Obj)[k], keys);
        }
    };
    /** Write the autosave as main wrote it: no new keys, and the fingerprints taken over that shape. */
    function asOldFile(screen: string, keys: string[], feedKeys: string[]): void {
      flushAutosave();
      const file = saved() as unknown as { screens: Record<string, { form: Obj }>; feeds: Obj };
      const form = file.screens[screen]!.form;
      strip(form, keys);
      for (const k of feedKeys)
        (file.feeds[k] as { inputsHash: string }).inputsHash = hashInputs(form);
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(file));
      reload();
    }
    const vad = () => {
      const r = vadoseScenario(VADOSE_FORM);
      if (!r.ok) throw new Error('vadose');
      return r.scenario;
    };

    it('transport feeds stay current without chemicalId and foc', () => {
      setWellFeed(wellFeed);
      asOldFile('transport', ['chemicalId', 'foc'], ['well']);
      expect(getWellFeed()).toEqual(wellFeed);
      expect(getStaleFeeds()).toEqual([]);
    });
    it('vadose feeds stay current without chemicalId and texture', () => {
      setVadoseFeed({ scenario: vad(), method: 'modern', label: 'vadose' });
      setVadoseVaporFeed({} as never);
      asOldFile('vadose', ['chemicalId', 'texture'], ['vadose', 'vaporVadose']);
      expect(getVadoseFeed()).not.toBeNull();
      expect(getStaleFeeds()).toEqual([]);
    });
    it('saturated feeds stay current without chemicalId and texture', () => {
      const sat = toSaturated(SAT_FORM);
      if (!sat.ok) throw new Error('scenario');
      setSaturatedFeed({ input: sat.scenario.input, method: 'legacy', label: 'sat' });
      asOldFile('saturated', ['chemicalId', 'texture'], ['saturated']);
      expect(getSaturatedFeed()).not.toBeNull();
      expect(getStaleFeeds()).toEqual([]);
    });
    it('produce and TPH feeds stay current without wildlifeRows', () => {
      setTphFeed({
        methodId: 'tph.tphcwg',
        label: 't',
        targetHazardIndex: 1,
        totalMgPerKg: 1,
        fractions: [],
        unmapped: [],
        warnings: [],
      });
      asOldFile('plantsEco', ['wildlifeRows'], ['tph']);
      expect(getTphFeed()).not.toBeNull();
      expect(getStaleFeeds()).toEqual([]);
    });
    it('a genuine change after the load still flags the feed', () => {
      setWellFeed(wellFeed);
      asOldFile('transport', ['chemicalId', 'foc'], ['well']);
      const s = getScreen('transport');
      setScreen('transport', { ...s, form: { ...s.form, K: '99' } });
      flushAutosave();
      reload();
      expect(getStaleFeeds()).toEqual(['well']);
    });
    it('a changed organic carbon fraction flags a transport feed', () => {
      setWellFeed(wellFeed);
      const s = getScreen('transport');
      setScreen('transport', { ...s, form: { ...s.form, foc: '0.02' } });
      flushAutosave();
      reload();
      expect(getStaleFeeds()).toEqual(['well']);
    });
  });

  describe('project overrides', () => {
    const ov = () => ({
      ...emptyOverrides(),
      toxicity: setField({}, '71-43-2', 'sfo', { value: '0.9', note: 'agency memo' }),
    });

    it('survive a reload through the autosave', () => {
      setOverrides(ov());
      flushAutosave();
      expect(saved()).toMatchObject({
        overrides: { toxicity: { '71-43-2': { sfo: { value: '0.9' } } } },
      });
      reload();
      expect(getOverrides()).toEqual(ov());
    });

    it('stay out of the file when empty, round trip through the file, and clear on a new project', () => {
      expect(currentProject()).not.toHaveProperty('overrides');
      setOverrides(ov());
      const r = parseProject(JSON.stringify(currentProject()));
      expect(r.ok).toBe(true);
      expect(r.ok && r.warnings).toEqual([]);
      newProject();
      expect(getOverrides()).toEqual(emptyOverrides());
      if (r.ok) loadProject(r.project);
      expect(getOverrides()).toEqual(ov());
      newProject();
      expect(getOverrides()).toEqual(emptyOverrides());
    });

    it('count as an unsaved change', () => {
      markSaved();
      expect(hasUnsavedChanges()).toBe(false);
      setOverrides(ov());
      expect(hasUnsavedChanges()).toBe(true);
    });

    it('do not hide a stale feed: a changed source form still flags it', () => {
      setOverrides(ov());
      setWellFeed(wellFeed);
      const s = getScreen('transport');
      setScreen('transport', { ...s, form: { ...s.form, K: '99' } });
      flushAutosave();
      reload();
      expect(getOverrides()).toEqual(ov());
      expect(getStaleFeeds()).toEqual(['well']);
    });
  });

  describe('site model choices', () => {
    const site = (): SiteState => ({
      ...defaultSite(),
      receptors: 'ecological',
      basis: 'modeled',
      media: ['soilGasToIndoorAir'],
      vaporMethod: 'legacy',
    });

    it('survive a reload through the autosave', () => {
      setSite(site());
      flushAutosave();
      expect(saved()).toMatchObject({ site: { basis: 'modeled', vaporMethod: 'legacy' } });
      reload();
      expect(getSite()).toEqual(site());
    });

    it('stay out of the file at the defaults, round trip through the file, and clear on a new project', () => {
      expect(currentProject()).not.toHaveProperty('site');
      setSite(site());
      const r = parseProject(JSON.stringify(currentProject()));
      expect(r.ok).toBe(true);
      expect(r.ok && r.warnings).toEqual([]);
      newProject();
      expect(getSite()).toEqual(defaultSite());
      if (r.ok) loadProject(r.project);
      expect(getSite()).toEqual(site());
      newProject();
      expect(getSite()).toEqual(defaultSite());
    });

    it('count as an unsaved change', () => {
      markSaved();
      expect(hasUnsavedChanges()).toBe(false);
      setSite(site());
      expect(hasUnsavedChanges()).toBe(true);
    });

    it('load as the defaults from a file with no site key', () => {
      const r = parseProject(JSON.stringify(currentProject()));
      setSite(site());
      if (r.ok) loadProject(r.project);
      expect(getSite()).toEqual(defaultSite());
    });
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

  it('one unusable feed is dropped but the forms still come back', () => {
    const s = getScreen('vadose');
    setScreen('vadose', { form: { ...s.form, infiltration: '0.3' } });
    setWellFeed(wellFeed);
    setVaporRiskFeed({ chemicalId: '71-43-2', label: 'benzene' });
    flushAutosave();
    const doc = JSON.parse(localStorage.getItem(AUTOSAVE_KEY)!);
    doc.feeds.well.value.values = [0, null, 2e-6];
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
    reload();
    expect(getScreen('vadose').form.infiltration).toBe('0.3');
    expect(getWellFeed()).toBeNull();
    expect(getVaporRiskFeed()?.chemicalId).toBe('71-43-2');
    expect(getDroppedFeeds()).toEqual(['well']);
  });

  it('editing the vapor form does not flag a received vadose feed, editing the vadose form does', () => {
    setVadoseVaporFeed({ kind: 'poreWater', label: 'pore water', constant: 1e-3 });
    flushAutosave();
    expect(Object.keys(saved()?.feeds ?? {})).toEqual(['vaporVadose']);
    const v = getScreen('vapor');
    setScreen('vapor', { ...v, form: { ...v.form, H: '9.9' } });
    flushAutosave();
    reload();
    expect(getStaleFeeds()).toEqual([]);
    const d = getScreen('vadose');
    setScreen('vadose', { form: { ...d.form, infiltration: '0.4' } });
    flushAutosave();
    reload();
    expect(getStaleFeeds()).toEqual(['vaporVadose']);
  });

  it('flushes the autosave when the page is hidden or unloaded', () => {
    startProjectStore();
    const s = getScreen('transport');
    setScreen('transport', { ...s, form: { ...s.form, K: '7' } });
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull();
    window.dispatchEvent(new Event('pagehide'));
    expect(saved()?.screens?.transport?.form?.K).toBe('7');
    setScreen('transport', { ...s, form: { ...s.form, K: '8' } });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    expect(saved()?.screens?.transport?.form?.K).toBe('8');
  });
});
