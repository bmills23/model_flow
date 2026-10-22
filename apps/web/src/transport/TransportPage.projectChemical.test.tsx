import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addChemical, forgetMemory, getScreen, newProject } from '../project/store';
import { loadVaporChemicals } from '../vapor/chemicals';
import { clearWellFeed, getWellFeed, getWellFeedSlots } from './wellFeed';
import { TransportPage } from './TransportPage';

const BENZENE = '71-43-2';
const TOLUENE = '108-88-3';
const OUTSIDE = '0000-00-0';

beforeEach(() => {
  forgetMemory();
  newProject();
});
afterEach(() => {
  clearWellFeed();
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
const SEND = /use as exposure well concentration/i;

describe('TransportPage chemical from the project list', () => {
  it('lists the project chemicals by name, saves the pick and fills Kd from Koc', async () => {
    addChemical({ id: BENZENE, name: 'Benzene' });
    addChemical({ id: TOLUENE, name: 'Toluene' });
    render(<TransportPage />);
    expect([...picker().options].map((o) => o.text)).toEqual(['Not set', 'Benzene', 'Toluene']);
    const rows = await loaded();
    fireEvent.change(picker(), { target: { value: BENZENE } });
    const koc = rows.find((c) => c.id === BENZENE)!.rsl.koc!.value;
    const form = getScreen('transport').form;
    expect(form.chemicalId).toBe(BENZENE);
    expect(form.retardMode).toBe('kd');
    expect(Number(form.kd)).toBeCloseTo(koc * Number(form.foc), 9);
  }, 60000);

  it('shows a list chemical outside the fate data as unavailable, with the reason, and keeps the pointer', async () => {
    addChemical({ id: OUTSIDE, name: 'Mystery solvent' });
    render(<TransportPage />);
    await loaded();
    const kd = getScreen('transport').form.kd;
    fireEvent.change(picker(), { target: { value: OUTSIDE } });
    expect(
      await screen.findByText(/Mystery solvent is not in the fate property data/i),
    ).toBeTruthy();
    expect(getScreen('transport').form.chemicalId).toBe(OUTSIDE);
    expect(getScreen('transport').form.kd).toBe(kd);
  }, 60000);

  it('with an empty list shows the pointer to the chemicals screen instead of a select', () => {
    render(<TransportPage />);
    expect(screen.queryByLabelText('Chemical')).toBeNull();
    expect(screen.getByRole('link', { name: /chemicals screen/i }).getAttribute('href')).toBe(
      '#/chemicals',
    );
  }, 60000);

  it('sends to the slot of the chosen chemical and leaves the other chemical slot alone', async () => {
    addChemical({ id: BENZENE, name: 'Benzene' });
    addChemical({ id: TOLUENE, name: 'Toluene' });
    render(<TransportPage />);
    await loaded();
    fireEvent.change(picker(), { target: { value: BENZENE } });
    await sendEnabled(SEND);
    fireEvent.change(picker(), { target: { value: TOLUENE } });
    await sendEnabled(SEND);
    expect([...getWellFeedSlots().keys()]).toEqual([BENZENE, TOLUENE]);
    expect(getWellFeed(BENZENE)?.chemicalId).toBe(BENZENE);
    expect(getWellFeed(TOLUENE)?.chemicalId).toBe(TOLUENE);
  }, 90000);
});
