import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { addChemical, forgetMemory, getChemicals, newProject } from '../../project/store';
import { MAX_PROJECT_CHEMICALS } from '../../chemicals/browse';
import { ChemicalsStep } from './ChemicalsStep';

beforeEach(() => {
  forgetMemory();
  newProject();
});

async function loaded() {
  render(<ChemicalsStep />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
}

describe('ChemicalsStep', () => {
  it('names the step and shows the project list and the database as two lists', async () => {
    await loaded();
    expect(screen.getByRole('heading', { level: 1, name: /chemicals of concern/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /project chemicals/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /chemical database/i })).toBeTruthy();
  }, 30000);

  it('searching benzene lists the exact name first; Add then Remove changes the project', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'benzene' } });
    const db = screen.getByRole('region', { name: /chemical database/i });
    const first = within(db).getAllByRole('listitem')[0]!;
    expect(first.textContent).toMatch(/^Benzene/);
    fireEvent.click(within(first).getByRole('button', { name: /^add to project: benzene$/i }));
    expect(getChemicals().map((c) => c.id)).toEqual(['71-43-2']);
    const list = screen.getByRole('region', { name: /project chemicals/i });
    fireEvent.click(within(list).getByRole('button', { name: /^remove benzene$/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove from the project/i }));
    expect(getChemicals()).toEqual([]);
  }, 30000);

  it('stops at 50 chemicals, says so, and Add is disabled until one is removed', async () => {
    for (let i = 0; i < MAX_PROJECT_CHEMICALS; i++)
      addChemical({ id: `x-${i}`, name: `Fake ${i}` });
    await loaded();
    const list = screen.getByRole('region', { name: /project chemicals/i });
    expect(list.textContent).toMatch(/50 of 50/);
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: '71-43-2' } });
    const add = await screen.findByRole('button', { name: /^add to project: benzene$/i });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(add);
    expect(getChemicals()).toHaveLength(MAX_PROJECT_CHEMICALS);
    fireEvent.click(within(list).getByRole('button', { name: /^remove fake 0$/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove from the project/i }));
    expect(
      (screen.getByRole('button', { name: /^add to project: benzene$/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  }, 30000);

  it('offers the chemical summary table as a download', async () => {
    await loaded();
    expect(screen.getByRole('button', { name: /download/i })).toBeTruthy();
  }, 30000);
});
