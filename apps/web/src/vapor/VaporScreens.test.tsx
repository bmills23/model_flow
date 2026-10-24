import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { addChemical, isFeedStaleNow } from '../project/store';
import { VaporPage } from './VaporPage';
import {
  clearSaturatedVaporFeed,
  clearVadoseVaporFeed,
  clearVaporRiskFeed,
  clearWaterTableFeed,
  getVaporRiskFeed,
  setSaturatedVaporFeed,
  setWaterTableFeed,
} from './feeds';

const YR = 365.25 * 86400;

/** Picks a chemical from the project list; the properties fill once the vapor database has loaded. */
async function pickProjectChemical(id: string, name: string): Promise<void> {
  act(() => addChemical({ id, name }));
  const toList = screen.queryByRole('button', { name: /pick a project chemical/i });
  if (toList) fireEvent.click(toList);
  fireEvent.change(screen.getByLabelText(/^chemical$/i), { target: { value: id } });
  await waitFor(() =>
    expect((screen.getByLabelText(/^molar mass/i) as HTMLInputElement).value).not.toBe('78'),
  );
  // waitFor can pass between a commit and its passive effects; the effect that writes the form to the
  // project store must have run, or a send records the stale-mark fingerprint from the previous form
  await act(async () => {});
}

afterEach(() => {
  clearVadoseVaporFeed();
  clearWaterTableFeed();
  clearSaturatedVaporFeed();
  clearVaporRiskFeed();
});

describe('vapor profile plot', () => {
  it('plots the vapor profile of both methods with the strata as bands and a data table', () => {
    render(<VaporPage />);
    const region = screen.getByRole('region', { name: /vapor profile/i });
    expect(
      within(region).getByText(/vapor concentration against height above the source/i),
    ).toBeTruthy();
    expect(within(region).getByRole('img', { name: /vapor concentration/i })).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: /show data table/i }));
    const table = within(region).getByRole('table');
    // the profile runs from the source (0 m) to the base of the foundation (2.80 m)
    expect(within(table).getAllByText('0.00').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('2.80').length).toBeGreaterThan(0);
  });
});

describe('outdoor air', () => {
  it('gives the legacy box and the soil screening volatilization factor for a soil source', () => {
    render(<VaporPage />);
    const region = screen.getByRole('region', { name: /outdoor air/i });
    expect(within(region).getByText(/legacy box/i)).toBeTruthy();
    expect(within(region).getByRole('rowheader', { name: /volatilization factor/i })).toBeTruthy();
    expect(within(region).getAllByText(/mg\/m3/).length).toBeGreaterThan(0);
  });

  it('says the factor needs a soil source', () => {
    render(<VaporPage />);
    fireEvent.click(screen.getByLabelText(/^soil gas$/i));
    const region = screen.getByRole('region', { name: /outdoor air/i });
    expect(within(region).getByText(/applies to a soil source/i)).toBeTruthy();
  });
});

describe('attenuation factor', () => {
  it('is not offered for a soil source and applies the 0.001 factor to groundwater', () => {
    render(<VaporPage />);
    const region = screen.getByRole('region', { name: /attenuation factor/i });
    expect(within(region).getByText(/has no generic factor/i)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/^groundwater$/i));
    expect(within(region).getAllByText(/0\.001/).length).toBeGreaterThan(0);
    expect(within(region).getByText(/indoor air from the factor/i)).toBeTruthy();
  });
});

describe('petroleum vapor screen', () => {
  it('shows the verdict and why for an LNAPL source and for a dissolved one', () => {
    render(<VaporPage />);
    const region = screen.getByRole('region', { name: /petroleum vapor screen/i });
    fireEvent.change(within(region).getByLabelText(/^groundwater benzene/i), {
      target: { value: '6' },
    });
    expect(within(region).getByText(/further assessment/i)).toBeTruthy();
    expect(within(region).getByText(/groundwater benzene/i, { selector: 'li' })).toBeTruthy();
    expect(within(region).getByRole('status').textContent).toMatch(/15 ft recommended/);
    fireEvent.change(within(region).getByLabelText(/^groundwater benzene/i), {
      target: { value: '1' },
    });
    expect(within(region).getByText(/screened out/i)).toBeTruthy();
  });

  it('prints no verdict while the concentrations are blank and says what is missing', () => {
    render(<VaporPage />);
    const region = screen.getByRole('region', { name: /petroleum vapor screen/i });
    expect(within(region).queryByText(/screened out/i)).toBeNull();
    expect(within(region).queryByText(/further assessment needed/i)).toBeNull();
    expect(within(region).getByText(/no verdict/i).textContent).toMatch(/groundwater benzene/i);
  });

  it('lists a precluding factor', () => {
    render(<VaporPage />);
    const region = screen.getByRole('region', { name: /petroleum vapor screen/i });
    fireEvent.change(within(region).getByLabelText(/^groundwater benzene/i), {
      target: { value: '1' },
    });
    fireEvent.click(within(region).getByLabelText(/preferential pathways/i));
    expect(within(region).getByText(/further assessment/i)).toBeTruthy();
    expect(within(region).getByText(/preferential-pathways/)).toBeTruthy();
  });
});

