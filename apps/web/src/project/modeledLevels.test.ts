import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { savedFixture } from '../cleanup/modeledLevels.testkit';
import { buildProject, defaultScreens, modeledLevelsOf, parseProject } from './index';
import {
  currentProject,
  forgetMemory,
  getModeledLevels,
  hasUnsavedChanges,
  loadProject,
  markSaved,
  newProject,
  removeProjectChemical,
  setModeledLevels,
} from './store';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const FIXTURES = `${process.cwd()}/src/project/fixtures/`;
const read = (name: string): string => readFileSync(`${FIXTURES}${name}`, 'utf8');

describe('modeled cleanup levels in a project file', () => {
  beforeEach(() => {
    forgetMemory();
    newProject();
  });

  it('are written under their own key and read back after a trip through text', () => {
    const p = buildProject({
      screens: defaultScreens(),
      modeledLevels: { '1330-20-7': savedFixture() },
      createdWith: '0',
      now: NOW,
    });
    const r = parseProject(JSON.stringify(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(modeledLevelsOf(r.project)).toEqual({ '1330-20-7': savedFixture() });
  });

  it('write no key when there are none, so a project without them is unchanged', () => {
    const p = buildProject({
      screens: defaultScreens(),
      modeledLevels: {},
      createdWith: '0',
      now: NOW,
    });
    expect('modeledLevels' in p).toBe(false);
  });

  it('a project saved before this change still loads, with none kept', () => {
    for (const name of ['project-v1.json', 'project-v2-expected.json']) {
      const r = parseProject(read(name));
      expect(r.ok, name).toBe(true);
      if (!r.ok) continue;
      expect(modeledLevelsOf(r.project)).toEqual({});
      loadProject(r.project, r.droppedFeeds);
      expect(getModeledLevels()).toEqual({});
    }
  });

  it('an entry that does not parse is dropped and never refuses the file', () => {
    const p = buildProject({
      screens: defaultScreens(),
      modeledLevels: { good: savedFixture({ chemicalId: 'good' }) },
      createdWith: '0',
      now: NOW,
    });
    const doc = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
    (doc['modeledLevels'] as Record<string, unknown>)['bad'] = {
      chemicalId: 'bad',
      nonsense: true,
    };
    const r = parseProject(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(modeledLevelsOf(r.project))).toEqual(['good']);
  });

  it('are kept in the live project, saved with it and restored on open', () => {
    setModeledLevels(savedFixture());
    expect(currentProject().modeledLevels).toEqual({ '1330-20-7': savedFixture() });
    const text = JSON.stringify(currentProject());
    forgetMemory();
    expect(getModeledLevels()).toEqual({});
    const r = parseProject(text);
    if (!r.ok) throw new Error(r.error);
    loadProject(r.project, r.droppedFeeds);
    expect(getModeledLevels()['1330-20-7']).toEqual(savedFixture());
  });

  it('count as an unsaved change only when they change', () => {
    markSaved();
    setModeledLevels(savedFixture());
    expect(hasUnsavedChanges()).toBe(true);
    markSaved();
    setModeledLevels(savedFixture());
    expect(hasUnsavedChanges()).toBe(false);
    setModeledLevels(savedFixture({ fingerprint: 'other' }));
    expect(hasUnsavedChanges()).toBe(true);
  });

  it('go when their chemical is removed from the project, and with a new project', () => {
    setModeledLevels(savedFixture());
    setModeledLevels(savedFixture({ chemicalId: 'x', chemical: 'X' }));
    removeProjectChemical('1330-20-7');
    expect(Object.keys(getModeledLevels())).toEqual(['x']);
    newProject();
    expect(getModeledLevels()).toEqual({});
  });
});
