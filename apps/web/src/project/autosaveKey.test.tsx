import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBar } from './ProjectBar';
import { CURRENT_VERSION } from './index';
import {
  AUTOSAVE_KEY,
  LEGACY_AUTOSAVE_KEY,
  PREVIOUS_AUTOSAVE_KEY,
  flushAutosave,
  forgetMemory,
  getAutosaveNotice,
  getScreen,
  hydrate,
  newProject,
  setScreen,
} from './store';

const editK = (value: string): void => {
  const s = getScreen('transport');
  setScreen('transport', { ...s, form: { ...s.form, K: value } });
};

function makeSave(): string {
  editK('77');
  flushAutosave();
  const text = localStorage.getItem(AUTOSAVE_KEY) as string;
  localStorage.clear();
  forgetMemory();
  return text;
}

describe('autosave keys', () => {
  beforeEach(() => {
    localStorage.clear();
    forgetMemory();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    forgetMemory();
  });

  it('the current key is the version 3 key and differs from the older two', () => {
    expect(AUTOSAVE_KEY).toBe('model_flow.project.autosave.v3');
    expect(PREVIOUS_AUTOSAVE_KEY).toBe('model_flow.project.autosave.v2');
    expect(LEGACY_AUTOSAVE_KEY).toBe('model_flow.project.autosave.v1');
  });

  it('a version 3 autosave loads', () => {
    const text = makeSave();
    localStorage.setItem(AUTOSAVE_KEY, text);
    hydrate();
    expect(getScreen('transport').form.K).toBe('77');
    expect(getAutosaveNotice()).toBeNull();
  });

  it('an old key autosave migrates on first load and the old key is never touched', () => {
    const text = makeSave();
    localStorage.setItem(LEGACY_AUTOSAVE_KEY, text);
    hydrate();
    expect(getScreen('transport').form.K).toBe('77');
    editK('78');
    flushAutosave();
    expect(localStorage.getItem(LEGACY_AUTOSAVE_KEY)).toBe(text);
    expect(JSON.parse(localStorage.getItem(AUTOSAVE_KEY) as string).screens.transport.form.K).toBe(
      '78',
    );
    newProject();
    expect(localStorage.getItem(LEGACY_AUTOSAVE_KEY)).toBe(text);
  });

  it('a version 2 autosave migrates on first load and the version 2 key is never touched', () => {
    const doc = JSON.parse(makeSave());
    doc.version = 2;
    delete doc.guided;
    const v2 = JSON.stringify(doc);
    localStorage.setItem(PREVIOUS_AUTOSAVE_KEY, v2);
    hydrate();
    expect(getScreen('transport').form.K).toBe('77');
    editK('79');
    flushAutosave();
    expect(localStorage.getItem(PREVIOUS_AUTOSAVE_KEY)).toBe(v2);
    const written = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) as string);
    expect(written.version).toBe(3);
    expect(written.screens.transport.form.K).toBe('79');
    newProject();
    expect(localStorage.getItem(PREVIOUS_AUTOSAVE_KEY)).toBe(v2);
  });

  it('the newest key wins over the older ones', () => {
    const text = makeSave();
    localStorage.setItem(LEGACY_AUTOSAVE_KEY, text.replace('"77"', '"11"'));
    localStorage.setItem(PREVIOUS_AUTOSAVE_KEY, text.replace('"77"', '"22"'));
    localStorage.setItem(AUTOSAVE_KEY, text);
    hydrate();
    expect(getScreen('transport').form.K).toBe('77');
  });

  it('the version 2 key wins over the version 1 key', () => {
    const text = makeSave();
    localStorage.setItem(LEGACY_AUTOSAVE_KEY, text.replace('"77"', '"11"'));
    localStorage.setItem(PREVIOUS_AUTOSAVE_KEY, text.replace('"77"', '"22"'));
    hydrate();
    expect(getScreen('transport').form.K).toBe('22');
  });

  it('edits write only the new key', () => {
    hydrate();
    editK('5');
    flushAutosave();
    expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull();
    expect(localStorage.getItem(PREVIOUS_AUTOSAVE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_AUTOSAVE_KEY)).toBeNull();
  });

  it('a too-new autosave is not overwritten and the notice shows', () => {
    const doc = JSON.parse(makeSave());
    doc.version = CURRENT_VERSION + 1;
    const newer = JSON.stringify(doc);
    localStorage.setItem(AUTOSAVE_KEY, newer);
    hydrate();
    expect(getAutosaveNotice()).toMatch(/newer version of the app/i);
    editK('9');
    flushAutosave();
    newProject();
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBe(newer);
    render(<ProjectBar />);
    expect(screen.getByRole('status').textContent).toMatch(/will not save over it/i);
  });
});
