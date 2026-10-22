import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getScreen, newProject, setScreen } from '../project/store';

vi.mock('../risk/chemicalDb', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadChemicalDb: () => Promise.reject(new Error('offline')),
}));

import { ReportPage } from './ReportPage';

afterEach(() => newProject());

describe('ReportPage when the databases do not load', () => {
  it('tells the reader the run basis could not be built', async () => {
    const v = getScreen('vadose');
    setScreen('vadose', { ...v, form: { ...v.form, foc: '0.0123' } } as typeof v);
    render(<ReportPage />);
    expect(
      await screen.findByText(/could not be built/i, undefined, { timeout: 12000 }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download CSV: run basis' })).toBeNull();
  }, 20000);
});
