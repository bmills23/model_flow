import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearVadoseFeed, setVadoseFeed } from '../vadose/feed';
import { R7_FORM as VADOSE_FORM, toScenario as toVadose } from '../vadose/form';
import { TransportPage } from './TransportPage';
import { seedTransportRegression } from './regression.testkit';

// a new project asks for the dispersivity; these tests run on the RISC5 regression, chosen on purpose
beforeEach(() => seedTransportRegression());

// The TransportPage tests are spread over three files (each test runs the page's full compute), so they run side by side.
afterEach(() => clearVadoseFeed());

describe('TransportPage', () => {
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
