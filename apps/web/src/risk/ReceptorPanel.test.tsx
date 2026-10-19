import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RiskPage } from './RiskPage';
import { CleanupPage } from '../cleanup/CleanupPage';
import { forgetMemory, getOverrides } from '../project/store';
import { receptorKey } from '../overrides/receptors';

afterEach(() => {
  cleanup();
  forgetMemory();
});

async function loadedRisk() {
  render(<RiskPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
  return screen.getByRole('group', { name: /receptor a/i });
}

function openEditor(panel: HTMLElement) {
  const details = panel.querySelector('details.override-panel') as HTMLDetailsElement;
  expect(details).not.toBeNull();
  details.open = true;
  return details;
}

describe('receptor exposure factors panel', () => {
  it('shows the preset value, marks an edit with text and resets it', async () => {
    const panel = await loadedRisk();
    const ed = openEditor(panel);
    const bw = within(ed).getByLabelText(/^body weight \(kg\)/i);
    expect(within(ed).getAllByText(/preset: 70 kg/i).length).toBeGreaterThan(0);
    expect(within(ed).queryByText('Edited')).toBeNull();

    fireEvent.change(bw, { target: { value: '60' } });
    expect(within(ed).getByText('Edited')).toBeTruthy();
    expect(getOverrides().receptors[receptorKey('risk', 'a')]?.['legacy.bwKg']?.value).toBe('60');
    expect(ed.querySelector('summary')?.textContent).toMatch(/1 edited/);

    fireEvent.click(
      within(ed).getByRole('button', { name: /reset to preset: body weight of receptor a/i }),
    );
    expect(within(ed).queryByText('Edited')).toBeNull();
    expect(getOverrides().receptors).toEqual({});
  }, 30000);

  it('flags a negative entry and resets every edit at once', async () => {
    const panel = await loadedRisk();
    const ed = openEditor(panel);
    fireEvent.change(within(ed).getByLabelText(/^exposure duration \(yr\)/i), {
      target: { value: '-3' },
    });
    expect(within(ed).getByRole('status').textContent).toMatch(/not negative/i);
    fireEvent.click(
      within(ed).getByRole('button', { name: /reset to preset: all exposure factors/i }),
    );
    expect(getOverrides().receptors).toEqual({});
  }, 30000);

  it('uses the receptor name in the heading and clears it when blank', async () => {
    const panel = await loadedRisk();
    fireEvent.change(within(panel).getByLabelText(/receptor name \(optional\)/i), {
      target: { value: 'North lot' },
    });
    expect(getOverrides().receptorNames[receptorKey('risk', 'a')]).toBe('North lot');
    expect(
      within(screen.getByRole('group', { name: /north lot/i })).getByText('North lot'),
    ).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText(/receptor name \(optional\)/i), {
      target: { value: '' },
    });
    expect(getOverrides().receptorNames).toEqual({});
  }, 30000);

  it('switches preset at once when nothing is edited', async () => {
    const panel = await loadedRisk();
    fireEvent.click(within(panel).getByLabelText(/^worker$/i));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((within(panel).getByLabelText(/^worker$/i) as HTMLInputElement).checked).toBe(true);
  }, 30000);

  it('asks before a preset switch drops edits: keep leaves everything, switch resets them', async () => {
    const panel = await loadedRisk();
    const ed = openEditor(panel);
    fireEvent.change(within(ed).getByLabelText(/^body weight \(kg\)/i), {
      target: { value: '60' },
    });

    fireEvent.click(within(panel).getByLabelText(/^worker$/i));
    const dialog = screen.getByRole('alertdialog', { name: /change preset/i });
    expect(dialog.textContent).toMatch(/1 edited exposure factor/i);
    fireEvent.click(within(dialog).getByRole('button', { name: /keep resident/i }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((within(panel).getByLabelText(/^resident$/i) as HTMLInputElement).checked).toBe(true);
    expect(Object.keys(getOverrides().receptors)).toHaveLength(1);

    fireEvent.click(within(panel).getByLabelText(/^worker$/i));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /switch and reset/i }),
    );
    expect((within(panel).getByLabelText(/^worker$/i) as HTMLInputElement).checked).toBe(true);
    expect(getOverrides().receptors).toEqual({});
  }, 30000);

  it('keeps the risk and cleanup screens apart', async () => {
    const panel = await loadedRisk();
    fireEvent.change(within(openEditor(panel)).getByLabelText(/^body weight \(kg\)/i), {
      target: { value: '60' },
    });
    cleanup();
    render(<CleanupPage />);
    await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
    const other = screen.getByRole('group', { name: /receptor a/i });
    expect(within(openEditor(other)).queryByText('Edited')).toBeNull();
  }, 40000);
});
