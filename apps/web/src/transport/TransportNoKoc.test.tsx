import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransportPage } from './TransportPage';

// A database fixture with one chemical that has no Koc (like hydrogen cyanide) and one that has a Koc.
vi.mock('../vapor/chemicals', () => ({
  loadVaporChemicals: async () => [
    { id: '74-90-8', name: 'Hydrogen cyanide', rsl: { s: { value: 1000 } } },
    { id: '71-43-2', name: 'Benzene', rsl: { koc: { value: 58.9 } } },
  ],
}));

const NOTE = /no Koc/i;

describe('TransportPage chemical pick without a Koc', () => {
  it('keeps the retardation mode and values and says the database has no Koc', async () => {
    render(<TransportPage />);
    await screen.findByRole('img', { name: /plume map/i }, { timeout: 15000 });
    fireEvent.click(screen.getByRole('radio', { name: /factor r/i }));
    const retardation = screen.getByLabelText(/retardation factor r/i) as HTMLInputElement;
    fireEvent.change(retardation, { target: { value: '3.5' } });

    fireEvent.change(screen.getByLabelText(/fill from the chemical database/i), {
      target: { value: '74-90-8' },
    });

    expect(await screen.findByText(NOTE)).toBeTruthy();
    expect((screen.getByRole('radio', { name: /factor r/i }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText(/retardation factor r/i) as HTMLInputElement).value).toBe('3.5');
  }, 20000);

  it('fills Kd from Koc for a chemical that has one and clears the note', async () => {
    render(<TransportPage />);
    await screen.findByRole('img', { name: /plume map/i }, { timeout: 15000 });
    const picker = screen.getByLabelText(/fill from the chemical database/i);
    fireEvent.change(picker, { target: { value: '74-90-8' } });
    expect(await screen.findByText(NOTE)).toBeTruthy();
    fireEvent.change(picker, { target: { value: '71-43-2' } });
    await waitFor(() => expect(screen.queryByText(NOTE)).toBeNull());
    expect((screen.getByLabelText(/^kd/i) as HTMLInputElement).value).toBe(String(58.9 * 0.001));
  }, 20000);
});
