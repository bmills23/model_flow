import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSaturatedFeed, setSaturatedFeed } from '../saturated/feed';
import { DEFAULT_FORM as SAT_FORM, toScenario as toSaturated } from '../saturated/form';
import { clearVadoseFeed, setVadoseFeed } from '../vadose/feed';
import { DEFAULT_FORM as VADOSE_FORM, toScenario as toVadose } from '../vadose/form';
import { getScreen, setScreen } from '../project/store';
import { clearBankFeed, getBankFeed } from './bankFeed';
import { clearTransportFeed, getTransportFeed } from './chainFeed';
import { clearWellFeed, getWellFeed } from './wellFeed';
import { clearWaterTableFeed, getWaterTableFeed } from '../vapor/feeds';
import { TransportPage } from './TransportPage';

const BENZENE = '71-43-2';
const TOLUENE = '108-88-3';
const original = getScreen('transport').form;

function setChemical(id: string): void {
  setScreen('transport', {
    ...getScreen('transport'),
    form: { ...getScreen('transport').form, chemicalId: id },
  });
}

beforeEach(() => setChemical(TOLUENE));
afterEach(() => {
  setScreen('transport', { ...getScreen('transport'), form: original });
  clearVadoseFeed();
  clearSaturatedFeed();
  clearWellFeed();
  clearTransportFeed();
  clearBankFeed();
  clearWaterTableFeed();
});

describe('TransportPage vadose and saturated feeds for another chemical', () => {
  it('refuses a vadose feed for another chemical: an error naming both, and no toggle', async () => {
    const v = toVadose(VADOSE_FORM);
    if (!v.ok) throw new Error('vadose scenario');
    render(<TransportPage />);
    act(() =>
      setVadoseFeed({
        scenario: v.scenario,
        method: 'legacy',
        label: 'Vadose run',
        chemicalId: BENZENE,
      }),
    );
    expect(screen.getByText(/vadose result is for .*, not /i)).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /feed the source from the vadose/i })).toBeNull();
  }, 60000);

  it('refuses a saturated feed for another chemical the same way', async () => {
    const s = toSaturated(SAT_FORM);
    if (!s.ok) throw new Error('saturated scenario');
    render(<TransportPage />);
    act(() =>
      setSaturatedFeed({
        input: s.scenario.input,
        method: 'legacy',
        label: 'Saturated run',
        chemicalId: BENZENE,
      }),
    );
    expect(screen.getByText(/saturated soil source result is for .*, not /i)).toBeTruthy();
    expect(
      screen.queryByRole('checkbox', { name: /feed the source from the saturated/i }),
    ).toBeNull();
  }, 60000);

  it('offers a vadose feed for the screen chemical', async () => {
    const v = toVadose(VADOSE_FORM);
    if (!v.ok) throw new Error('vadose scenario');
    render(<TransportPage />);
    act(() =>
      setVadoseFeed({
        scenario: v.scenario,
        method: 'legacy',
        label: 'Vadose run',
        chemicalId: TOLUENE,
      }),
    );
    expect(screen.getByRole('checkbox', { name: /feed the source from the vadose/i })).toBeTruthy();
    expect(screen.queryByText(/vadose result is for/i)).toBeNull();
  }, 60000);
});

describe('TransportPage senders tag their feeds with the screen chemical', () => {
  it('tags the well, chain, water table and bank feeds', async () => {
    setChemical(BENZENE);
    render(<TransportPage />);
    const well = await screen.findByRole(
      'button',
      { name: /use as exposure well concentration/i },
      { timeout: 30000 },
    );
    fireEvent.click(well);
    expect(getWellFeed()?.chemicalId).toBe(BENZENE);
    fireEvent.click(screen.getByRole('button', { name: /use as vapor groundwater source/i }));
    expect(getWaterTableFeed()?.chemicalId).toBe(BENZENE);
    fireEvent.click(screen.getByRole('button', { name: /use for cleanup levels/i }));
    expect(getTransportFeed()?.chemicalId).toBe(BENZENE);
    fireEvent.click(screen.getByRole('button', { name: /use as surface water source/i }));
    expect(getBankFeed()?.chemicalId).toBe(BENZENE);
  }, 60000);
});
