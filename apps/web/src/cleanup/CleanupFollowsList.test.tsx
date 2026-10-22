import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addChemical,
  forgetMemory,
  getChemicals,
  getScreen,
  newProject,
  removeProjectChemical,
} from '../project/store';
import { CleanupPage } from './CleanupPage';

beforeEach(() => {
  forgetMemory();
  newProject();
});

async function loaded() {
  render(<CleanupPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
}

describe('CleanupPage follows the project chemical list', () => {
  it('shows a card for every chemical on the list and writes the rows back', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    addChemical({ id: '108-88-3', name: 'Toluene' });
    await loaded();
    expect(await screen.findByRole('group', { name: /toluene/i })).toBeTruthy();
    expect(screen.getByRole('group', { name: /benzene/i })).toBeTruthy();
    expect(getScreen('cleanup').form.chemicals.map((c) => c.id)).toEqual(['71-43-2', '108-88-3']);
  }, 30000);

  it('adding with the picker puts the chemical on the project list', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: '71-43-2' } });
    fireEvent.click(await screen.findByRole('button', { name: /add benzene/i }));
    expect(getChemicals().map((c) => c.id)).toEqual(['71-43-2']);
  }, 30000);

  it('a row remove asks first and removes the chemical from the project and both screens', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    addChemical({ id: '108-88-3', name: 'Toluene' });
    await loaded();
    fireEvent.click(await screen.findByRole('button', { name: /^remove toluene$/i }));
    const ask = screen.getByRole('group', { name: /remove toluene from the project/i });
    expect(ask.textContent).toMatch(/exposure and risk/i);
    fireEvent.click(within(ask).getByRole('button', { name: /remove from the project/i }));
    expect(getChemicals().map((c) => c.id)).toEqual(['71-43-2']);
    expect(screen.queryByRole('group', { name: /toluene/i })).toBeNull();
    expect(getScreen('risk').form.chemicals.map((c) => c.id)).not.toContain('108-88-3');
    expect(getScreen('cleanup').form.chemicals.map((c) => c.id)).toEqual(['71-43-2']);
  }, 30000);

  it('a chemical removed from the project elsewhere leaves the screen', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    addChemical({ id: '108-88-3', name: 'Toluene' });
    await loaded();
    await screen.findByRole('group', { name: /toluene/i });
    act(() => removeProjectChemical('108-88-3'));
    expect(screen.queryByRole('group', { name: /toluene/i })).toBeNull();
  }, 30000);
});
