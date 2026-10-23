import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { addChemical } from '../project/store';
import { clearVaporRiskFeed, getVaporRiskFeed } from './feeds';
import { VaporPage } from './VaporPage';
import { fromProject, toProject } from './project';
import { DEFAULT_FORM, RISC4_BENZENE_ID } from './form';

afterEach(() => clearVaporRiskFeed());

const chooseOxygenLimited = (): void => {
  fireEvent.click(screen.getByLabelText(/oxygen-limited \(devaull\)/i));
};

/** Fills the required oxygen properties (test values; the screen ships none). */
const enterOxygenProperties = (): void => {
  fireEvent.change(screen.getByLabelText(/^oxygen diffusion in air/i), {
    target: { value: '0.18' },
  });
  fireEvent.change(screen.getByLabelText(/^oxygen diffusion in water/i), {
    target: { value: '2.1e-5' },
  });
  fireEvent.change(screen.getByLabelText(/^oxygen henry/i), { target: { value: '32' } });
};

describe('oxygen-limited method on the vapor screen', () => {
  it('is not run until it is chosen', () => {
    render(<VaporPage />);
    expect(screen.queryByRole('region', { name: /oxygen-limited details/i })).toBeNull();
    const cmp = screen.getByRole('region', { name: /method comparison/i });
    expect(within(cmp).queryByRole('columnheader', { name: /oxygen-limited/i })).toBeNull();
  });

  it('adds a column, the details, a profile curve and the input group once chosen', () => {
    render(<VaporPage />);
    chooseOxygenLimited();
    const cmp = screen.getByRole('region', { name: /method comparison/i });
    expect(within(cmp).getByRole('columnheader', { name: /oxygen-limited/i })).toBeTruthy();
    expect(within(cmp).getByRole('rowheader', { name: /aerobic layer thickness/i })).toBeTruthy();
    const details = screen.getByRole('region', { name: /oxygen-limited details/i });
    expect(within(details).getByText(/aerobic layer option/i)).toBeTruthy();
    expect(within(details).getByText(/aerobic depth entered/i)).toBeTruthy();
    const profile = screen.getByRole('region', { name: /vapor profile/i });
    expect(within(profile).getAllByText(/devaull oxygen-limited/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^aerobic layer depth/i)).toBeTruthy();
  });

  it('says why the two oxygen options cannot run until the oxygen properties are entered', () => {
    render(<VaporPage />);
    chooseOxygenLimited();
    fireEvent.click(screen.getByLabelText(/coupled oxygen balance/i));
    expect(screen.getByText(/oxygen-limited \(devaull\) did not run/i)).toBeTruthy();
    expect(screen.getAllByText(/oxygen diffusion in air must be a number/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole('region', { name: /oxygen-limited details/i })).toBeNull();
    // the other two methods still run
    const cmp = screen.getByRole('region', { name: /method comparison/i });
    expect(within(cmp).getAllByText(/\d/).length).toBeGreaterThan(5);
    enterOxygenProperties();
    expect(screen.getByRole('region', { name: /oxygen-limited details/i })).toBeTruthy();
  });

  it('lists the engine warnings of the method', () => {
    render(<VaporPage />);
    chooseOxygenLimited();
    fireEvent.click(screen.getByLabelText(/fast reaction front/i));
    enterOxygenProperties();
    const w = screen.getByRole('region', { name: /warnings/i });
    expect(within(w).getByText(/vapor\.oxygen-demand-incomplete/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^total hydrocarbon vapor/i), {
      target: { value: '50000' },
    });
    expect(within(w).queryByText(/vapor\.oxygen-demand-incomplete/)).toBeNull();
  });

  it('offers the oxygen details in the CSV downloads', () => {
    render(<VaporPage />);
    chooseOxygenLimited();
    const names = screen
      .getAllByRole('button', { name: /download csv/i })
      .map((b) => b.textContent);
    expect(names.some((n) => /oxygen-limited details/i.test(n ?? ''))).toBe(true);
  });

  it('the group opens a way to choose the method', () => {
    render(<VaporPage />);
    fireEvent.click(screen.getByRole('button', { name: /show the oxygen-limited results/i }));
    expect(screen.getByRole('region', { name: /oxygen-limited details/i })).toBeTruthy();
  });

  it('sends its indoor air, tagged with the method and the chemical, and its coefficient', async () => {
    render(<VaporPage />);
    act(() => addChemical({ id: '71-43-2', name: 'Benzene' }));
    fireEvent.click(screen.getByRole('button', { name: /pick a project chemical/i }));
    fireEvent.change(screen.getByLabelText(/^chemical$/i), { target: { value: '71-43-2' } });
    await waitFor(() =>
      expect((screen.getByLabelText(/^molar mass/i) as HTMLInputElement).value).not.toBe('78'),
    );
    await act(async () => {});
    // the class rate and mass ratio come from the database row
    expect((screen.getByLabelText(/^aerobic first-order rate/i) as HTMLInputElement).value).toBe(
      '0.73',
    );
    chooseOxygenLimited();
    const risk = screen.getByRole('region', { name: /exposure and risk/i });
    expect(risk.textContent).toMatch(/oxygen-limited/i);
    fireEvent.click(within(risk).getByRole('button', { name: /send to exposure and risk/i }));
    const feed = getVaporRiskFeed();
    expect(feed?.chemicalId).toBe('71-43-2');
    expect(feed?.indoor?.origin).toBe('vapor.devaull-2007');
    expect(feed?.outdoor).toBeUndefined();
    const ind = feed?.coefficients?.indoor;
    expect(ind?.quantified && ind.methodId).toBe('vapor.devaull-2007');
    expect(feed?.coefficients?.outdoor).toBeUndefined();
  }, 30000);

  it('does not send an indoor air it could not compute, and says why', async () => {
    render(<VaporPage />);
    act(() => addChemical({ id: '71-43-2', name: 'Benzene' }));
    fireEvent.click(screen.getByRole('button', { name: /pick a project chemical/i }));
    fireEvent.change(screen.getByLabelText(/^chemical$/i), { target: { value: '71-43-2' } });
    await waitFor(() =>
      expect((screen.getByLabelText(/^molar mass/i) as HTMLInputElement).value).not.toBe('78'),
    );
    await act(async () => {});
    chooseOxygenLimited();
    fireEvent.click(screen.getByLabelText(/coupled oxygen balance/i));
    const risk = screen.getByRole('region', { name: /exposure and risk/i });
    expect(risk.textContent).toMatch(/did not run: .*oxygen diffusion in air/i);
    fireEvent.click(within(risk).getByRole('button', { name: /send to exposure and risk/i }));
    expect(getVaporRiskFeed()).toBeNull();
  }, 30000);
});

describe('oxygen-limited method in the project file', () => {
  it('round trips every input it adds', () => {
    const form = {
      ...DEFAULT_FORM,
      method: 'devaull' as const,
      dvKw: '11',
      dvOxMode: 'coupled' as const,
      dvAerobicDepth: '0.5',
      dvO2Percent: '18',
      dvMassRatio: '3.5',
      dvDa: '0.18',
      dvDw: '2e-5',
      dvH: '30',
      dvRespiration: false,
      dvTotalHc: '1e4',
    };
    const state = fromProject(
      toProject({
        form,
        outdoor: fromProject(undefined).outdoor,
        af: fromProject(undefined).af,
        pvi: fromProject(undefined).pvi,
        choice: 'entered',
      }),
    );
    expect(state.form).toEqual(form);
  });

  it('opens a file saved before it existed with the defaults, blank rates for another chemical', () => {
    const old = { form: { chemicalId: '108-88-3', method: 'modern' as const } };
    const a = fromProject(old as never).form;
    expect(a.method).toBe('modern');
    expect(a.dvOxMode).toBe('entered');
    expect(a.dvKw).toBe('');
    expect(a.dvMassRatio).toBe('');
    const b = fromProject({ form: { chemicalId: RISC4_BENZENE_ID } } as never).form;
    expect(b.dvKw).toBe('0.73');
    expect(fromProject(undefined).form.dvKw).toBe('0.73');
  });
});
