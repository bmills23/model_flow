import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearWellFeed, setWellFeed } from '../transport/wellFeed';
import { clearVaporRiskFeed, setVaporRiskFeed } from '../vapor/feeds';
import { forgetMemory, getScreen, setScreen } from '../project/store';
import { RiskPage } from './RiskPage';

afterEach(() => {
  clearWellFeed();
  clearVaporRiskFeed();
  forgetMemory();
});

const MARK = 'Out of date';

describe('exposure and risk stale marks', () => {
  it('marks the well and vapor feed labels on a chemical card only while the feed is stale', async () => {
    const YR = 365 * 86400;
    setWellFeed({
      method: 'modern',
      label: 'Receptor well, modern method',
      times: [0, 10 * YR, 20 * YR],
      values: [0, 1e-6, 4e-6],
    });
    const epc = { kind: 'constant' as const, value: 1e-6, origin: 'vapor.je-1991' };
    // the vapor screen is on benzene, as when this result was sent (a slot is checked while its
    // screen is on the slot's chemical)
    const v0 = getScreen('vapor');
    setScreen('vapor', { ...v0, form: { ...v0.form, chemicalId: '71-43-2' } });
    setVaporRiskFeed({
      chemicalId: '71-43-2',
      label: 'Vapor run, legacy',
      indoor: epc,
      outdoor: epc,
      coefficients: {},
    });
    render(<RiskPage />);
    await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
    fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: '71-43-2' } });
    fireEvent.click(await screen.findByRole('button', { name: /add benzene/i }));
    const card = screen.getByRole('group', { name: /benzene/i });
    fireEvent.click(within(card).getByRole('checkbox', { name: /transport well result/i }));
    fireEvent.click(within(card).getByRole('checkbox', { name: /vapor screen indoor air/i }));
    await screen.findByRole('table', { name: /exposure point concentrations/i });
    expect(within(card).getByText(/receptor well, modern method/i)).toBeTruthy();
    expect(within(card).queryByText(MARK)).toBeNull();

    const t = getScreen('transport');
    act(() => setScreen('transport', { ...t, form: { ...t.form, K: '99' } }));
    const wellNote = within(card).getByText(/groundwater concentration: receptor well/i);
    expect(within(wellNote).getByText(MARK)).toBeTruthy();
    expect(within(wellNote).getByText(/send again from transport/i)).toBeTruthy();
    // the vapor label is still current
    const vaporNote = within(card).getByText(/indoor air concentration: vapor run/i);
    expect(within(vaporNote).queryByText(MARK)).toBeNull();
    // the value stays on screen
    expect(within(card).getByText(/receptor well, modern method/i)).toBeTruthy();

    const v = getScreen('vapor');
    act(() => setScreen('vapor', { ...v, form: { ...v.form, H: '9.9' } }));
    expect(within(vaporNote).getByText(MARK)).toBeTruthy();
    // the results say so too, and the CSV note names the values
    expect(screen.getByRole('note').textContent).toMatch(/Receptor well concentration/);
    expect(screen.getByRole('note').textContent).toMatch(/Vapor air concentrations/);
  }, 30000);
});
