import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { clearSurfaceWaterFeed } from '../surfaceWater/feed';
import { SurfaceWaterScreen } from '../surfaceWater/SurfaceWaterScreen';
import { clearWellFeed, getWellFeed, setWellFeed } from '../transport/wellFeed';
import { AUTOSAVE_KEY, flushAutosave, forgetMemory, getScreen, hydrate } from './store';

const mixing = (): HTMLInputElement =>
  screen.getByLabelText(/^mixing fraction/i) as HTMLInputElement;

describe('screens and the project store', () => {
  beforeEach(() => {
    localStorage.clear();
    forgetMemory();
    window.location.hash = '';
  });
  afterEach(() => {
    clearWellFeed();
    clearSurfaceWaterFeed();
    vi.restoreAllMocks();
    localStorage.clear();
    forgetMemory();
  });

  it('a screen keeps its form when it is left and opened again', () => {
    render(<SurfaceWaterScreen />);
    fireEvent.change(mixing(), { target: { value: '0.37' } });
    cleanup();
    render(<SurfaceWaterScreen />);
    expect(mixing().value).toBe('0.37');
  });

  it('a form survives a reload through the autosave', () => {
    render(<SurfaceWaterScreen />);
    fireEvent.change(mixing(), { target: { value: '0.41' } });
    flushAutosave();
    cleanup();
    const text = localStorage.getItem(AUTOSAVE_KEY) as string;
    forgetMemory();
    localStorage.setItem(AUTOSAVE_KEY, text);
    expect(getScreen('surfaceWater').form.mixingFraction).not.toBe('0.41');
    hydrate();
    render(<SurfaceWaterScreen />);
    expect(mixing().value).toBe('0.41');
  });

  it('New project asks first, then clears the open screen, the feeds and the autosave', () => {
    window.location.hash = '#/surface-water';
    setWellFeed({ method: 'modern', label: 'w', times: [0, 1], values: [0, 1] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    return screen.findByLabelText(/^mixing fraction/i, undefined, { timeout: 10000 }).then((el) => {
      const original = (el as HTMLInputElement).value;
      fireEvent.change(el, { target: { value: '0.99' } });
      flushAutosave();
      fireEvent.click(screen.getByRole('button', { name: /new project/i }));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(mixing().value).toBe('0.99');
      expect(getWellFeed()).not.toBeNull();
      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole('button', { name: /new project/i }));
      expect(mixing().value).toBe(original);
      expect(getWellFeed()).toBeNull();
      // the empty project is stored, so an older key cannot bring the previous one back
      const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) as string);
      expect(saved.feeds ?? {}).toEqual({});
      expect(saved.screens.groundwater?.form?.mixing ?? original).toBe(original);
    });
  }, 20000);
});
