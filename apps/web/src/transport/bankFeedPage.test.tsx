import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearBankFeed, getBankFeed } from './bankFeed';
import { TransportPage } from './TransportPage';
import { seedTransportRegression } from './regression.testkit';

// a new project asks for the dispersivity; these tests run on the RISC5 regression, chosen on purpose
beforeEach(() => seedTransportRegression());

afterEach(() => clearBankFeed());

describe('TransportPage run for the surface water screen', () => {
  it('sends the scenario, without its closure, to the surface water screen', async () => {
    render(<TransportPage />);
    const button = await screen.findByRole(
      'button',
      { name: /use as surface water source/i },
      { timeout: 30000 },
    );
    expect(getBankFeed()).toBeNull();
    fireEvent.click(button);
    const feed = getBankFeed();
    expect(feed?.scenario.velocity).toBeGreaterThan(0);
    expect('zOf' in (feed?.scenario ?? {})).toBe(false);
    expect(
      screen.getByRole('link', { name: /open surface water and sediment/i }).getAttribute('href'),
    ).toBe('#/surface-water');
  }, 60000);
});
