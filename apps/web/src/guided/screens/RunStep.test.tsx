import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetGuidedRun } from '../runner';
import { defaultGuided } from '../state';
import { RunStep } from './RunStep';
import { addChemical, forgetMemory, getGuided, setGuided } from '../../project/store';
import { setDecimalComma } from '../../ui/decimalComma';

beforeEach(() => forgetMemory());
afterEach(() => {
  cleanup();
  setDecimalComma(false);
  resetGuidedRun();
  forgetMemory();
});

const BENZENE = '71-43-2';
const TOLUENE = '108-88-3';

/** Groundwater under an onsite building: one indoor air result per chemical, quick to run. */
function buildingSite(): void {
  addChemical({ id: BENZENE, name: 'Benzene' });
  addChemical({ id: TOLUENE, name: 'Toluene' });
  const g = defaultGuided();
  g.site = { ...g.site, sources: ['groundwater'], paths: { ...g.site.paths, building: true } };
  g.forms.vapor = { capHeight: '0.2', capPorosity: '0.35', capMoisture: '0.25' };
  for (const id of [BENZENE, TOLUENE]) {
    g.sources[id] = { values: { groundwater: { value: '1', unit: 'mg/L' } }, note: '', tph: '' };
  }
  setGuided(g);
}

/** The building site with no groundwater value for Benzene: its indoor air model cannot run. */
function failingSite(): void {
  buildingSite();
  const g = getGuided();
  setGuided({ ...g, sources: { ...g.sources, [BENZENE]: { values: {}, note: '', tph: '' } } });
}

const runButton = () => screen.getByRole('button', { name: /^run all chemicals/i });

