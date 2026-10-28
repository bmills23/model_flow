import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultGuided, type GuidedState } from '../state';
import { PathwaysStep } from './PathwaysStep';
import { forgetMemory, getGuided, setGuided } from '../../project/store';

beforeEach(() => forgetMemory());
afterEach(() => {
  cleanup();
  forgetMemory();
});

const start = (patch: (g: GuidedState) => void): void => {
  const g = defaultGuided();
  patch(g);
  setGuided(g);
};
const box = (name: RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

describe('PathwaysStep, 4a', () => {
  it('starts available pathways ticked and shows the ruled-out ones disabled with the reason', () => {
    start((g) => {
      g.site.basis = 'measured';
      g.site.measured = ['soil'];
    });
    render(<PathwaysStep />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pathways' })).toBeTruthy();
    expect(box(/^soil ingestion/i).checked).toBe(true);
    expect(box(/^soil ingestion/i).disabled).toBe(false);
    const swim = box(/^swimming ingestion/i);
    expect(swim.checked).toBe(false);
    expect(swim.disabled).toBe(true);
    const reason = document.getElementById(swim.getAttribute('aria-describedby')!)!;
    expect(reason.textContent).toMatch(/ruled out/i);
    expect(reason.textContent).toMatch(/surface water/i);
    expect(screen.getByRole('status').textContent).toMatch(/2 of 2 available pathways ticked/i);
  });

  it('saves only a changed tick, and ticking again removes it', () => {
    start((g) => {
      g.site.basis = 'measured';
      g.site.measured = ['soil'];
    });
    render(<PathwaysStep />);
    fireEvent.click(box(/^soil ingestion/i));
    expect(getGuided().exposure.pathways).toEqual({ soilIngestion: false });
    expect(box(/^soil ingestion/i).checked).toBe(false);
    fireEvent.click(box(/^soil ingestion/i));
    expect(getGuided().exposure.pathways).toEqual({});
  });

  it('asks for a tick when none is on, and follows a change to the site model', () => {
    start((g) => {
      g.site.basis = 'measured';
      g.site.measured = ['soil'];
      g.exposure.pathways = { soilIngestion: false, soilDermal: false };
    });
    render(<PathwaysStep />);
    expect(screen.getByRole('status').textContent).toMatch(/tick at least one/i);
    act(() => {
      const g = getGuided();
      setGuided({ ...g, site: { ...g.site, measured: ['soil', 'groundwater'] } });
    });
    expect(box(/^drinking water/i).checked).toBe(true);
  });

  it('sends the person to step 2 while its answers do not work together', () => {
    render(<PathwaysStep />);
    expect(screen.getByRole('alert').textContent).toMatch(/step 2/i);
    expect(box(/^soil ingestion/i).disabled).toBe(true);
  });
});
