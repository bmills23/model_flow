import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearBankFeed } from '../transport/bankFeed';
import { clearSurfaceWaterFeed, getSurfaceWaterFeed } from './feed';
import { SurfaceWaterScreen } from './SurfaceWaterScreen';
import type * as computeModule from './compute';

let fail = false;
vi.mock('./compute', async (importOriginal) => {
  const real = await importOriginal<typeof computeModule>();
  return {
    ...real,
    compute: (req: Parameters<typeof real.compute>[0]) =>
      fail ? { ok: false as const, error: 'the engine rejected these inputs' } : real.compute(req),
  };
});

afterEach(() => {
  fail = false;
  clearBankFeed();
  clearSurfaceWaterFeed();
});

describe('SurfaceWaterScreen after an engine error', () => {
  it('does not send the stale last good series to the risk screen', async () => {
    render(<SurfaceWaterScreen />);
    await screen.findByRole(
      'img',
      { name: /surface water concentration in mg\/L/i },
      { timeout: 15000 },
    );
    fail = true;
    fireEvent.change(screen.getByLabelText(/^koc/i), { target: { value: '60' } });
    await screen.findAllByText(/the engine rejected these inputs/i, undefined, { timeout: 15000 });
    const legacy = screen.getByRole('button', { name: /use legacy surface water for swimming/i });
    const modern = screen.getByRole('button', { name: /use modern surface water for swimming/i });
    await waitFor(() => expect((legacy as HTMLButtonElement).disabled).toBe(true));
    expect((modern as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(modern);
    expect(getSurfaceWaterFeed()).toBeNull();
  }, 40000);

  it('does not read "Up to date" beside old results once the engine rejects the inputs', async () => {
    render(<SurfaceWaterScreen />);
    await screen.findByRole(
      'img',
      { name: /surface water concentration in mg\/L/i },
      { timeout: 15000 },
    );
    await screen.findByText(/up to date/i, undefined, { timeout: 15000 });
    fail = true;
    fireEvent.change(screen.getByLabelText(/^koc/i), { target: { value: '60' } });
    await screen.findAllByText(/the engine rejected these inputs/i, undefined, { timeout: 15000 });
    expect(screen.queryByText(/^up to date$/i)).toBeNull();
    expect(screen.getByText(/these results are out of date/i)).toBeTruthy();
    expect(screen.getByText('Inputs need attention')).toBeTruthy();
  }, 40000);
});
