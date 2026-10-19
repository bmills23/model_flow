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
});
