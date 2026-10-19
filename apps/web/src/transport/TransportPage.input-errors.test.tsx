import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearVadoseFeed } from '../vadose/feed';
import { TransportPage } from './TransportPage';

// The TransportPage tests are spread over three files (each test runs the page's full compute), so they run side by side.
afterEach(() => clearVadoseFeed());

describe('TransportPage', () => {
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

  it('wires the plume and transport CSV buttons, and disables them while the result is stale', async () => {
    render(<TransportPage />);
    await screen.findByRole('img', { name: /plume map/i }, { timeout: 15000 });
    const plume = (): HTMLButtonElement =>
      screen.getByRole('button', { name: /download csv: plume grid/i });
    const transport = (): HTMLButtonElement =>
      screen.getByRole('button', { name: /download csv: results/i });
    await screen.findByText(/up to date/i, undefined, { timeout: 15000 });
    expect(plume().disabled).toBe(false);
    expect(transport().disabled).toBe(false);
    // Plume download sits under the plume map.
    const map = screen.getByRole('img', { name: /plume map/i });
    expect(map.compareDocumentPosition(plume()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const chart = screen.getByRole('img', { name: /breakthrough curves/i });
    expect(plume().compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Invalid input: the results go stale and both downloads are disabled.
    fireEvent.click(screen.getByRole('radio', { name: /^steps$/i }));
    await screen.findByLabelText(/step 2 start/i);
    await screen.findByText(/up to date/i, undefined, { timeout: 15000 });
    fireEvent.change(screen.getByLabelText(/step 2 start/i), { target: { value: '3' } });
    const warnings = screen.getByRole('region', { name: /warnings/i });
    await within(warnings).findByText(/overlap/i, undefined, { timeout: 15000 });
    // The grid on screen is the last good one, so a CSV labelled with the current form would lie.
    expect(plume().disabled).toBe(true);
    expect(transport().disabled).toBe(true);
  }, 40000);
});
