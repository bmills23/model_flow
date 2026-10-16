import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearVadoseFeed, setVadoseFeed } from '../vadose/feed';
import { DEFAULT_FORM as VADOSE_FORM, toScenario as toVadose } from '../vadose/form';
import { TransportPage } from './TransportPage';

afterEach(() => clearVadoseFeed());

describe('TransportPage', () => {
  it('shows a plume map, breakthrough curve, receptor readouts and warnings on first load', async () => {
    render(<TransportPage />);
    expect(screen.getByRole('heading', { level: 1, name: /groundwater transport/i })).toBeTruthy();
    const map = await screen.findByRole('img', { name: /plume map/i }, { timeout: 15000 });
    expect(map).toBeTruthy();
    expect(screen.getByRole('img', { name: /breakthrough curves/i })).toBeTruthy();
    const readouts = screen.getByRole('region', { name: /receptor concentration/i });
    expect(within(readouts).getByText(/legacy/i)).toBeTruthy();
    expect(within(readouts).getByText(/modern/i)).toBeTruthy();
    expect(screen.getByRole('region', { name: /warnings/i })).toBeTruthy();
    expect(screen.queryByText(/Domenico comparison/i, { selector: 'li' })).toBeNull();
  }, 20000);

  it('labels the Domenico toggle as a BIOSCREEN/RBCA-compatible comparison and adds its series', async () => {
    render(<TransportPage />);
    await screen.findByRole('img', { name: /plume map/i }, { timeout: 15000 });
    const toggle = screen.getByRole('checkbox', { name: /BIOSCREEN\/RBCA-compatible comparison/i });
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    const series = await screen.findByRole('list', { name: /series/i }, { timeout: 15000 });
    await screen.findByText(/domenico comparison/i, { selector: 'li' }, { timeout: 15000 });
    expect(series).toBeTruthy();
  }, 40000);

  it('replaces the results with a message when an input is invalid', async () => {
    render(<TransportPage />);
    await screen.findByRole('img', { name: /plume map/i }, { timeout: 15000 });
    fireEvent.change(screen.getByLabelText(/^porosity/i), { target: { value: '2' } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/porosity/i);
  }, 20000);

  it('keeps the last good result and lists an engine input error in the warnings panel', async () => {
    render(<TransportPage />);
    await screen.findByRole('img', { name: /plume map/i }, { timeout: 15000 });
    fireEvent.click(screen.getByRole('radio', { name: /^steps$/i }));
    await screen.findByLabelText(/step 2 start/i);
    await screen.findByText(/up to date/i, undefined, { timeout: 15000 });
    fireEvent.change(screen.getByLabelText(/step 2 start/i), { target: { value: '3' } });
    const warnings = screen.getByRole('region', { name: /warnings/i });
    await within(warnings).findByText(/overlap/i, undefined, { timeout: 15000 });
    expect(within(warnings).getByText('ui.input-error')).toBeTruthy();
    expect(screen.getByRole('img', { name: /plume map/i })).toBeTruthy();
    expect(screen.getByRole('img', { name: /breakthrough curves/i })).toBeTruthy();
  }, 40000);

  it('offers a vadose feed only when the vadose screen holds one, and then takes the source from it', async () => {
    const first = render(<TransportPage />);
    await screen.findByRole('img', { name: /plume map/i }, { timeout: 15000 });
    expect(screen.queryByRole('checkbox', { name: /feed the source from the vadose/i })).toBeNull();
    first.unmount();

    const v = toVadose(VADOSE_FORM);
    if (!v.ok) throw new Error('vadose scenario');
    setVadoseFeed({ scenario: v.scenario, method: 'legacy', label: 'Table R-7 validation case' });
    render(<TransportPage />);
    await screen.findByRole('img', { name: /plume map/i }, { timeout: 15000 });
    const toggle = screen.getByRole('checkbox', { name: /feed the source from the vadose/i });
    expect(screen.getByLabelText(/source concentration/i)).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByLabelText(/source concentration/i)).toBeNull();
    const warnings = screen.getByRole('region', { name: /warnings/i });
    await within(warnings).findByText('ui.vadose-feed', undefined, { timeout: 30000 });
    expect(screen.getByRole('img', { name: /plume map/i })).toBeTruthy();
  }, 60000);
});
