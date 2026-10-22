import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addChemical, forgetMemory, getScreen, newProject } from '../project/store';
import { loadVaporChemicals } from '../vapor/chemicals';
import { clearSaturatedFeed, getSaturatedFeed, getSaturatedFeedSlots } from './feed';
import { SaturatedPage } from './SaturatedPage';

const BENZENE = '71-43-2';
const TOLUENE = '108-88-3';
const OUTSIDE = '0000-00-0';

beforeEach(() => {
  forgetMemory();
  newProject();
});
afterEach(() => {
  clearSaturatedFeed();
  forgetMemory();
});

/** Waits until the page has received the fate rows. */
async function loaded() {
  let rows: Awaited<ReturnType<typeof loadVaporChemicals>> = [];
  await act(async () => {
    rows = await loadVaporChemicals();
  });
  return rows;
}

async function sendEnabled(name: RegExp): Promise<void> {
  const button = await screen.findByRole('button', { name }, { timeout: 30000 });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false), {
    timeout: 30000,
  });
  fireEvent.click(button);
}

const picker = (): HTMLSelectElement => screen.getByLabelText('Chemical') as HTMLSelectElement;

describe('SaturatedPage chemical from the project list', () => {
  it('lists the project chemicals by name, saves the pick and fills the properties', async () => {
    addChemical({ id: BENZENE, name: 'Benzene' });
    addChemical({ id: TOLUENE, name: 'Toluene' });
    render(<SaturatedPage />);
    expect([...picker().options].map((o) => o.text)).toEqual(['Not set', 'Benzene', 'Toluene']);
    const rows = await loaded();
    fireEvent.change(picker(), { target: { value: BENZENE } });
    const row = rows.find((c) => c.id === BENZENE)!;
    expect(getScreen('saturated').form.chemicalId).toBe(BENZENE);
    expect((screen.getByLabelText(/^koc/i) as HTMLInputElement).value).toBe(
      String(row.rsl.koc!.value),
    );
  }, 60000);

  it('shows a list chemical outside the fate data as unavailable, with the reason, and keeps the pointer', async () => {
    addChemical({ id: OUTSIDE, name: 'Mystery solvent' });
    render(<SaturatedPage />);
    await loaded();
    const koc = (screen.getByLabelText(/^koc/i) as HTMLInputElement).value;
    fireEvent.change(picker(), { target: { value: OUTSIDE } });
    expect(
      await screen.findByText(/Mystery solvent is not in the fate property data/i),
    ).toBeTruthy();
    expect(getScreen('saturated').form.chemicalId).toBe(OUTSIDE);
    expect((screen.getByLabelText(/^koc/i) as HTMLInputElement).value).toBe(koc);
  }, 60000);

  it('with an empty list shows the pointer to the chemicals screen instead of a select', () => {
    render(<SaturatedPage />);
    expect(screen.queryByLabelText('Chemical')).toBeNull();
    expect(screen.getByRole('link', { name: /chemicals screen/i }).getAttribute('href')).toBe(
      '#/chemicals',
    );
  }, 60000);

  it('sends to the slot of the chosen chemical and leaves the other chemical slot alone', async () => {
    addChemical({ id: BENZENE, name: 'Benzene' });
    addChemical({ id: TOLUENE, name: 'Toluene' });
    render(<SaturatedPage />);
    await loaded();
    fireEvent.change(picker(), { target: { value: BENZENE } });
    await sendEnabled(/use as groundwater source/i);
    fireEvent.change(picker(), { target: { value: TOLUENE } });
    await sendEnabled(/use as groundwater source/i);
    expect([...getSaturatedFeedSlots().keys()]).toEqual([BENZENE, TOLUENE]);
    expect(getSaturatedFeed(BENZENE)?.chemicalId).toBe(BENZENE);
    expect(getSaturatedFeed(TOLUENE)?.chemicalId).toBe(TOLUENE);
  }, 90000);
});
