import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearWellFeed, getWellFeedSlots, setWellFeed } from '../transport/wellFeed';
import {
  addChemical,
  forgetMemory,
  getChemicals,
  getScreen,
  newProject,
  removeProjectChemical,
} from '../project/store';
import { RiskPage } from './RiskPage';

beforeEach(() => {
  forgetMemory();
  newProject();
});
afterEach(() => clearWellFeed());

async function loaded() {
  render(<RiskPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
}

describe('RiskPage follows the project chemical list', () => {
  it('shows a card for every chemical on the list, the ones it holds no state for with defaults and a note', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    addChemical({ id: '108-88-3', name: 'Toluene' });
    await loaded();
    const toluene = await screen.findByRole('group', { name: /toluene/i });
    expect(screen.getByRole('group', { name: /benzene/i })).toBeTruthy();
    expect(within(toluene).getByText(/nothing set for this chemical/i)).toBeTruthy();
    // the rows are written back by a passive effect that React may flush after the cards reach the DOM,
    // so wait for the store rather than read it the instant the card appears
    await waitFor(() =>
      expect(getScreen('risk').form.chemicals.map((c) => c.id)).toEqual(['71-43-2', '108-88-3']),
    );
  }, 30000);

  it('a chemical added to the list while the screen is open gets a row; one with state keeps it', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: '71-43-2' } });
    fireEvent.click(await screen.findByRole('button', { name: /add benzene/i }));
    const card = screen.getByRole('group', { name: /benzene/i });
    fireEvent.change(within(card).getByLabelText(/groundwater \(mg\/L\)/i), {
      target: { value: '0.005' },
    });
    // the picker put it on the project list
    expect(getChemicals().map((c) => c.id)).toEqual(['71-43-2']);
    act(() => addChemical({ id: '108-88-3', name: 'Toluene' }));
    expect(await screen.findByRole('group', { name: /toluene/i })).toBeTruthy();
    const again = screen.getByRole('group', { name: /benzene/i });
    expect((within(again).getByLabelText(/groundwater \(mg\/L\)/i) as HTMLInputElement).value).toBe(
      '0.005',
    );
  }, 30000);

  it('a row remove asks first, names what is lost, and removes the chemical from the project', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    addChemical({ id: '108-88-3', name: 'Toluene' });
    setWellFeed({
      method: 'modern',
      label: 'w',
      times: [0, 1],
      values: [0, 1],
      chemicalId: '108-88-3',
    });
    await loaded();
    fireEvent.click(await screen.findByRole('button', { name: /^remove toluene$/i }));
    const ask = screen.getByRole('group', { name: /remove toluene from the project/i });
    expect(ask.textContent).toMatch(/exposure and risk/i);
    expect(ask.textContent).toMatch(/cleanup levels/i);
    expect(ask.textContent).toMatch(/groundwater well result/i);
    // asking changes nothing
    expect(getChemicals()).toHaveLength(2);
    // keep
    fireEvent.click(within(ask).getByRole('button', { name: /keep it/i }));
    expect(screen.queryByRole('group', { name: /remove toluene from the project/i })).toBeNull();
    expect(getChemicals()).toHaveLength(2);
    // confirm
    fireEvent.click(screen.getByRole('button', { name: /^remove toluene$/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove from the project/i }));
    expect(getChemicals().map((c) => c.id)).toEqual(['71-43-2']);
    expect(screen.queryByRole('group', { name: /toluene/i })).toBeNull();
    expect(getScreen('risk').form.chemicals.map((c) => c.id)).toEqual(['71-43-2']);
    expect(getWellFeedSlots().size).toBe(0);
  }, 30000);

  it('a chemical removed from the project elsewhere leaves the screen', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    addChemical({ id: '108-88-3', name: 'Toluene' });
    await loaded();
    await screen.findByRole('group', { name: /toluene/i });
    act(() => removeProjectChemical('108-88-3'));
    expect(screen.queryByRole('group', { name: /toluene/i })).toBeNull();
    expect(screen.getByRole('group', { name: /benzene/i })).toBeTruthy();
  }, 30000);

  it('a project chemical outside the RSL tables is named, not given a card', async () => {
    addChemical({ id: 'my-solvent', name: 'My solvent' });
    await loaded();
    expect(screen.getByText(/my solvent/i).textContent).toMatch(/not in the RSL tables/i);
    expect(screen.queryByRole('group', { name: /my solvent/i })).toBeNull();
  }, 30000);
});
