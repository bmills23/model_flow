import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CleanupPage } from './CleanupPage';

afterEach(cleanup);

async function withBenzene() {
  render(<CleanupPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
  fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: '71-43-2' } });
  fireEvent.click(await screen.findByRole('button', { name: /add benzene/i }));
  fireEvent.click(screen.getByRole('checkbox', { name: /soil screening guidance/i }));
}

const results = () =>
  screen.findByRole('region', { name: /soil screening leaching results/i }, { timeout: 20000 });

describe('CleanupPage soil screening leaching panel', () => {
  it('shows the level beside the published RSL SSL at DAF 1', async () => {
    await withBenzene();
    const region = await results();
    expect(within(region).getByText(/MCL-based 0\.0026/)).toBeTruthy();
    expect(within(region).getByText(/computed\/published/i)).toBeTruthy();
    expect(within(region).getByText(/DAF 1\./)).toBeTruthy();
  }, 60000);

  it('switches the DAF: 20 raises the level, site-specific reads out the mixing depth and the cap', async () => {
    await withBenzene();
    await results();
    fireEvent.click(screen.getByRole('radio', { name: /daf 20/i }));
    let region = await results();
    expect(within(region).getByText(/DAF 20\./)).toBeTruthy();
    expect(within(region).queryByText(/computed\/published/i)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /site-specific/i }));
    region = await results();
    expect(within(region).getByText(/DAF 12\.7, mixing-zone depth 5\.2 m/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/aquifer thickness/i), { target: { value: '3' } });
    region = await results();
    expect(within(region).getByText(/DAF 7\.76, mixing-zone depth 3 m/)).toBeTruthy();
    expect(within(region).getByText(/exceeds the aquifer thickness/i)).toBeTruthy();
  }, 60000);

  it('a shallow source makes the mass limit govern and says so', async () => {
    await withBenzene();
    await results();
    fireEvent.click(screen.getByRole('radio', { name: /daf 20/i }));
    fireEvent.change(screen.getByLabelText(/source depth/i), { target: { value: '0.01' } });
    const region = await results();
    expect(within(region).getAllByText(/mass limit/i).length).toBeGreaterThan(0);
    expect(within(region).getByText(/mass-limit level .* is used/i)).toBeTruthy();
  }, 60000);

  it('offers the tap water level as the target', async () => {
    await withBenzene();
    await results();
    fireEvent.click(screen.getByRole('radio', { name: /tap water level/i }));
    const region = await results();
    expect(within(region).getByText(/omits the household-use inhalation term/i)).toBeTruthy();
    expect(within(region).getAllByText(/risk-based/i).length).toBeGreaterThan(0);
  }, 60000);
});
