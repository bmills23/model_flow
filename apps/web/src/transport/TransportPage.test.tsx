import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearVadoseFeed } from '../vadose/feed';
import { TransportPage } from './TransportPage';
import { seedTransportRegression } from './regression.testkit';

// a new project asks for the dispersivity; these tests run on the RISC5 regression, chosen on purpose
beforeEach(() => seedTransportRegression());

// The TransportPage tests are spread over three files (each test runs the page's full compute), so they run side by side.
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
});
