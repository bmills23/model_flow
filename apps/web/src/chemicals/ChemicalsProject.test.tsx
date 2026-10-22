import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { addChemical, forgetMemory, getChemicals, getScreen, newProject } from '../project/store';
import { ChemicalsPage } from './ChemicalsPage';

beforeEach(() => {
  forgetMemory();
  newProject();
});

async function loaded() {
  render(<ChemicalsPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
}

describe('ChemicalsPage and the project chemical list', () => {
  it('shows the project list, empty at first with a pointer to adding', async () => {
    await loaded();
    const section = screen.getByRole('region', { name: /project chemicals/i });
    expect(within(section).getByText(/no chemicals in the project yet/i)).toBeTruthy();
  }, 30000);

  it('"Add to project" puts a searched chemical on the list, once, and the list shows it', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: '71-43-2' } });
    const add = await screen.findByRole('button', { name: /^add to project: benzene$/i });
    fireEvent.click(add);
    expect(getChemicals()).toEqual([{ id: '71-43-2', name: 'Benzene' }]);
    const section = screen.getByRole('region', { name: /project chemicals/i });
    expect(within(section).getByText('Benzene')).toBeTruthy();
    const done = screen.getByRole('button', { name: /^in the project: benzene$/i });
    expect((done as HTMLButtonElement).disabled).toBe(true);
  }, 30000);

  it('a chemical already on the list shows as in the project', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    await loaded();
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: '71-43-2' } });
    expect(await screen.findByRole('button', { name: /^in the project: benzene$/i })).toBeTruthy();
  }, 30000);

  it('removing asks first, names what is lost, and clears the chemical from the project', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    addChemical({ id: '108-88-3', name: 'Toluene' });
    await loaded();
    const section = screen.getByRole('region', { name: /project chemicals/i });
    fireEvent.click(within(section).getByRole('button', { name: /^remove toluene$/i }));
    const ask = screen.getByRole('group', { name: /remove toluene from the project/i });
    expect(ask.textContent).toMatch(/exposure and risk/i);
    expect(getChemicals()).toHaveLength(2);
    fireEvent.click(within(ask).getByRole('button', { name: /remove from the project/i }));
    expect(getChemicals().map((c) => c.id)).toEqual(['71-43-2']);
    expect(getScreen('risk').form.chemicals.map((c) => c.id)).not.toContain('108-88-3');
    expect(within(section).queryByText('Toluene')).toBeNull();
  }, 30000);
});
