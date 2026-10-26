import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetMemory, getGuided, setGuided } from '../../project/store';
import { defaultGuided, type GuidedState } from '../state';
import { PropertiesStep } from './PropertiesStep';

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
const box = (name: RegExp) => screen.getByRole('textbox', { name });
const type = (name: RegExp, value: string) => fireEvent.change(box(name), { target: { value } });
const groupNames = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
type Form = Record<string, unknown>;

describe('PropertiesStep', () => {
  it('sends the person back to step 2 while its answers do not work together', () => {
    render(<PropertiesStep />);
    expect(screen.getByRole('heading', { level: 1, name: 'Site properties' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /site model/i }).getAttribute('href')).toBe(
      '#/step/site',
    );
    expect(screen.queryAllByRole('textbox')).toEqual([]);
  });

  it('shows only the groups the chosen models need', () => {
    start((g) => {
      g.site.sources = ['groundwater'];
      g.site.paths.well = true;
    });
    render(<PropertiesStep />);
    expect(groupNames()).toEqual(['Source area', 'Aquifer and well', 'Household water use']);
    act(() => {
      const g = getGuided();
      setGuided({ ...g, site: { ...g.site, paths: { ...g.site.paths, building: true } } });
    });
    expect(groupNames()).toContain('Building');
  });

  it('writes a shared value to every model it stands for', () => {
    start((g) => {
      g.site.sources = ['soilBelow'];
      g.site.paths.well = true;
    });
    render(<PropertiesStep />);
    type(/^source length along the groundwater flow \(m\)/i, '25');
    const forms = getGuided().forms as Record<string, Form>;
    expect(forms['transport']!['srcLength']).toBe('25');
    expect(forms['saturated']!['srcLength']).toBe('25');
    expect(
      within(box(/^source length along the groundwater flow/i).closest('label')!).getByText(
        /entered with no source/i,
      ),
    ).toBeTruthy();
  });

  it('fills the unsaturated zone from a soil type and tags the values it filled', () => {
    start((g) => {
      g.site.sources = ['soilAbove'];
      g.site.paths.leaching = true;
      g.site.paths.building = true;
    });
    render(<PropertiesStep />);
    const unsat = screen.getByRole('region', { name: /unsaturated zone/i });
    fireEvent.change(within(unsat).getByRole('combobox', { name: /soil type/i }), {
      target: { value: 'SL' },
    });
    expect((getGuided().forms.vapor as unknown as { layers: Form[] }).layers[0]!['texture']).toBe(
      'SL',
    );
    const porosity = within(unsat).getByRole('textbox', { name: /^total porosity/i });
    expect(within(porosity.closest('label')!).getByText(/from the soil type/i)).toBeTruthy();
    const foc = within(unsat).getByRole('textbox', { name: /^organic carbon fraction/i });
    expect(within(foc.closest('label')!).getByText(/a default with no source/i)).toBeTruthy();
  });

  it('marks a value a chosen model needs but nobody entered, and counts what is left', () => {
    start((g) => {
      g.site.sources = ['groundwater'];
      g.site.paths.well = true;
    });
    render(<PropertiesStep />);
    const alpha = box(/^longitudinal dispersivity \(m\)/i);
    expect(within(alpha.closest('label')!).getByText(/needed/i)).toBeTruthy();
    const before = Number(/(\d+)/.exec(screen.getByRole('status').textContent ?? '')?.[1]);
    expect(before).toBeGreaterThan(0);
    type(/^longitudinal dispersivity \(m\)/i, '10');
    const after = Number(/(\d+)/.exec(screen.getByRole('status').textContent ?? '')?.[1]);
    expect(after).toBe(before - 1);
    expect(
      within(box(/^longitudinal dispersivity \(m\)/i).closest('label')!).getByText(
        /entered with no source/i,
      ),
    ).toBeTruthy();
  });

  it('gives each layer its own thickness box', () => {
    start((g) => {
      g.site.sources = ['soilAbove'];
      g.site.paths.leaching = true;
    });
    render(<PropertiesStep />);
    type(/^layer 2 above the source, thickness \(m\)/i, '0.5');
    const vadose = getGuided().forms.vadose as unknown as { above: Form[] };
    expect(vadose.above[1]!['thickness']).toBe('0.5');
    expect(vadose.above[0]!['thickness']).not.toBe('0.5');
  });

  it('says there is nothing to enter when no model runs', () => {
    start((g) => {
      g.site.basis = 'measured';
      g.site.measured = ['groundwater'];
    });
    render(<PropertiesStep />);
    expect(screen.getByText(/nothing to enter/i)).toBeTruthy();
    expect(screen.queryAllByRole('textbox')).toEqual([]);
  });
});
