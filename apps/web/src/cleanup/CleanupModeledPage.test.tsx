import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CleanupPage } from './CleanupPage';
import { clearTransportFeed, setTransportFeed } from '../transport/chainFeed';
import { toScenario } from '../transport/form';
import { REGRESSION_FORM as DEFAULT_FORM } from '../transport/regression.testkit';

afterEach(() => {
  cleanup();
  clearTransportFeed();
});

async function withBenzene() {
  render(<CleanupPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
  fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: '71-43-2' } });
  fireEvent.click(await screen.findByRole('button', { name: /add benzene/i }));
}

function hold(): void {
  const r = toScenario({ ...DEFAULT_FORM, timeYr: '10' });
  if (!r.ok) throw new Error(r.errors.join('; '));
  act(() => setTransportFeed({ scenario: r.scenario, label: 'test aquifer' }));
}

describe('CleanupPage modeled sources', () => {
  it('asks for the groundwater screen when no aquifer is held', async () => {
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    expect(await screen.findByText(/press "use for cleanup levels"/i)).toBeTruthy();
  }, 40000);

  it('solves a dissolved source to the database MCL at the well and charts it', async () => {
    hold();
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    fireEvent.click(screen.getByRole('radio', { name: /concentration at the well/i }));
    expect(screen.getByText(/uses the mcl of benzene: 5 ug\/l/i)).toBeTruthy();
    const region = await screen.findByRole(
      'region',
      { name: /modeled cleanup level, modern/i },
      { timeout: 60000 },
    );
    expect(within(region).getByText(/concentration at the well/i, { selector: 'td' })).toBeTruthy();
    expect(within(region).getByText(/solved by/i)).toBeTruthy();
    expect(within(region).getByText(/residual/i)).toBeTruthy();
    expect(
      within(region).getByRole('img', { name: /against the source concentration/i }),
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: /modeled cleanup level, legacy/i })).toBeTruthy();
  }, 120000);

  it('offers the modeled-source probabilistic panel once the level is solved', async () => {
    hold();
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    const panel = await screen.findByRole(
      'region',
      { name: /probabilistic cleanup level, modeled source/i },
      { timeout: 60000 },
    );
    expect(within(panel).getByRole('group', { name: /seepage velocity/i })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: /run probabilistic cleanup/i })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /^probabilistic cleanup level$/i })).toBeNull();
  }, 120000);

  it('reports a target the source cannot reach under the solubility ceiling', async () => {
    hold();
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    fireEvent.click(screen.getByRole('radio', { name: /concentration at the well/i }));
    fireEvent.change(screen.getByLabelText(/solubility ceiling/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/well concentration target/i), {
      target: { value: '1000' },
    });
    const region = await screen.findByRole(
      'region',
      { name: /modeled cleanup level, modern/i },
      { timeout: 60000 },
    );
    expect(within(region).getByText(/not reached/i, { selector: 'strong' })).toBeTruthy();
    expect(within(region).getByText(/no cleanup level to report/i)).toBeTruthy();
  }, 120000);
});
