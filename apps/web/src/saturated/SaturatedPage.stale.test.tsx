import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SaturatedPage } from './SaturatedPage';

describe('SaturatedPage stale results', () => {
  it('does not read "Up to date" beside old results while an input has an error', async () => {
    render(<SaturatedPage />);
    await screen.findByRole('img', { name: /release rate/i }, { timeout: 15000 });
    await screen.findByText(/up to date/i, undefined, { timeout: 15000 });
    fireEvent.change(screen.getByLabelText(/^horizon/i), { target: { value: '' } });
    await screen.findByText(/fix these inputs/i);
    expect(screen.queryByText(/up to date/i)).toBeNull();
    expect(screen.getByText(/these results are out of date/i)).toBeTruthy();
    expect(screen.getByText('Inputs need attention')).toBeTruthy();
  }, 40000);
});
