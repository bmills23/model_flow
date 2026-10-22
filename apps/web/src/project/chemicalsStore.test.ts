import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChemicalRow } from '../risk/form';
import { clearWellFeed, getWellFeed } from '../transport/wellFeed';
import { DEFAULT_FORM } from '../transport/form';
import { buildProject, defaultScreens, feedEntry, parseProject } from './index';
import {
  AUTOSAVE_KEY,
  addChemical,
  currentProject,
  flushAutosave,
  forgetMemory,
  getChemicals,
  getScreen,
  getStaleFeeds,
  hasUnsavedChanges,
  hydrate,
  loadProject,
  markSaved,
  newProject,
  removeChemical,
  setScreen,
  subscribeChemicals,
} from './store';
import { deriveChemicals } from './chemicals';

const row = (id: string, name: string): ChemicalRow => ({
  id,
  name,
  dermalForm: undefined,
  conc: {},
  groundwaterFromWell: false,
  indoorFromVapor: false,
  outdoorFromVapor: false,
  surfaceWaterFromModel: false,
  bathroomFromHousehold: false,
  indoorFromHousehold: false,
  outdoorFromHousehold: '',
  produceFromPlantsEco: false,
});
const well = { method: 'modern' as const, label: 'w', times: [0, 1], values: [0, 1] };

function setTransportChemical(id: string): void {
  const s = getScreen('transport');
  setScreen('transport', { ...s, form: { ...s.form, chemicalId: id } });
}

describe('project chemical list in the store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    forgetMemory();
    clearWellFeed();
    newProject();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty and a screen choosing a chemical adds it', () => {
    expect(getChemicals()).toEqual([]);
    setTransportChemical('71-43-2');
    expect(getChemicals()).toEqual([{ id: '71-43-2', name: '71-43-2' }]);
  });

  it('a risk row adds its entry with the row name once', () => {
    const s = getScreen('risk');
    setScreen('risk', { ...s, form: { ...s.form, chemicals: [row('108-88-3', 'Toluene')] } });
    setTransportChemical('108-88-3');
    expect(getChemicals()).toEqual([{ id: '108-88-3', name: 'Toluene' }]);
  });

  it('a removed entry stays removed until its chemical newly appears again', () => {
    setTransportChemical('71-43-2');
    removeChemical('71-43-2');
    expect(getChemicals()).toEqual([]);
    setScreen('transport', { ...getScreen('transport') });
    expect(getChemicals()).toEqual([]);
    setTransportChemical('');
    setTransportChemical('71-43-2');
    expect(getChemicals()).toHaveLength(1);
  });

  it('add ignores a blank or repeated id; subscribers hear about changes only', () => {
    const fn = vi.fn();
    const off = subscribeChemicals(fn);
    addChemical({ id: '', name: 'x' });
    addChemical({ id: '56-23-5', name: 'Carbon tetrachloride' });
    addChemical({ id: '56-23-5', name: 'again' });
    removeChemical('nope');
    expect(getChemicals()).toEqual([{ id: '56-23-5', name: 'Carbon tetrachloride' }]);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    removeChemical('56-23-5');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('adding an entry is an unsaved change and is autosaved', () => {
    markSaved();
    expect(hasUnsavedChanges()).toBe(false);
    addChemical({ id: '56-23-5', name: 'CCl4' });
    expect(hasUnsavedChanges()).toBe(true);
    flushAutosave();
    expect(JSON.parse(localStorage.getItem(AUTOSAVE_KEY) ?? '{}').chemicals).toEqual([
      { id: '56-23-5', name: 'CCl4' },
    ]);
  });

  it('saving writes the key, and a reload restores an emptied list as empty', () => {
    addChemical({ id: '56-23-5', name: 'CCl4' });
    removeChemical('56-23-5');
    flushAutosave();
    expect(currentProject().chemicals).toEqual([]);
    const text = localStorage.getItem(AUTOSAVE_KEY);
    forgetMemory();
    localStorage.setItem(AUTOSAVE_KEY, text ?? '');
    hydrate();
    expect(getChemicals()).toEqual([]);
  });

  it('loading a project with the key uses it; without it derives from the screens', () => {
    const screens = defaultScreens();
    screens.transport.form.chemicalId = '127-18-4';
    const without = buildProject({ screens, createdWith: '0' });
    const r1 = parseProject(JSON.parse(JSON.stringify(without)));
    if (!r1.ok) throw new Error(r1.error);
    loadProject(r1.project);
    expect(getChemicals()).toEqual(deriveChemicals(screens));

    const withKey = buildProject({
      screens,
      chemicals: [{ id: 'x', name: 'Kept' }],
      createdWith: '0',
    });
    const r2 = parseProject(JSON.parse(JSON.stringify(withKey)));
    if (!r2.ok) throw new Error(r2.error);
    loadProject(r2.project);
    expect(getChemicals()).toEqual([{ id: 'x', name: 'Kept' }]);
  });

  it('a new project clears the list', () => {
    addChemical({ id: 'x', name: 'X' });
    newProject();
    expect(getChemicals()).toEqual([]);
  });

  it('an older file opens with its held feed fresh, and the list changes no stale mark', () => {
    const screens = defaultScreens();
    screens.transport.form = { ...DEFAULT_FORM, chemicalId: '127-18-4' };
    const doc = buildProject({
      screens,
      feeds: { well: feedEntry('transport', screens.transport.form, well) } as never,
      createdWith: '0',
    });
    const r = parseProject(JSON.parse(JSON.stringify(doc)));
    if (!r.ok) throw new Error(r.error);
    expect(r.project.chemicals).toBeUndefined();
    loadProject(r.project);
    expect(getWellFeed()).not.toBeNull();
    expect(getStaleFeeds()).toEqual([]);
    expect(getChemicals().map((c) => c.id)).toEqual(['127-18-4']);
    addChemical({ id: 'y', name: 'Y' });
    removeChemical('127-18-4');
    expect(getStaleFeeds()).toEqual([]);
  });

  it('the strip path is unchanged: a document without the key warns about nothing', () => {
    const doc = JSON.parse(
      JSON.stringify(buildProject({ screens: defaultScreens(), chemicals: [], createdWith: '0' })),
    );
    delete doc.chemicals;
    const r = parseProject(doc);
    expect(r.ok && r.warnings).toEqual([]);
  });
});