describe('RunStep, 3d', () => {
  it('asks for chemicals, then for a site model that works', () => {
    render(<RunStep />);
    expect(screen.getByText(/add at least one chemical/i)).toBeTruthy();
    cleanup();
    addChemical({ id: BENZENE, name: 'Benzene' });
    render(<RunStep />);
    expect(screen.getByText(/finish the site model/i)).toBeTruthy();
  });

  it('shows the run settings, saves edits, and says the time step drives only the well curve', () => {
    buildingSite();
    render(<RunStep />);
    expect(screen.getByRole('heading', { level: 1, name: /run and view/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/simulation time/i), { target: { value: '50' } });
    expect(getGuided().run.timeYr).toBe('50');
    fireEvent.change(screen.getByLabelText(/time step/i), { target: { value: '2' } });
    expect(getGuided().run.stepYr).toBe('2');
    fireEvent.click(screen.getByRole('radio', { name: /legacy/i }));
    expect(getGuided().run.basis).toBe('legacy');
    expect(screen.getByText(/only the groundwater transport curve/i)).toBeTruthy();
    expect(screen.getByText(/keep their own time steps/i)).toBeTruthy();
  });

  it('honours the decimal comma setting and asks for a decimal keyboard', () => {
    buildingSite();
    setDecimalComma(true);
    render(<RunStep />);
    const time = screen.getByLabelText(/simulation time/i) as HTMLInputElement;
    expect(time.getAttribute('inputmode')).toBe('decimal');
    expect(
      (screen.getByLabelText(/time step/i) as HTMLInputElement).getAttribute('inputmode'),
    ).toBe('decimal');
    fireEvent.change(screen.getByLabelText(/time step/i), { target: { value: '0,5' } });
    expect(getGuided().run.stepYr).toBe('0.5');
    expect((screen.getByLabelText(/time step/i) as HTMLInputElement).value).toBe('0,5');
    fireEvent.change(screen.getByLabelText(/how long the source lasts/i), {
      target: { value: '1,5' },
    });
    expect(getGuided().run.sourceYr).toBe('1.5');
  });

  it('stops the Run with a message when the simulation time cannot be used', async () => {
    buildingSite();
    render(<RunStep />);
    await screen.findByText(/models are ready/i, undefined, { timeout: 20000 });
    for (const bad of ['', '0', '-3', 'abc']) {
      fireEvent.change(screen.getByLabelText(/simulation time/i), { target: { value: bad } });
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/simulation time must be a number/i);
      expect((runButton() as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.change(screen.getByLabelText(/simulation time/i), { target: { value: '30' } });
    expect(screen.queryByText(/simulation time must be a number/i)).toBeNull();
  });

  it('runs every chemical with one button, then shows indoor air, the input summary and the CSV', async () => {
    buildingSite();
    render(<RunStep />);
    await screen.findByText(/models are ready/i, undefined, { timeout: 20000 });
    fireEvent.click(runButton());
    const table = await screen.findByRole('table', { name: /indoor air/i }, { timeout: 60000 });
    expect(within(table).getByText('Benzene')).toBeTruthy();
    expect(within(table).getByText('Toluene')).toBeTruthy();
    expect(Object.keys(getGuided().outputs['vaporRisk'] ?? {}).sort()).toEqual(
      [TOLUENE, BENZENE].sort(),
    );
    expect(screen.getByRole('status').textContent).toMatch(/up to date/i);
    expect(screen.getByRole('heading', { name: /model input summary/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /download csv/i })).toBeTruthy();
    expect(screen.getByRole('group', { name: /^benzene$/i })).toBeTruthy();
  }, 90000);

  it('after an edit, says the results are out of date and names what changed', async () => {
    buildingSite();
    render(<RunStep />);
    await screen.findByText(/models are ready/i, undefined, { timeout: 20000 });
    fireEvent.click(runButton());
    await screen.findByRole('table', { name: /indoor air/i }, { timeout: 60000 });
    act(() => {
      const g = getGuided();
      setGuided({
        ...g,
        sources: {
          ...g.sources,
          [BENZENE]: {
            ...g.sources[BENZENE]!,
            values: { groundwater: { value: '3', unit: 'mg/L' } },
          },
        },
      });
    });
    await screen.findByText(/out of date/i, { selector: 'strong' });
    const note = screen.getByRole('status');
    expect(note.textContent).toMatch(/indoor air model \(Benzene\)/i);
    expect(note.textContent).not.toMatch(/Toluene/);
  }, 90000);

  it('names a model that will be skipped before the Run, and keeps the reasons when no model computed', async () => {
    addChemical({ id: BENZENE, name: 'Benzene' });
    const g = defaultGuided();
    g.site = { ...g.site, sources: ['groundwater'], paths: { ...g.site.paths, building: true } };
    g.forms.vapor = { capHeight: '0.2', capPorosity: '0.35', capMoisture: '0.25' };
    setGuided(g);
    render(<RunStep />);
    await screen.findByText(/some models will not run/i, undefined, { timeout: 20000 });
    expect(screen.getByText(/no usable groundwater concentration/i)).toBeTruthy();
    expect(screen.queryByText(/the models are ready to run/i)).toBeNull();
    fireEvent.click(runButton());
    await waitFor(
      () => expect(screen.getByRole('status').textContent).toMatch(/no model produced a result/i),
      { timeout: 30000 },
    );
    expect(screen.getByRole('status').textContent).not.toMatch(/not run yet/i);
    const reason = (): HTMLElement =>
      within(screen.getByRole('group', { name: /^benzene$/i })).getByText(
        /no usable groundwater concentration/i,
      );
    expect(reason()).toBeTruthy();
    // leaving the step and coming back, or reloading the project, keeps the reason
    cleanup();
    render(<RunStep />);
    await screen.findByRole('group', { name: /^benzene$/i }, { timeout: 20000 });
    expect(reason()).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/no model produced a result/i);
  }, 90000);

  it('keeps running when the screen is left, and writes the outputs when it finishes', async () => {
    buildingSite();
    render(<RunStep />);
    await screen.findByText(/models are ready/i, undefined, { timeout: 20000 });
    fireEvent.click(runButton());
    cleanup();
    await waitFor(
      () =>
        expect(Object.keys(getGuided().outputs['vaporRisk'] ?? {}).sort()).toEqual(
          [TOLUENE, BENZENE].sort(),
        ),
      { timeout: 60000 },
    );
    render(<RunStep />);
    await screen.findByText(/up to date/i, undefined, { timeout: 20000 });
  }, 90000);

  it('shows the step the curve really used when it was coarsened to 500 points', async () => {
    failingSite();
    const g = getGuided();
    setGuided({ ...g, run: { ...g.run, timeYr: '30', stepYr: '0.01' } });
    render(<RunStep />);
    await screen.findByText(/models are ready|some models will not run/i, undefined, {
      timeout: 20000,
    });
    fireEvent.click(runButton());
    const row = await screen.findByRole('row', { name: /time step/i }, { timeout: 30000 });
    expect(row.textContent).toMatch(/0\.06 years/);
    expect(row.textContent).toMatch(/500 points/);
    expect(row.textContent).toMatch(/0\.01/);
  }, 90000);

  it('does not call saved results up to date while the chemical files are still loading', () => {
    buildingSite();
    const g = getGuided();
    setGuided({
      ...g,
      outputs: { vaporRisk: { [BENZENE]: { inputsHash: 'old00001', value: {} } } },
    });
    render(<RunStep />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).not.toMatch(/^up to date/i);
    expect(text).toMatch(/checking/i);
  });
});
