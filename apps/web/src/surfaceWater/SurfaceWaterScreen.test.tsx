import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearBankFeed, setBankFeed } from '../transport/bankFeed';
import { toScenario } from '../transport/form';
import { addChemical, getScreen, isFeedStaleNow, setScreen } from '../project/store';
import { clearSurfaceWaterFeed, getSurfaceWaterFeed, getSurfaceWaterFeedSlots } from './feed';
import { SurfaceWaterScreen } from './SurfaceWaterScreen';
import { REGRESSION_FORM as TRANSPORT_FORM } from '../transport/regression.testkit';

afterEach(() => {
  clearBankFeed();
  clearSurfaceWaterFeed();
  cleanup();
  setScreen('surfaceWater', { form: getScreen('surfaceWater').form });
});

async function loaded() {
  render(<SurfaceWaterScreen />);
  await screen.findByRole(
    'img',
    { name: /surface water concentration in mg\/L/i },
    { timeout: 15000 },
  );
}

describe('SurfaceWaterScreen', () => {
  it('opens on the Table R-8 river case and shows 2.91 mg/L and 2.95 mg/kg', async () => {
    await loaded();
    expect(
      screen.getByRole('heading', { level: 1, name: /surface water and sediment/i }),
    ).toBeTruthy();
    const readouts = screen.getByRole('region', { name: /at the end of the run/i });
    expect(within(readouts).getAllByText(/^2\.91 mg\/L$/).length).toBe(2);
    expect(within(readouts).getAllByText(/2\.95 mg\/kg/).length).toBeGreaterThan(0);
    const check = screen.getByRole('region', { name: /comparison with the published values/i });
    expect(within(check).getAllByText(/within tolerance/i).length).toBe(3);
  }, 20000);

  it('loads the lake case and shows 3.93 mg/L', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /table r-8 lake case/i }));
    const readouts = screen.getByRole('region', { name: /at the end of the run/i });
    await within(readouts).findAllByText(/^3\.93 mg\/L$/, undefined, { timeout: 15000 });
  }, 30000);

  it('draws a sediment chart and lists the warnings panel', async () => {
    await loaded();
    expect(screen.getByRole('img', { name: /sediment concentration in mg\/kg/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /warnings/i })).toBeTruthy();
  }, 20000);

  it('replaces the results with a message when an input is invalid', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/^mixing fraction/i), { target: { value: '2' } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/mixing fraction/i);
  }, 20000);

  it('reports sediment as not quantified without a Koc or Kd', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/^koc/i), { target: { value: '' } });
    await screen.findAllByText(/not quantified/i, undefined, { timeout: 15000 });
  }, 30000);

  it('offers a transport run only when the transport screen holds one, and then draws from it', async () => {
    const first = render(<SurfaceWaterScreen />);
    await screen.findByRole(
      'img',
      { name: /surface water concentration in mg\/L/i },
      { timeout: 15000 },
    );
    expect(screen.queryByRole('checkbox', { name: /groundwater transport run/i })).toBeNull();
    first.unmount();

    const s = toScenario({ ...TRANSPORT_FORM, timeYr: '5' });
    if (!s.ok) throw new Error('scenario');
    const { zOf: _z, ...scenario } = s.scenario;
    void _z;
    setBankFeed({ scenario, label: 'Test run' });
    render(<SurfaceWaterScreen />);
    await screen.findByRole(
      'img',
      { name: /surface water concentration in mg\/L/i },
      { timeout: 15000 },
    );
    const toggle = screen.getByRole('checkbox', { name: /groundwater transport run/i });
    fireEvent.click(toggle);
    const readouts = screen.getByRole('region', { name: /at the end of the run/i });
    await within(readouts).findByText(/groundwater from the transport run: test run/i, undefined, {
      timeout: 40000,
    });
  }, 60000);

  it('compares with criteria on demand: zinc ratios, exceedance flags and the hardness input', async () => {
    await loaded();
    expect(screen.queryByRole('region', { name: /comparison with criteria/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /compare with water quality criteria/i }));
    const panel = await screen.findByRole('region', { name: /comparison with criteria/i });
    const search = await within(panel).findByLabelText(/find a chemical for the criteria/i);
    await waitFor(() => expect((search as HTMLInputElement).disabled).toBe(false), {
      timeout: 15000,
    });
    fireEvent.change(search, { target: { value: '7440-66-6' } });
    fireEvent.click(await within(panel).findByRole('button', { name: /compare zinc/i }));
    const table = await within(panel).findByRole('table', {
      name: /legacy surface water, ratio of the peak/i,
    });
    // 2.91 mg/L of zinc against a 120 ug/L criterion is far above 1
    expect(within(table).getAllByText('exceeds').length).toBeGreaterThan(0);
    expect(
      within(table).getByText(/acute \(criterion maximum concentration, CMC\), freshwater/i),
    ).toBeTruthy();
    const before = within(table)
      .getByText(/acute \(criterion maximum concentration, CMC\), freshwater/i)
      .closest('tr')!.textContent;
    fireEvent.change(within(panel).getByLabelText(/^hardness/i), { target: { value: '200' } });
    await waitFor(() => {
      const after = within(panel)
        .getAllByText(/acute \(criterion maximum concentration, CMC\), freshwater/i)[0]!
        .closest('tr')!.textContent;
      expect(after).not.toBe(before);
    });
  }, 60000);

  it('offers the sets, keeps the US pair as the default, and shows basis, medium and source with each value', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /compare with water quality criteria/i }));
    const panel = await screen.findByRole('region', { name: /comparison with criteria/i });
    const select = within(panel).getByLabelText(/^criteria set/i) as HTMLSelectElement;
    expect(select.value).toBe('us');
    expect([...select.options].map((o) => o.value)).toEqual([
      'us',
      'ccme',
      'eu',
      'eu2026',
      'uk',
      'anzg',
      'macdonald2000',
      'all',
    ]);
    fireEvent.change(select, { target: { value: 'ccme' } });
    expect(getScreen('surfaceWater').criteriaSet).toBe('ccme');
    const search = await within(panel).findByLabelText(/find a chemical for the criteria/i);
    await waitFor(() => expect((search as HTMLInputElement).disabled).toBe(false), {
      timeout: 15000,
    });
    fireEvent.change(search, { target: { value: '71-43-2' } });
    fireEvent.click(await within(panel).findByRole('button', { name: /compare benzene/i }));
    const table = await within(panel).findByRole('table', {
      name: /legacy surface water, ratio of the peak/i,
    });
    // 2.91 mg/L of benzene against the 370 ug/L long-term guideline
    const row = within(table)
      .getByText(/long-term exposure guideline/i)
      .closest('tr')!;
    expect(row.textContent).toMatch(/Canada \(CCME\)/);
    expect(row.textContent).toMatch(/freshwater/);
    expect(row.textContent).toMatch(/CCME summary table/);
    expect(row.textContent).toMatch(/370 ug\/L/);
    expect(within(row).getByText('exceeds')).toBeTruthy();
  }, 60000);

  it('opens with the saved set and puts the set and basis in the CSV of the comparison', async () => {
    setScreen('surfaceWater', { form: getScreen('surfaceWater').form, criteriaSet: 'eu' });
    await loaded();
    const panel = await screen.findByRole('region', { name: /comparison with criteria/i });
    expect((within(panel).getByLabelText(/^criteria set/i) as HTMLSelectElement).value).toBe('eu');
    expect(screen.queryByRole('button', { name: /download csv: criteria comparison/i })).toBeNull();
    const search = await within(panel).findByLabelText(/find a chemical for the criteria/i);
    await waitFor(() => expect((search as HTMLInputElement).disabled).toBe(false), {
      timeout: 15000,
    });
    fireEvent.change(search, { target: { value: '15972-60-8' } });
    fireEvent.click(await within(panel).findByRole('button', { name: /compare alachlor/i }));
    await within(panel).findByRole('table', { name: /legacy surface water, ratio of the peak/i });
    expect(
      await screen.findByRole('button', { name: /download csv: criteria comparison/i }),
    ).toBeTruthy();
  }, 60000);

  it('sends the surface water series to the risk screen with its method origin', async () => {
    await loaded();
    expect(getSurfaceWaterFeed()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /use legacy surface water for swimming/i }));
    const held = getSurfaceWaterFeed();
    expect(held?.origin).toBe('surfaceWater.well-mixed');
    expect(held?.times.length).toBe(held?.values.length);
    // the default run is a 5 mg/L groundwater source: the coefficient is its peak over that source
    expect(held?.coefficient?.value).toBeCloseTo(Math.max(...held!.values) / 5e-3, 12);
    expect(held?.coefficient?.method).toBe('surfaceWater.well-mixed');
    fireEvent.click(screen.getByRole('button', { name: /use modern surface water for swimming/i }));
    expect(getSurfaceWaterFeed()?.origin).toBe('surfaceWater.mass-discharge');
  }, 30000);

  it('keeps the sent series and coefficient and marks them stale when the run is edited', async () => {
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /use legacy surface water for swimming/i }));
    const sent = getSurfaceWaterFeed();
    expect(sent?.coefficient?.value).toBeGreaterThan(0);
    expect(isFeedStaleNow('surfaceWater')).toBe(false);
    fireEvent.change(screen.getByLabelText(/^upstream flow/i), { target: { value: '90000' } });
    await waitFor(() => expect(isFeedStaleNow('surfaceWater')).toBe(true));
    // the sent feed is still the one that was sent, however long the new run takes
    expect(getSurfaceWaterFeed()).toBe(sent);
    const send = screen.getByRole('button', { name: /use legacy surface water for swimming/i });
    await waitFor(() => expect(send).toHaveProperty('disabled', false), { timeout: 15000 });
    fireEvent.click(send);
    expect(getSurfaceWaterFeed()).not.toBe(sent);
    expect(isFeedStaleNow('surfaceWater')).toBe(false);
  }, 40000);

  it('tags an unlinked run with the chemical picked from the project list', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /use legacy surface water for swimming/i }));
    expect(getSurfaceWaterFeed()?.chemicalId).toBeUndefined();
    fireEvent.change(screen.getByLabelText(/^chemical/i), { target: { value: '71-43-2' } });
    fireEvent.click(screen.getByRole('button', { name: /use legacy surface water for swimming/i }));
    // one slot per chemical: the benzene run is kept beside the untagged one
    expect(getSurfaceWaterFeed('71-43-2')?.chemicalId).toBe('71-43-2');
    expect([...getSurfaceWaterFeedSlots().keys()]).toEqual(['', '71-43-2']);
    fireEvent.change(screen.getByLabelText(/^chemical/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /use legacy surface water for swimming/i }));
    expect(getSurfaceWaterFeedSlots().get('')?.chemicalId).toBeUndefined();
    expect([...getSurfaceWaterFeedSlots().keys()]).toEqual(['71-43-2', '']);
  }, 30000);

  it('tags a linked run with the bank run chemical and offers no picker', async () => {
    addChemical({ id: '108-88-3', name: 'Toluene' });
    const s = toScenario({ ...TRANSPORT_FORM, timeYr: '5' });
    if (!s.ok) throw new Error('scenario');
    const { zOf: _z, ...scenario } = s.scenario;
    void _z;
    setBankFeed({ scenario, label: 'Test run', chemicalId: '108-88-3' });
    render(<SurfaceWaterScreen />);
    await screen.findByRole(
      'img',
      { name: /surface water concentration in mg\/L/i },
      { timeout: 15000 },
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /groundwater transport run/i }));
    expect(screen.queryByLabelText(/^chemical/i)).toBeNull();
    const send = screen.getByRole('button', { name: /use legacy surface water for swimming/i });
    await waitFor(() => expect(send).toHaveProperty('disabled', false), { timeout: 40000 });
    fireEvent.click(send);
    expect(getSurfaceWaterFeed()?.chemicalId).toBe('108-88-3');
  }, 60000);

  describe('linked run chemical', () => {
    const bank = (chemicalId: string) => {
      const s = toScenario({ ...TRANSPORT_FORM, timeYr: '5' });
      if (!s.ok) throw new Error('scenario');
      const { zOf: _z, ...scenario } = s.scenario;
      void _z;
      setBankFeed({ scenario, label: 'Test run', chemicalId });
    };
    const linkUp = async () => {
      render(<SurfaceWaterScreen />);
      await screen.findByRole(
        'img',
        { name: /surface water concentration in mg\/L/i },
        { timeout: 15000 },
      );
      fireEvent.click(screen.getByRole('checkbox', { name: /groundwater transport run/i }));
    };

    it('shows the bank run chemical read-only while linked', async () => {
      addChemical({ id: '108-88-3', name: 'Toluene' });
      bank('108-88-3');
      await linkUp();
      expect(screen.queryByLabelText(/^chemical/i)).toBeNull();
      expect(screen.getByText(/chemical of the transport run: toluene/i)).toBeTruthy();
      expect(screen.queryByText(/is not in the project list/i)).toBeNull();
    }, 60000);

    it('errors, and will not send, when the bank run chemical is not in the project list', async () => {
      addChemical({ id: '108-88-3', name: 'Toluene' });
      bank('71-43-2');
      await linkUp();
      expect(screen.getByRole('alert').textContent).toMatch(/71-43-2.*not in the project list/i);
      expect(
        screen.getByRole('button', { name: /use legacy surface water for swimming/i }),
      ).toHaveProperty('disabled', true);
    }, 60000);
  });
});
