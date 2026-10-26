import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GuidedShell } from '../GuidedShell';
import { defaultGuided } from '../state';
import { SiteStep } from './SiteStep';
import { addChemical, forgetMemory, getGuided, setGuided } from '../../project/store';

beforeEach(() => forgetMemory());
afterEach(() => {
  cleanup();
  forgetMemory();
});

const tick = (name: RegExp) => fireEvent.click(screen.getByRole('checkbox', { name }));
const pick = (name: RegExp) => fireEvent.click(screen.getByRole('radio', { name }));
const panel = () => screen.getByRole('region', { name: /models your answers use/i });

describe('SiteStep', () => {
  it('shows the model questions for a new project and saves each answer to the guided state', () => {
    render(<SiteStep />);
    expect(screen.getByRole('heading', { level: 1, name: /site model/i })).toBeTruthy();
    pick(/ecological/i);
    expect(getGuided().site.receptors).toBe('ecological');
    tick(/^groundwater$/i);
    expect(getGuided().site.sources).toEqual(['groundwater']);
    tick(/^a drinking water well/i);
    expect(getGuided().site.paths.well).toBe(true);
    pick(/downgradient/i);
    expect(getGuided().site.location).toBe('downgradient');
    tick(/^groundwater$/i);
    expect(getGuided().site.sources).toEqual([]);
  });

  it('allows groundwater and soil gas together (two media)', () => {
    render(<SiteStep />);
    tick(/^groundwater$/i);
    tick(/^soil gas$/i);
    tick(/^a drinking water well/i);
    tick(/^a building/i);
    expect(getGuided().site.sources).toEqual(['groundwater', 'soilGas']);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(panel().textContent).toMatch(/starts from: soil gas/i);
    expect(panel().textContent).toMatch(/starts from: groundwater/i);
  });

  it('lists the problems of the chain as they arise and clears them when fixed', () => {
    render(<SiteStep />);
    expect(screen.getByRole('alert').textContent).toMatch(/at least one source/i);
    tick(/^groundwater$/i);
    expect(screen.getByRole('alert').textContent).toMatch(/at least one path/i);
    tick(/^a drinking water well/i);
    expect(screen.queryByRole('alert')).toBeNull();
    tick(/^leaching/i);
    expect(screen.getByRole('alert').textContent).toMatch(/soil above the water table/i);
  });

  it('shows the chain panel: per path the source, the models and the notes', () => {
    render(<SiteStep />);
    tick(/^soil above the water table$/i);
    tick(/^leaching/i);
    tick(/^a drinking water well/i);
    const p = within(panel());
    expect(p.getByText(/leaching to groundwater/i)).toBeTruthy();
    expect(p.getAllByText(/soil leaching model/i).length).toBeGreaterThan(0);
    expect(p.getAllByText(/groundwater transport model/i).length).toBeGreaterThan(0);
    expect(panel().textContent).not.toMatch(/\bvadose\b|\btransport\b(?!\s*model)/);
  });

  it('shows the indoor air method only with the building path, and saves it', () => {
    render(<SiteStep />);
    expect(screen.queryByRole('radio', { name: /oxygen/i })).toBeNull();
    tick(/^soil gas$/i);
    tick(/^a building/i);
    pick(/oxygen/i);
    expect(getGuided().site.indoorModel).toBe('oxygenLimited');
  });

  it('shows the produce question for people only', () => {
    render(<SiteStep />);
    pick(/^soil$/i);
    expect(getGuided().site.produce).toBe('soil');
    pick(/ecological/i);
    expect(screen.queryByRole('radio', { name: /irrigation/i })).toBeNull();
  });

  it('switches to measured concentrations with their own media list', () => {
    render(<SiteStep />);
    pick(/enter them directly/i);
    expect(getGuided().site.basis).toBe('measured');
    expect(screen.queryByRole('checkbox', { name: /^leaching/i })).toBeNull();
    tick(/^indoor air$/i);
    expect(getGuided().site.measured).toEqual(['indoorAir']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps answers when the screen is opened again', () => {
    const g = defaultGuided();
    g.site.sources = ['soilGas'];
    g.site.paths.building = true;
    act(() => setGuided(g));
    render(<SiteStep />);
    expect(
      (screen.getByRole('checkbox', { name: /^soil gas$/i }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole('checkbox', { name: /^a building/i }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('marks the Run step to run again when an answer changes what the Run needs', () => {
    addChemical({ id: 'benzene', name: 'Benzene' });
    const g = defaultGuided();
    g.site.sources = ['groundwater', 'soilGas'];
    g.site.paths.well = true;
    g.outputs = {
      well: { benzene: { inputsHash: 'h', value: {} } },
      household: { benzene: { inputsHash: 'h', value: {} } },
    };
    act(() => setGuided(g));
    render(
      <GuidedShell stepId="site">
        <SiteStep />
      </GuidedShell>,
    );
    const nav = screen.getByRole('navigation', { name: /guided steps/i });
    const run = () => within(nav).getAllByRole('listitem')[4]!;
    expect(run().textContent).toMatch(/done/i);
    tick(/^a building/i);
    expect(run().textContent).toMatch(/run again/i);
  });
});
