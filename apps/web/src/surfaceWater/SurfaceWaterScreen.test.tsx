import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearBankFeed, setBankFeed } from '../transport/bankFeed';
import { DEFAULT_FORM as TRANSPORT_FORM, toScenario } from '../transport/form';
import { SurfaceWaterScreen } from './SurfaceWaterScreen';

afterEach(() => clearBankFeed());

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
});
