import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSaturatedFeed, setSaturatedFeed } from '../saturated/feed';
import { DEFAULT_FORM as SAT_FORM, toScenario as toSaturated } from '../saturated/form';
import { TransportPage } from './TransportPage';
import { seedTransportRegression } from './regression.testkit';

// a new project asks for the dispersivity; these tests run on the RISC5 regression, chosen on purpose
beforeEach(() => seedTransportRegression());

afterEach(() => clearSaturatedFeed());

describe('TransportPage with a saturated feed', () => {
  it('offers the saturated feed only when held, and then notes it in the warnings', async () => {
    render(<TransportPage />);
    expect(
      screen.queryByRole('checkbox', { name: /feed the source from the saturated/i }),
    ).toBeNull();
    const sat = toSaturated(SAT_FORM);
    if (!sat.ok) throw new Error('scenario');
    act(() =>
      setSaturatedFeed({ input: sat.scenario.input, method: 'legacy', label: 'Hand case A' }),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /feed the source from the saturated/i }));
    const warnings = await screen.findByRole('region', { name: /warnings/i }, { timeout: 30000 });
    await within(warnings).findByText('ui.saturated-feed', undefined, { timeout: 30000 });
  }, 60000);
});