describe('source from another screen', () => {
  const waterTable = {
    kind: 'groundwater' as const,
    label: 'Water table under the building, modern',
    series: { times: [0, 5 * YR, 10 * YR], values: [2e-3, 1e-3, 2e-4] },
  };

  it('does not offer a source until another screen holds one', () => {
    render(<VaporPage />);
    const region = screen.getByRole('region', { name: /source from another screen/i });
    expect(within(region).getByText(/no other screen has offered a source/i)).toBeTruthy();
  });

  it('runs the legacy method on a water-table series and sends it to exposure and risk', async () => {
    render(<VaporPage />);
    act(() => setWaterTableFeed(waterTable));
    const region = screen.getByRole('region', { name: /source from another screen/i });
    fireEvent.click(within(region).getByLabelText(/water table under the building/i));
    const table = within(region).getByRole('table', { name: /indoor air over time/i });
    expect(within(table).getAllByRole('row').length).toBe(4);

    const risk = screen.getByRole('region', { name: /exposure and risk/i });
    // the Table R-3 test chemical is not in the chemical database, so it cannot be sent
    expect(within(risk).getByRole('button', { name: /send to exposure and risk/i })).toHaveProperty(
      'disabled',
      true,
    );
    await pickProjectChemical('71-43-2', 'Benzene');
    fireEvent.click(within(risk).getByRole('button', { name: /send to exposure and risk/i }));
    const feed = getVaporRiskFeed();
    expect(feed?.chemicalId).toBe('71-43-2');
    expect(feed?.indoor?.kind).toBe('series');
    expect(feed?.indoor?.origin).toBe('vapor.je-1991');
    expect(feed?.outdoor?.origin).toBe('outdoorAir.box');
    // the air-over-source coefficients ride with the air for the cleanup screen's source levels
    const ind = feed?.coefficients?.indoor;
    expect(ind?.quantified && ind.methodId).toBe('vapor.je-1991');
    expect(ind?.quantified && ind.source).toBe('groundwater');
    expect(feed?.coefficients?.outdoor?.methodId).toBe('outdoorAir.box');
    // the inputs the run used ride with the air: the fed source, the method, the building and the outdoor box
    const row = (label: string) => feed?.runInputs?.find((r) => r.label === label)?.value;
    expect(row('Source')).toBe(
      "fed by another screen's result (Water table under the building, modern)",
    );
    expect(row('Indoor air method')).toBe('Legacy Johnson and Ettinger');
    expect(row('Floor area')).toBe('150 m2');
    expect(row('Outdoor wind speed')).toBe('2.25 m/s');
  }, 30000);

  it('uses a single saturated region 1 value as a constant', () => {
    render(<VaporPage />);
    act(() =>
      setSaturatedVaporFeed({ kind: 'poreWater', label: 'Hand case A, legacy', constant: 2e-4 }),
    );
    const region = screen.getByRole('region', { name: /source from another screen/i });
    fireEvent.click(within(region).getByLabelText(/hand case a, legacy/i));
    expect(within(region).getByText(/one value/i)).toBeTruthy();
  });
});

