import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultForm, type ChemicalRow } from '../risk/form';
import { defaultCleanupForm } from '../cleanup/form';
import { getWellFeedSlots, setWellFeed } from '../transport/wellFeed';
import { getHouseholdFeedSlots } from '../household/feeds';
import {
  addChemical,
  forgetMemory,
  getChemicals,
  getHeldSlots,
  getScreen,
  getStaleSlots,
  newProject,
  removeProjectChemical,
  setScreen,
  getOverrides,
  setOverrides,
  updateChemical,
  nextProjectUserId,
} from './store';
import { newSurfaceTarget } from '../cleanup/surfaceWaterTarget';

const row = (id: string, name: string, conc = {}): ChemicalRow => ({
  id,
  name,
  dermalForm: undefined,
  conc,
  groundwaterFromWell: false,
  indoorFromVapor: false,
  outdoorFromVapor: false,
  surfaceWaterFromModel: false,
  bathroomFromHousehold: false,
  indoorFromHousehold: false,
  outdoorFromHousehold: '',
  produceFromPlantsEco: false,
});
const well = (chemicalId: string) => ({
  method: 'modern' as const,
  label: 'w',
  times: [0, 1],
  values: [0, 1],
  chemicalId,
});

describe('removeProjectChemical', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    forgetMemory();
    newProject();
  });
  afterEach(() => vi.useRealTimers());

  it('takes the chemical out of the list, both screens and every feed slot it held, and leaves the others', () => {
    setScreen('risk', {
      form: {
        ...defaultForm(),
        chemicals: [row('71-43-2', 'Benzene', { soil: '1' }), row('108-88-3', 'Toluene')],
      },
    });
    setScreen('cleanup', {
      form: {
        ...defaultCleanupForm(),
        chemicals: [row('71-43-2', 'Benzene'), row('108-88-3', 'Toluene')],
      },
    });
    setWellFeed(well('71-43-2'));
    setWellFeed(well('108-88-3'));
    expect(getChemicals().map((c) => c.id)).toEqual(['71-43-2', '108-88-3']);
    expect(getHeldSlots('71-43-2')).toEqual(['well']);

    removeProjectChemical('71-43-2');

    expect(getChemicals().map((c) => c.id)).toEqual(['108-88-3']);
    expect(getScreen('risk').form.chemicals.map((c) => c.id)).toEqual(['108-88-3']);
    expect(getScreen('cleanup').form.chemicals.map((c) => c.id)).toEqual(['108-88-3']);
    expect([...getWellFeedSlots().keys()]).toEqual(['108-88-3']);
    expect(getHeldSlots('71-43-2')).toEqual([]);
    expect(getHeldSlots('108-88-3')).toEqual(['well']);
    expect(getHouseholdFeedSlots().size).toBe(0);
    expect(getStaleSlots().some((s) => s.chemicalId === '71-43-2')).toBe(false);
  });

  it('drops the step 3c chemical value edits of the removed chemical only', () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    addChemical({ id: '108-88-3', name: 'Toluene' });
    const entry = { value: '100', note: 'lab' };
    setOverrides({
      ...getOverrides(),
      fate: { '71-43-2': { koc: entry }, '108-88-3': { koc: entry } },
    });
    removeProjectChemical('71-43-2');
    expect(Object.keys(getOverrides().fate)).toEqual(['108-88-3']);
  });

  it('is a no-op for an id the project does not hold', () => {
    addChemical({ id: 'x', name: 'X' });
    removeProjectChemical('nothing');
    expect(getChemicals().map((c) => c.id)).toEqual(['x']);
  });

  describe('a removed user chemical', () => {
    const user = (id: string, name: string) => ({
      id,
      name,
      values: { sfo: { value: '1', note: 'n' } },
    });
    const setup = () => {
      addChemical(user('user-1', 'One'));
      addChemical(user('user-2', 'Two'));
      setScreen('cleanup', {
        form: {
          ...defaultCleanupForm(),
          chemicals: [row('user-2', 'Two')],
          surfaceTargets: [newSurfaceTarget('user-2'), newSurfaceTarget('user-1')],
        },
      });
      setOverrides({
        ...getOverrides(),
        toxicity: {
          'user-2': { sfo: { value: '2', note: 'x' } },
          'user-1': { sfo: { value: '3', note: 'y' } },
        },
      });
      const v = getScreen('vadose');
      setScreen('vadose', { ...v, form: { ...v.form, chemicalId: 'user-2', Koc: '55' } });
      const u = getScreen('uncertainty');
      setScreen('uncertainty', { ...u, cleanup: { ...u.cleanup, choice: 'user-2|soil' } });
    };

    it('leaves no state keyed to its id', () => {
      setup();
      removeProjectChemical('user-2');
      expect(getScreen('cleanup').form.surfaceTargets.map((t) => t.chemicalId)).toEqual(['user-1']);
      expect(Object.keys(getOverrides().toxicity)).toEqual(['user-1']);
      expect(getScreen('vadose').form.chemicalId).toBe('');
      expect(getScreen('uncertainty').cleanup.choice).toBe('');
    });

    it('does not hand its id to the next user chemical', () => {
      setup();
      removeProjectChemical('user-2');
      expect(nextProjectUserId()).toBe('user-3');
    });
  });

  it('a rename reaches the risk and cleanup rows', () => {
    addChemical({ id: 'user-1', name: 'Old', values: {} });
    setScreen('risk', { form: { ...defaultForm(), chemicals: [row('user-1', 'Old')] } });
    setScreen('cleanup', { form: { ...defaultCleanupForm(), chemicals: [row('user-1', 'Old')] } });
    updateChemical({ id: 'user-1', name: 'New', values: {} });
    expect(getScreen('risk').form.chemicals[0]?.name).toBe('New');
    expect(getScreen('cleanup').form.chemicals[0]?.name).toBe('New');
  });
});
