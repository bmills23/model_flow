import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHouseholdFeed, setHouseholdFeed } from '../household/feeds';
import { clearProduceFeed, clearTphFeed, setProduceFeed, setTphFeed } from '../plantsEco/feeds';
import { clearSaturatedFeed, setSaturatedFeed } from '../saturated/feed';
import { DEFAULT_FORM as SAT_FORM, toScenario as toSaturated } from '../saturated/form';
import { clearSurfaceWaterFeed, setSurfaceWaterFeed } from '../surfaceWater/feed';
import { clearBankFeed, setBankFeed } from '../transport/bankFeed';
import { clearTransportFeed, getTransportFeed, setTransportFeed } from '../transport/chainFeed';
import { toScenario } from '../transport/form';
import { clearWellFeed, setWellFeed } from '../transport/wellFeed';
import { clearVadoseFeed, setVadoseFeed } from '../vadose/feed';
import { R7_FORM as VADOSE_FORM, toScenario as toVadose } from '../vadose/form';
import {
  clearSaturatedVaporFeed,
  clearVadoseVaporFeed,
  clearVaporRiskFeed,
  clearWaterTableFeed,
  setSaturatedVaporFeed,
  setVadoseVaporFeed,
  setVaporRiskFeed,
  setWaterTableFeed,
} from '../vapor/feeds';
import {
  AUTOSAVE_KEY,
  flushAutosave,
  forgetMemory,
  getScreen,
  getStaleFeeds,
  hydrate,
  isFeedStaleNow,
  newProject,
  setScreen,
  subscribeStale,
  type StaleFeedKey,
} from './store';
import { REGRESSION_FORM as DEFAULT_FORM } from '../transport/regression.testkit';

const wellFeed = {
  method: 'modern' as const,
  label: 'Receptor well',
  times: [0, 10],
  values: [0, 1e-6],
};
const series = { kind: 'poreWater' as const, label: 'pore water', constant: 1e-3 };
const riskFeed = { chemicalId: '71-43-2', label: 'benzene' };
const waterFeed = {
  method: 'well-mixed' as const,
  origin: 'surfaceWater.well-mixed',
  label: 'sw',
  times: [1, 2],
  values: [1e-6, 2e-6],
};
const householdFeed = { chemicalId: 'x', label: 'x', coefficients: {}, methods: {} };

function transportScenario() {
  const r = toScenario(DEFAULT_FORM);
  if (!r.ok) throw new Error('transport scenario');
  return r.scenario;
}
function satInput() {
  const r = toSaturated(SAT_FORM);
  if (!r.ok) throw new Error('saturated scenario');
  return r.scenario.input;
}
function vadoseScenario() {
  const r = toVadose(VADOSE_FORM);
  if (!r.ok) throw new Error('vadose scenario');
  return r.scenario;
}
function bankScenario() {
  const { zOf: _z, ...plain } = transportScenario();
  void _z;
  return plain;
}

function wipe(): void {
  clearWellFeed();
  clearBankFeed();
  clearTransportFeed();
  clearVadoseFeed();
  clearSaturatedFeed();
  clearVadoseVaporFeed();
  clearWaterTableFeed();
  clearSaturatedVaporFeed();
  clearVaporRiskFeed();
  clearSurfaceWaterFeed();
  clearHouseholdFeed();
  clearProduceFeed();
  clearTphFeed();
}

/** Each edit returns the function that puts the screen back as it was. */
function editTransport(): () => void {
  const before = getScreen('transport');
  setScreen('transport', { ...before, form: { ...before.form, K: '99' } });
  return () => setScreen('transport', before);
}
function editVadose(): () => void {
  const before = getScreen('vadose');
  setScreen('vadose', { form: { ...before.form, infiltration: '0.4' } });
  return () => setScreen('vadose', before);
}
function editSaturated(): () => void {
  const before = getScreen('saturated');
  setScreen('saturated', { ...before, form: { ...before.form, infiltration: '0.4' } });
  return () => setScreen('saturated', before);
}
function editVapor(): () => void {
  const before = getScreen('vapor');
  setScreen('vapor', { ...before, form: { ...before.form, H: '9.9' } });
  return () => setScreen('vapor', before);
}
function editSurfaceWater(): () => void {
  const before = getScreen('surfaceWater');
  setScreen('surfaceWater', { form: { ...before.form, upstreamFlow: '123456' } });
  return () => setScreen('surfaceWater', before);
}
function editHousehold(): () => void {
  const before = getScreen('household');
  setScreen('household', { form: { ...before.form, waterConcentration: '9' } });
  return () => setScreen('household', before);
}
function editPlantsEco(): () => void {
  const before = getScreen('plantsEco');
  setScreen('plantsEco', { form: { ...before.form, soilConcentration: '77' } });
  return () => setScreen('plantsEco', before);
}

