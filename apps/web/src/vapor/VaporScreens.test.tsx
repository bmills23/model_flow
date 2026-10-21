import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isFeedStaleNow } from '../project/store';
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
    await screen.findByRole('option', { name: /benzene \(71-43-2\)/i });
    fireEvent.change(screen.getByRole('combobox', { name: /^chemical/i }), {
      target: { value: '71-43-2' },
    });
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

describe('sent vapor run after an edit', () => {
  const sendBenzene = async () => {
    render(<VaporPage />);
    await screen.findByRole('option', { name: /benzene \(71-43-2\)/i });
    fireEvent.change(screen.getByRole('combobox', { name: /^chemical/i }), {
      target: { value: '71-43-2' },
    });
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
