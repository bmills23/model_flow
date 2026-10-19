import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FORM } from '../transport/form';
import { clearWellFeed, getWellFeed, setWellFeed } from '../transport/wellFeed';
import { getVadoseFeed } from '../vadose/feed';
import { buildProject, defaultScreens } from './index';
import {
  currentProject,
  getEpoch,
  getScreen,
  getTitle,
  hasUnsavedChanges,
  loadProject,
  markSaved,
  setScreen,
  setTitle,
} from './store';

const well = { method: 'modern' as const, label: 'w', times: [0, 1], values: [0, 1] };

describe('opening and saving a project in the store', () => {
  beforeEach(() => {
    clearWellFeed();
    markSaved();
  });

  it('a fresh project has no unsaved changes; an edit makes it dirty; saving clears it', () => {
    expect(hasUnsavedChanges()).toBe(false);
    const t = getScreen('transport');
    setScreen('transport', { ...t, form: { ...t.form, K: '77' } });
    expect(hasUnsavedChanges()).toBe(true);
    markSaved();
    expect(hasUnsavedChanges()).toBe(false);
    setTitle('Site B');
    expect(hasUnsavedChanges()).toBe(true);
  });

  it('a new feed counts as a change', () => {
    setWellFeed(well);
    expect(hasUnsavedChanges()).toBe(true);
  });

  it('currentProject carries the title, screens and feeds', () => {
    setTitle('Site C');
    setWellFeed(well);
    const p = currentProject();
    expect(p.title).toBe('Site C');
    expect(p.feeds?.well?.value).toEqual(well);
    expect(p.screens.transport).toBeDefined();
  });

  it('loadProject replaces screens, title and feeds, bumps the epoch and starts clean', () => {
    setWellFeed(well);
    const screens = defaultScreens();
    screens.transport = { ...screens.transport, form: { ...DEFAULT_FORM, K: '123' } };
    const p = buildProject({ screens, createdWith: '0.0.0', title: 'Loaded' });
    const before = getEpoch();
    loadProject(p);
    expect(getEpoch()).toBe(before + 1);
    expect(getScreen('transport').form.K).toBe('123');
    expect(getTitle()).toBe('Loaded');
    expect(getWellFeed()).toBeNull();
    expect(getVadoseFeed()).toBeNull();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('loadProject restores the feeds a file carries', () => {
    setWellFeed(well);
    const saved = currentProject();
    clearWellFeed();
    loadProject(saved);
    expect(getWellFeed()).toEqual(well);
  });

  it('a project with no title clears the old title', () => {
    setTitle('Old');
    loadProject(buildProject({ screens: defaultScreens(), createdWith: '0.0.0' }));
    expect(getTitle()).toBe('');
  });
});
