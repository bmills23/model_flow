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
} from './store';

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

  it('is a no-op for an id the project does not hold', () => {
    addChemical({ id: 'x', name: 'X' });
    removeProjectChemical('nothing');
    expect(getChemicals().map((c) => c.id)).toEqual(['x']);
  });
});