const sendProduce = (): void =>
  setProduceFeed({
    chemicalId: '71-43-2',
    label: 'benzene',
    method: 'plantUptake.hhrap-2005',
    factors: {} as never,
    intakes: {} as never,
    intakeLabel: 'user entered',
  });
const sendTph = (): void =>
  setTphFeed({
    methodId: 'tph.tphcwg',
    label: 't',
    targetHazardIndex: 1,
    totalMgPerKg: 1,
    fractions: [],
    unmapped: [],
    warnings: [],
  });

interface Case {
  key: StaleFeedKey;
  send: () => void;
  edit: () => () => void;
}

const CASES: Case[] = [
  { key: 'well', send: () => setWellFeed(wellFeed), edit: editTransport },
  {
    key: 'bank',
    send: () => setBankFeed({ scenario: bankScenario(), label: 'bank' }),
    edit: editTransport,
  },
  {
    key: 'transportChain',
    send: () => setTransportFeed({ scenario: transportScenario(), label: 'chain' }),
    edit: editTransport,
  },
  { key: 'vaporWaterTable', send: () => setWaterTableFeed(series), edit: editTransport },
  { key: 'surfaceWater', send: () => setSurfaceWaterFeed(waterFeed), edit: editSurfaceWater },
  {
    key: 'vadose',
    send: () => setVadoseFeed({ scenario: vadoseScenario(), method: 'modern', label: 'v' }),
    edit: editVadose,
  },
  { key: 'vaporVadose', send: () => setVadoseVaporFeed(series), edit: editVadose },
  {
    key: 'saturated',
    send: () => setSaturatedFeed({ input: satInput(), method: 'legacy', label: 's' }),
    edit: editSaturated,
  },
  { key: 'vaporSaturated', send: () => setSaturatedVaporFeed(series), edit: editSaturated },
  { key: 'vaporRisk', send: () => setVaporRiskFeed(riskFeed), edit: editVapor },
  { key: 'household', send: () => setHouseholdFeed(householdFeed), edit: editHousehold },
  { key: 'produce', send: sendProduce, edit: editPlantsEco },
  { key: 'tph', send: sendTph, edit: editPlantsEco },
];

/**
 * A slot is checked while its screen is set to the slot's chemical (wave O slice O4), so the screens
 * whose feeds always carry a chemical are set to the chemical of the feeds sent below.
 */
function setSenderChemicals(): void {
  const v = getScreen('vapor');
  setScreen('vapor', { ...v, form: { ...v.form, chemicalId: riskFeed.chemicalId } });
  const h = getScreen('household');
  setScreen('household', { form: { ...h.form, chemicalId: householdFeed.chemicalId } });
  const p = getScreen('plantsEco');
  setScreen('plantsEco', { form: { ...p.form, chemicalId: '71-43-2' } });
}

