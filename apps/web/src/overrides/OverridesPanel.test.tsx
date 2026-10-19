import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RiskPage } from '../risk/RiskPage';
import { CleanupPage } from '../cleanup/CleanupPage';
import { forgetMemory, getOverrides, setScreen } from '../project/store';
import { newChemicalRow } from '../risk/form';
import { loadChemicalDb } from '../risk/chemicalDb';

afterEach(() => {
  cleanup();
  forgetMemory();
});

async function loadedRisk() {
  render(<RiskPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
  fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: '71-43-2' } });
  fireEvent.click(await screen.findByRole('button', { name: /add benzene/i }));
  return screen.getByRole('group', { name: /benzene/i });
}

function openPanel(card: HTMLElement) {
  const details = card.querySelector('details.override-panel') as HTMLDetailsElement;
  expect(details).not.toBeNull();
  details.open = true;
  return details;
}

describe('Edit values panel', () => {
  it('shows the database value and source, marks an edit with text, and resets it', async () => {
    const card = await loadedRisk();
    const panel = openPanel(card);
    expect(within(panel).getAllByText(/database value:/i).length).toBe(4);
    expect(within(panel).getAllByText(/0\.055/).length).toBeGreaterThan(0);

    fireEvent.change(within(panel).getByLabelText(/your value for oral slope factor/i), {
      target: { value: '0.5' },
    });
    // a value without a note is flagged and not yet used
    expect(within(panel).getByRole('status')).toBeTruthy();
    const table = within(card).getByRole('table', { name: /toxicity values of benzene/i });
    expect(within(table).getByText('0.055')).toBeTruthy();

    const notes = within(panel).getAllByLabelText(/source note \(required\)/i);
    fireEvent.change(notes[0]!, { target: { value: 'agency memo' } });
    expect(within(panel).queryByRole('status')).toBeNull();
    // the card table now carries the user value, the word Edited and the user source
    expect(within(table).getByText('0.5')).toBeTruthy();
    expect(within(table).getByText(/user value \(this project\)/i)).toBeTruthy();
    expect(within(table).getAllByText('Edited').length).toBe(1);
    expect(within(panel).getByText('Edited')).toBeTruthy();
    expect(getOverrides().toxicity['71-43-2']?.['sfo']).toEqual({
      value: '0.5',
      note: 'agency memo',
    });

    fireEvent.click(
      within(panel).getByRole('button', {
        name: /reset to database value: oral slope factor of benzene/i,
      }),
    );
    expect(getOverrides().toxicity).toEqual({});
    expect(within(table).getByText('0.055')).toBeTruthy();
    expect(within(card).queryByText('Edited')).toBeNull();
  }, 40000);

  it('shows the same edited value on the cleanup screen', async () => {
    const card = await loadedRisk();
    const panel = openPanel(card);
    fireEvent.change(within(panel).getByLabelText(/your value for oral slope factor/i), {
      target: { value: '0.5' },
    });
    fireEvent.change(within(panel).getAllByLabelText(/source note \(required\)/i)[0]!, {
      target: { value: 'agency memo' },
    });
    cleanup();

    const db = await loadChemicalDb();
    setScreen('cleanup', {
      form: {
        ...(await import('../cleanup/form')).defaultCleanupForm(),
        chemicals: [newChemicalRow(db.byId.get('71-43-2')!)],
      },
    });
    render(<CleanupPage />);
    await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
    const ccard = screen.getByRole('group', { name: /benzene/i });
    const table = within(ccard).getByRole('table', { name: /toxicity values of benzene/i });
    expect(within(table).getByText('0.5')).toBeTruthy();
    expect(within(table).getByText(/user value \(this project\)/i)).toBeTruthy();
    const p2 = openPanel(ccard);
    expect(
      (within(p2).getAllByLabelText(/source note \(required\)/i)[0] as HTMLInputElement).value,
    ).toBe('agency memo');
  }, 40000);
});

describe('Edit values panel accessibility', () => {
  it('names each reset button starting with its visible text and adds no skipped heading level', async () => {
    const card = await loadedRisk();
    const panel = openPanel(card);
    fireEvent.change(within(panel).getByLabelText(/your value for oral slope factor/i), {
      target: { value: '0.5' },
    });
    const buttons = [...panel.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      const label = (b.getAttribute('aria-label') ?? '').toLowerCase();
      expect(label.startsWith((b.textContent ?? '').trim().toLowerCase())).toBe(true);
    }
    expect(panel.querySelector('h4')).toBeNull();
  }, 60000);
});
