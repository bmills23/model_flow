import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CleanupPage } from './CleanupPage';
import { clearHouseholdFeed, setHouseholdFeed } from '../household/feeds';
import { clearVaporRiskFeed, setVaporRiskFeed } from '../vapor/feeds';
import { clearProduceFeed, clearTphFeed, setProduceFeed, setTphFeed } from '../plantsEco/feeds';
import { forgetMemory, getChemicals, getScreen, setScreen } from '../project/store';
import { clearSurfaceWaterFeed, setSurfaceWaterFeed } from '../surfaceWater/feed';
import { clearTransportFeed, setTransportFeed } from '../transport/chainFeed';
import { DEFAULT_FORM, toScenario } from '../transport/form';

afterEach(() => {
  clearHouseholdFeed();
  clearVaporRiskFeed();
  clearSurfaceWaterFeed();
  clearProduceFeed();
  clearTphFeed();
  clearTransportFeed();
  forgetMemory();
});

const MARK = 'Out of date';

async function withBenzene() {
  render(<CleanupPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
  // a screen set to benzene put it on the project list, so the page already holds its row
  if (!getChemicals().some((c) => c.id === '71-43-2')) {
    fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: '71-43-2' } });
    fireEvent.click(await screen.findByRole('button', { name: /add benzene/i }));
  }
  await screen.findByRole('group', { name: /benzene/i });
}

function edit(screenKey: 'household' | 'vapor' | 'surfaceWater' | 'plantsEco' | 'transport') {
  act(() => {
    if (screenKey === 'household') {
      const s = getScreen('household');
      setScreen('household', { form: { ...s.form, waterConcentration: '9' } });
    } else if (screenKey === 'vapor') {
      const s = getScreen('vapor');
      setScreen('vapor', { ...s, form: { ...s.form, H: '9.9' } });
    } else if (screenKey === 'surfaceWater') {
      const s = getScreen('surfaceWater');
      setScreen('surfaceWater', { form: { ...s.form, upstreamFlow: '123456' } });
    } else if (screenKey === 'plantsEco') {
      const s = getScreen('plantsEco');
      setScreen('plantsEco', { form: { ...s.form, soilConcentration: '77' } });
    } else {
      const s = getScreen('transport');
      setScreen('transport', { ...s, form: { ...s.form, K: '99' } });
    }
  });
}

describe('cleanup stale marks', () => {
  it('marks each source level panel, the produce choice and the TPH panel only while its feed is stale', async () => {
    const epc = { kind: 'constant' as const, value: 1e-6, origin: 'vapor.je-1991' };
    // the sending screens are on benzene, as when these results were sent (a slot is checked while
    // its screen is on the slot's chemical)
    for (const key of ['household', 'vapor', 'plantsEco'] as const) {
      const s = getScreen(key);
      setScreen(key, { ...s, form: { ...s.form, chemicalId: '71-43-2' } } as never);
    }
    setHouseholdFeed({
      chemicalId: '71-43-2',
      label: 'Benzene, household run',
      coefficients: { bathroomAir: 0.002 },
      methods: {},
    });
    setVaporRiskFeed({
      chemicalId: '71-43-2',
      label: 'Benzene, vapor run',
      indoor: epc,
      outdoor: epc,
      coefficients: {
        indoor: { quantified: true, methodId: 'vapor.je-1991', value: 2e-4, source: 'groundwater' },
        outdoor: { quantified: false, methodId: 'outdoorAir.box', reason: 'no source series' },
      },
    });
    setSurfaceWaterFeed({
      method: 'mass-discharge',
      origin: 'surfaceWater.mass-discharge',
      label: 'Modern mass-discharge surface water, 10.0 years',
      times: [1],
      values: [1e-6],
      coefficient: {
        value: 0.04,
        reason: null,
        method: 'surfaceWater.mass-discharge',
        sourceMedium: 'groundwater',
        sourceUnit: 'mg/L',
      },
    });
    setProduceFeed({
      chemicalId: '71-43-2',
      label: 'Benzene, plantUptake.hhrap-2005',
      method: 'plantUptake.hhrap-2005',
      factors: { root: 0.02, abovegroundExposed: 0.05 },
      intakes: {
        root: { gPerKgDay: 1.5, fractionHomegrown: 0.4 },
        abovegroundExposed: { gPerKgDay: 1, fractionHomegrown: 0.4 },
      },
      intakeLabel: 'user entered',
    });
    setTphFeed({
      methodId: 'tph.madep',
      label: 'Total TPH, tph.madep',
      targetHazardIndex: 1,
      totalMgPerKg: 333.333,
      fractions: [],
      unmapped: [],
      warnings: [],
    });
    await withBenzene();
    const household = await screen.findByRole('region', { name: /household source levels/i });
    const vapor = screen.getByRole('region', { name: /vapor source levels/i });
    const surface = screen.getByRole('region', { name: /surface water source levels/i });
    const tph = screen.getByRole('region', { name: /total tph level/i });
    const card = screen.getByRole('group', { name: /benzene/i });
    fireEvent.click(
      within(card).getByRole('checkbox', { name: /plant factors for homegrown produce/i }),
    );

    // fresh: no mark on any panel and no note beside the downloads
    for (const region of [household, vapor, surface, tph, card]) {
      expect(within(region).queryByText(MARK)).toBeNull();
    }
    expect(screen.queryByRole('note')).toBeNull();

    edit('household');
    expect(within(household).getByText(MARK)).toBeTruthy();
    expect(within(household).getByText(/send again from household/i)).toBeTruthy();
    expect(within(vapor).queryByText(MARK)).toBeNull();
    expect(within(surface).queryByText(MARK)).toBeNull();
    expect(screen.getByRole('note').textContent).toMatch(
      // the note names the chemical of the stale slot
      /Household exposure values for 71-43-2 \(Household\)/,
    );

    edit('vapor');
    expect(within(vapor).getByText(MARK)).toBeTruthy();
    expect(within(surface).queryByText(MARK)).toBeNull();

    edit('surfaceWater');
    expect(within(surface).getByText(MARK)).toBeTruthy();

    expect(within(tph).queryByText(MARK)).toBeNull();
    edit('plantsEco');
    expect(within(tph).getByText(MARK)).toBeTruthy();
    expect(within(card).getByText(MARK)).toBeTruthy();
    // the values stay on screen with the mark
    expect(within(tph).getByText('333')).toBeTruthy();
    expect(within(household).getAllByText(/tap water \(shower air\)/i).length).toBeGreaterThan(0);
  }, 60000);

  it('marks the aquifer run a modeled source is solved through', async () => {
    const r = toScenario(DEFAULT_FORM);
    if (!r.ok) throw new Error('transport scenario');
    setTransportFeed({ scenario: r.scenario, label: 'Test aquifer' });
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    const hint = await screen.findByText(/aquifer and well: test aquifer/i);
    expect(within(hint.closest('p')!).queryByText(MARK)).toBeNull();
    edit('transport');
    expect(within(hint.closest('p')!).getByText(MARK)).toBeTruthy();
    expect(within(hint.closest('p')!).getByText(/send again from transport/i)).toBeTruthy();
  }, 60000);
});