describe('live feed staleness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    forgetMemory();
    wipe();
    setSenderChemicals();
    vi.runAllTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  for (const c of CASES) {
    describe(c.key, () => {
      it('is not stale when sent, stale once the sending inputs differ', () => {
        c.send();
        expect(getStaleFeeds()).toEqual([]);
        expect(isFeedStaleNow(c.key)).toBe(false);
        c.edit();
        expect(getStaleFeeds()).toEqual([c.key]);
        expect(isFeedStaleNow(c.key)).toBe(true);
      });
      it('is not stale again when the inputs are edited back to what was sent', () => {
        c.send();
        const back = c.edit();
        expect(getStaleFeeds()).toEqual([c.key]);
        back();
        expect(getStaleFeeds()).toEqual([]);
      });
      it('is not stale after a re-send', () => {
        c.send();
        c.edit();
        expect(getStaleFeeds()).toEqual([c.key]);
        c.send();
        expect(getStaleFeeds()).toEqual([]);
      });
      it('tells subscribers when the mark changes, and only then', () => {
        const spy = vi.fn();
        const off = subscribeStale(spy);
        c.send();
        expect(spy).not.toHaveBeenCalled();
        const back = c.edit();
        expect(spy).toHaveBeenCalledTimes(1);
        back();
        expect(spy).toHaveBeenCalledTimes(2);
        off();
      });
    });
  }

  it('an unsent feed is never stale, and a cleared one stops being stale', () => {
    editTransport();
    expect(getStaleFeeds()).toEqual([]);
    setWellFeed(wellFeed);
    const t = getScreen('transport');
    setScreen('transport', { ...t, form: { ...t.form, K: '5' } });
    expect(getStaleFeeds()).toEqual(['well']);
    clearWellFeed();
    expect(getStaleFeeds()).toEqual([]);
  });

  it('the list is a stable snapshot until the set changes', () => {
    setWellFeed(wellFeed);
    editTransport();
    const a = getStaleFeeds();
    const t = getScreen('transport');
    setScreen('transport', { ...t, form: { ...t.form, K: '98' } });
    expect(getStaleFeeds()).toBe(a);
  });

  it('editing one screen marks only the feeds it sends', () => {
    setWellFeed(wellFeed);
    setVadoseFeed({ scenario: vadoseScenario(), method: 'modern', label: 'v' });
    editTransport();
    expect(getStaleFeeds()).toEqual(['well']);
  });

  it('a new project clears the marks', () => {
    setWellFeed(wellFeed);
    editTransport();
    newProject();
    expect(getStaleFeeds()).toEqual([]);
  });

  it('a new project drops the groundwater run held for cleanup, with the forms it came from', () => {
    setTransportFeed({ scenario: transportScenario(), label: 'chain' });
    newProject();
    expect(getTransportFeed()).toBeNull();
  });

  describe('inputs held outside the source form', () => {
    it('the well method picked on the transport screen', () => {
      setWellFeed(wellFeed);
      const t = getScreen('transport');
      const other = t.method === 'modern' ? 'legacy' : 'modern';
      setScreen('transport', { ...t, method: other });
      expect(getStaleFeeds()).toEqual(['well']);
      setScreen('transport', t);
      expect(getStaleFeeds()).toEqual([]);
    });

    it('the saturated method picked for sending', () => {
      setSaturatedFeed({ input: satInput(), method: 'legacy', label: 's' });
      const s = getScreen('saturated');
      setScreen('saturated', { ...s, method: s.method === 'modern' ? 'legacy' : 'modern' });
      expect(getStaleFeeds()).toEqual(['saturated']);
    });

    it('the outdoor box on the vapor screen, but not settings no sent value reads', () => {
      setVaporRiskFeed(riskFeed);
      const v = getScreen('vapor');
      setScreen('vapor', { ...v, outdoor: { ...v.outdoor, windSpeed: '9' } });
      expect(getStaleFeeds()).toEqual(['vaporRisk']);
      setScreen('vapor', v);
      expect(getStaleFeeds()).toEqual([]);
      setScreen('vapor', { ...v, pvi: { ...v.pvi, soilBenzene: '5' } });
      expect(getStaleFeeds()).toEqual([]);
    });

    it('the source choice and the source series a sent vapor run was built on', () => {
      setVadoseVaporFeed(series);
      const v = getScreen('vapor');
      setScreen('vapor', { ...v, choice: 'vadose' });
      setVaporRiskFeed(riskFeed);
      expect(getStaleFeeds()).toEqual([]);
      setScreen('vapor', { ...v, choice: 'entered' });
      expect(getStaleFeeds()).toEqual(['vaporRisk']);
      setScreen('vapor', { ...v, choice: 'vadose' });
      expect(getStaleFeeds()).toEqual([]);
      setVadoseVaporFeed({ ...series, constant: 5e-3 });
      expect(getStaleFeeds()).toEqual(['vaporRisk']);
    });

    it('the vadose feed the transport screen reads, only while it reads it', () => {
      setVadoseFeed({ scenario: vadoseScenario(), method: 'modern', label: 'v' });
      setWellFeed(wellFeed);
      setVadoseFeed({ scenario: vadoseScenario(), method: 'legacy', label: 'v2' });
      expect(getStaleFeeds()).toEqual([]);
      const t = getScreen('transport');
      setScreen('transport', { ...t, form: { ...t.form, feedFromVadose: true } });
      setWellFeed(wellFeed);
      expect(getStaleFeeds()).toEqual([]);
      setVadoseFeed({ scenario: vadoseScenario(), method: 'modern', label: 'v3' });
      expect(getStaleFeeds()).toEqual(['well']);
    });

    it('the vadose feed is not read while the saturated feed is on, so a vadose re-send marks nothing', () => {
      setVadoseFeed({ scenario: vadoseScenario(), method: 'modern', label: 'v' });
      setSaturatedFeed({ input: satInput(), method: 'legacy', label: 's' });
      const t = getScreen('transport');
      setScreen('transport', {
        ...t,
        form: { ...t.form, feedFromVadose: true, feedFromSaturated: true },
      });
      setWellFeed(wellFeed);
      expect(getStaleFeeds()).toEqual([]);
      setVadoseFeed({ scenario: vadoseScenario(), method: 'legacy', label: 'v2' });
      expect(getStaleFeeds()).toEqual([]);
      setSaturatedFeed({ input: satInput(), method: 'modern', label: 's2' });
      expect(getStaleFeeds()).toEqual(['well']);
    });

    it('the bank run the surface water screen is linked to', () => {
      const f = getScreen('surfaceWater');
      setScreen('surfaceWater', { form: { ...f.form, linked: true } });
      setBankFeed({ scenario: bankScenario(), label: 'bank' });
      setSurfaceWaterFeed(waterFeed);
      expect(getStaleFeeds()).toEqual([]);
      setBankFeed({ scenario: bankScenario(), label: 'bank 2' });
      expect(getStaleFeeds()).toEqual(['surfaceWater']);
    });

    it('the well result a household section reads, only while a section reads it', () => {
      setHouseholdFeed(householdFeed);
      setWellFeed(wellFeed);
      expect(getStaleFeeds()).toEqual([]);
      const h = getScreen('household');
      setScreen('household', { form: { ...h.form, showerWaterSource: 'well' } });
      setHouseholdFeed(householdFeed);
      setWellFeed({ ...wellFeed, values: [0, 9e-6] });
      expect(getStaleFeeds()).toEqual(['household']);
    });

    it('a re-send of an upstream feed with the same content is not an input change', () => {
      const h = getScreen('household');
      setScreen('household', { form: { ...h.form, showerWaterSource: 'well' } });
      setWellFeed(wellFeed);
      setHouseholdFeed(householdFeed);
      setWellFeed({ ...wellFeed });
      expect(getStaleFeeds()).toEqual([]);
    });
  });

  describe('a restored project', () => {
    function reload(): void {
      flushAutosave();
      const text = localStorage.getItem(AUTOSAVE_KEY)!;
      forgetMemory();
      wipe();
      localStorage.setItem(AUTOSAVE_KEY, text);
      hydrate();
    }

    it('reports what it always did, then follows later edits live', () => {
      setWellFeed(wellFeed);
      const back = editTransport();
      reload();
      expect(getStaleFeeds()).toEqual(['well']);
      // editing the inputs back to what was sent clears the mark in the session
      back();
      expect(getStaleFeeds()).toEqual([]);
      editTransport();
      expect(getStaleFeeds()).toEqual(['well']);
      setWellFeed(wellFeed);
      expect(getStaleFeeds()).toEqual([]);
    });

    it('a current feed is not stale on opening, and goes stale on an edit', () => {
      setWellFeed(wellFeed);
      setVaporRiskFeed(riskFeed);
      reload();
      expect(getStaleFeeds()).toEqual([]);
      editVapor();
      expect(getStaleFeeds()).toEqual(['vaporRisk']);
    });

    it('does not take a setting kept beside the form as a change on opening', () => {
      const t = getScreen('transport');
      setScreen('transport', { ...t, method: 'legacy' });
      setWellFeed(wellFeed);
      reload();
      expect(getStaleFeeds()).toEqual([]);
      setScreen('transport', { ...getScreen('transport'), method: 'modern' });
      expect(getStaleFeeds()).toEqual(['well']);
    });
  });
});
