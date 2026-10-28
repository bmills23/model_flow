import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addChemical, forgetMemory, getGuided, setGuided } from '../../project/store';
import { DISPERSIVITY } from '../forms.testkit';
import { defaultGuided, type GuidedState } from '../state';
import { ResultsStep } from './ResultsStep';
import { TargetsStep } from './TargetsStep';

beforeEach(() => forgetMemory());
afterEach(() => {
  cleanup();
  forgetMemory();
});

const BENZENE = '71-43-2';
const MTBE = '1634-04-4';
const SLOW = { timeout: 30000 };

function measuredSite(patch?: (g: GuidedState) => void): void {
  addChemical({ id: BENZENE, name: 'Benzene' });
  addChemical({ id: MTBE, name: 'MTBE' });
  const g = defaultGuided();
  g.site = { ...g.site, basis: 'measured', measured: ['groundwater'] };
  g.sources[BENZENE] = { values: { groundwater: { value: '1', unit: 'mg/L' } }, note: '', tph: '' };
  g.sources[MTBE] = { values: { groundwater: { value: '3', unit: 'mg/L' } }, note: '', tph: '' };
  patch?.(g);
  setGuided(g);
}

function wellSite(patch?: (g: GuidedState) => void): void {
  addChemical({ id: BENZENE, name: 'Benzene' });
  addChemical({ id: MTBE, name: 'MTBE' });
  const g = defaultGuided();
  g.site = { ...g.site, sources: ['groundwater'], paths: { ...g.site.paths, well: true } };
  g.run = { timeYr: '32', stepYr: '1', sourceYr: '', basis: 'modern' };
  g.forms.transport = DISPERSIVITY;
  g.targets = { ...g.targets, mode: 'cleanup' };
  g.sources[BENZENE] = { values: { groundwater: { value: '2', unit: 'mg/L' } }, note: '', tph: '' };
  g.sources[MTBE] = { values: { groundwater: { value: '4', unit: 'mg/L' } }, note: '', tph: '' };
  patch?.(g);
  setGuided(g);
}

describe('ResultsStep, step 6', () => {
  it('asks for chemicals, then for a site model that works', () => {
    render(<ResultsStep />);
    expect(screen.getByText(/add at least one chemical/i)).toBeTruthy();
    cleanup();
    addChemical({ id: BENZENE, name: 'Benzene' });
    render(<ResultsStep />);
    expect(screen.getByText(/finish the site model/i)).toBeTruthy();
  });

  it('opens on the cancer risk table for a forward risk project and switches tables', async () => {
    measuredSite();
    render(<ResultsStep />);
    expect(screen.getByRole('heading', { level: 1, name: /results/i })).toBeTruthy();
    const risk = await screen.findByRole('table', { name: /cancer risk by chemical/i }, SLOW);
    expect(within(risk).getAllByText('Benzene').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: /hazard index/i }));
    expect(
      await screen.findByRole('table', { name: /hazard index by chemical/i }, SLOW),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /inputs and outputs/i }));
    const inputs = screen.getByRole('table', { name: /values you entered/i });
    expect(within(inputs).getByText('MTBE')).toBeTruthy();
  });

  it('offers a CSV for the table shown and a link to print the report', async () => {
    measuredSite();
    render(<ResultsStep />);
    await screen.findByRole('table', { name: /cancer risk by chemical/i }, SLOW);
    expect(screen.getAllByRole('button', { name: /download csv/i }).length).toBeGreaterThan(0);
    const link = screen.getByRole('link', { name: /print the report/i });
    expect(link.getAttribute('href')).toBe('#/report');
  });

  it('cleanup levels: the levels in the media contacted, legacy as a check', async () => {
    measuredSite((g) => {
      g.targets = { ...g.targets, mode: 'cleanup' };
    });
    render(<ResultsStep />);
    expect(
      await screen.findByRole('region', { name: /cleanup levels, modern/i }, SLOW),
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: /cleanup levels, legacy/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /download csv/i }).length).toBeGreaterThan(0);
  });

  it('shows the kept groundwater path levels, and points to step 5 while none are kept', async () => {
    wellSite();
    render(<ResultsStep />);
    const none = await screen.findByRole(
      'table',
      { name: /source levels through the groundwater path/i },
      SLOW,
    );
    expect(within(none).getAllByText(/not solved yet/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /step 5/i }).getAttribute('href')).toBe(
      '#/step/targets',
    );
    cleanup();
    render(<TargetsStep />);
    await waitFor(() => expect(Object.keys(getGuided().levels ?? {})).toHaveLength(2), SLOW);
    cleanup();
    render(<ResultsStep />);
    const kept = await screen.findByRole(
      'table',
      { name: /source levels through the groundwater path/i },
      SLOW,
    );
    expect(within(kept).getAllByText(/up to date/i).length).toBeGreaterThan(0);
    expect(within(kept).queryAllByText(/not solved yet/i)).toHaveLength(0);
  });

  it('a chemical not detected at the source is not quantified, with the reason', async () => {
    wellSite((g) => {
      g.targets.allocation = 'cumulative';
      g.sources[MTBE] = {
        values: { groundwater: { value: 'ND', unit: 'mg/L' } },
        note: '',
        tph: '',
      };
    });
    render(<TargetsStep />);
    await waitFor(() => expect(Object.keys(getGuided().levels ?? {})).toHaveLength(2), SLOW);
    cleanup();
    render(<ResultsStep />);
    expect(
      (await screen.findAllByText(/not detected at the source/i, {}, SLOW)).length,
    ).toBeGreaterThan(0);
  });

  it('the inputs and outputs summary names the models run and the state of each output', async () => {
    wellSite();
    render(<ResultsStep />);
    fireEvent.click(screen.getByRole('radio', { name: /inputs and outputs/i }));
    const outputs = await screen.findByRole(
      'table',
      { name: /what the step 3d run produced/i },
      SLOW,
    );
    expect(within(outputs).getAllByText(/not run/i).length).toBeGreaterThan(0);
  });
});
