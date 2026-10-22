import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RiskPage } from './RiskPage';
import { CleanupPage } from '../cleanup/CleanupPage';
import { forgetMemory, getOverrides, setOverrides } from '../project/store';
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

function noteOf(ed: HTMLElement): HTMLInputElement {
  const row = within(ed)
    .getByLabelText(/^body weight \(kg\)/i)
    .closest('.override-row') as HTMLElement;
  return within(row).getByLabelText(/source note for body weight/i) as HTMLInputElement;
}

function setBw(ed: HTMLElement, value: string, note = 'Site survey 2026') {
  fireEvent.change(within(ed).getByLabelText(/^body weight \(kg\)/i), { target: { value } });
  if (note !== '') {
    fireEvent.change(noteOf(ed), {
      target: { value: note },
    });
  }
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
    expect(within(ed).getAllByText(/preset: 70 kg/i).length).toBeGreaterThan(0);
    expect(within(ed).queryByText('Edited')).toBeNull();

    setBw(ed, '60');
    expect(within(ed).getByText('Edited')).toBeTruthy();
    expect(getOverrides().receptors[receptorKey('risk', 'a')]?.['legacy.bwKg']?.note).toBe(
      'Site survey 2026',
    );
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
    expect(within(ed).getAllByRole('status')[0]!.textContent).toMatch(/not negative/i);
    fireEvent.click(
      within(ed).getByRole('button', { name: /reset to preset: all exposure factors/i }),
    );
    expect(getOverrides().receptors).toEqual({});
  }, 30000);

  it('does not apply an edited value without a note and says why next to the field', async () => {
    const panel = await loadedRisk();
    const ed = openEditor(panel);
    setBw(ed, '60', '');
    expect(getOverrides().receptors).toEqual({});
    const note = noteOf(ed);
    const msg = noteOf(ed).closest('.override-row')!.querySelector('.override-problem')!;
    expect(msg.textContent).toMatch(/source note is required/i);
    expect(note.getAttribute('aria-describedby')).toBe(msg.id);
    expect(note.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(note, { target: { value: '  ' } });
    expect(getOverrides().receptors).toEqual({});
    fireEvent.change(note, { target: { value: 'Site survey 2026' } });
    expect(getOverrides().receptors[receptorKey('risk', 'a')]?.['legacy.bwKg']?.value).toBe('60');
    expect(noteOf(ed).closest('.override-row')!.querySelector('.override-problem')).toBeNull();

    // clearing the note stops the value being used again
    fireEvent.change(note, { target: { value: '' } });
    expect(getOverrides().receptors).toEqual({});
  }, 30000);

  it('shows "no note" on an edit saved without one and keeps it applied', async () => {
    setOverrides({
      ...getOverrides(),
      receptors: { [receptorKey('risk', 'a')]: { 'legacy.bwKg': { value: '60', note: '' } } },
    });
    render(<RiskPage />);
    await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
    const ed = openEditor(screen.getByRole('group', { name: /receptor a/i }));
    expect(within(ed).getByText(/no note/i)).toBeTruthy();
    // the editor must not claim the applied value is unused
    const row = noteOf(ed).closest('.override-row')!;
    expect(row.querySelector('.override-problem')).toBeNull();
    expect(noteOf(ed).getAttribute('aria-invalid')).toBeNull();
    expect(within(ed).queryByText(/value is not used/i)).toBeNull();
    expect(getOverrides().receptors[receptorKey('risk', 'a')]?.['legacy.bwKg']?.value).toBe('60');
  }, 40000);

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
    setBw(ed, '60');

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
    setBw(openEditor(panel), '60');
    cleanup();
    render(<CleanupPage />);
    await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
    const other = screen.getByRole('group', { name: /receptor a/i });
    expect(within(openEditor(other)).queryByText('Edited')).toBeNull();
  }, 40000);
});