describe('source for another chemical', () => {
  const tagged = (chemicalId: string) => ({
    kind: 'groundwater' as const,
    label: 'Water table under the building, modern',
    series: { times: [0, 5 * YR, 10 * YR], values: [2e-3, 1e-3, 2e-4] },
    chemicalId,
  });

  it('refuses a water table series for benzene on a toluene screen and offers nothing to send', async () => {
    render(<VaporPage />);
    await pickProjectChemical('108-88-3', 'Toluene');
    act(() => setWaterTableFeed(tagged('71-43-2')));
    const region = screen.getByRole('region', { name: /source from another screen/i });
    expect(within(region).getByRole('alert').textContent).toMatch(/is for .*, not /i);
    expect(within(region).queryByLabelText(/water table under the building/i)).toBeNull();
    expect(within(region).queryByRole('table', { name: /indoor air over time/i })).toBeNull();
  }, 30000);

  it('takes the same series on a benzene screen', async () => {
    render(<VaporPage />);
    await pickProjectChemical('71-43-2', 'Benzene');
    act(() => setWaterTableFeed(tagged('71-43-2')));
    const region = screen.getByRole('region', { name: /source from another screen/i });
    expect(within(region).queryByRole('alert')).toBeNull();
    expect(within(region).getByLabelText(/water table under the building/i)).toBeTruthy();
  }, 30000);
});

describe('sent vapor run after an edit', () => {
  const sendBenzene = async () => {
    render(<VaporPage />);
    await pickProjectChemical('71-43-2', 'Benzene');
    const risk = screen.getByRole('region', { name: /exposure and risk/i });
    return { send: within(risk).getByRole('button', { name: /send to exposure and risk/i }) };
  };

  it('keeps the sent run and marks it stale when an input it depends on changes', async () => {
    const { send } = await sendBenzene();
    fireEvent.click(send);
    const sent = getVaporRiskFeed();
    expect(sent?.coefficients?.indoor).toBeTruthy();
    expect(isFeedStaleNow('vaporRisk')).toBe(false);
    fireEvent.change(screen.getByLabelText(/^air exchange rate/i), { target: { value: '2.5' } });
    await waitFor(() => expect(isFeedStaleNow('vaporRisk')).toBe(true));
    // the values stay on the feed, untouched: the shared mark is what says they are out of date
    expect(getVaporRiskFeed()).toBe(sent);
    fireEvent.click(send);
    expect(getVaporRiskFeed()?.coefficients?.indoor).toBeTruthy();
    expect(isFeedStaleNow('vaporRisk')).toBe(false);
  }, 30000);

  it('does not send while the form is invalid', async () => {
    const { send } = await sendBenzene();
    expect(send).toHaveProperty('disabled', false);
    fireEvent.change(screen.getByLabelText(/^henry's constant/i), { target: { value: '' } });
    expect(send).toHaveProperty('disabled', true);
    fireEvent.click(send);
    expect(getVaporRiskFeed()).toBeNull();
  }, 30000);
});

describe('chemical from the project list', () => {
  it('opens on the Table R-3 benzene fixture beside the list and can switch to the list', () => {
    act(() => addChemical({ id: '71-43-2', name: 'Benzene' }));
    render(<VaporPage />);
    expect(screen.getByText(/using the table r-3 benzene test values/i)).toBeTruthy();
    expect(screen.queryByLabelText(/^chemical$/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /pick a project chemical/i }));
    expect(screen.getByLabelText(/^chemical$/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /use the table r-3 benzene test values/i }));
    expect(screen.getByText(/using the table r-3 benzene test values/i)).toBeTruthy();
  });

  it('offers only the project chemicals, named as the list names them', async () => {
    render(<VaporPage />);
    act(() => addChemical({ id: '108-88-3', name: 'Toluene' }));
    fireEvent.click(screen.getByRole('button', { name: /pick a project chemical/i }));
    expect(screen.getByRole('option', { name: 'Toluene' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /benzene/i })).toBeNull();
  });

  it('says a list chemical with no vapor properties is unavailable, and does not send it', async () => {
    render(<VaporPage />);
    act(() => addChemical({ id: 'user-x', name: 'Own compound' }));
    fireEvent.click(screen.getByRole('button', { name: /pick a project chemical/i }));
    fireEvent.change(screen.getByLabelText(/^chemical$/i), { target: { value: 'user-x' } });
    await screen.findByText(/has no vapor properties in the chemical database/i);
    const risk = screen.getByRole('region', { name: /exposure and risk/i });
    expect(within(risk).getByRole('button', { name: /send to exposure and risk/i })).toHaveProperty(
      'disabled',
      true,
    );
  }, 30000);
});
