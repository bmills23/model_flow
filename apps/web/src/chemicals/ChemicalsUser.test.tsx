import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addChemical, forgetMemory, getChemicals, getScreen, newProject } from '../project/store';
import { browseCsvRows } from './browse';
import { userBrowseRecords } from '../overrides/userChemicals';
import { loadVaporChemicals } from '../vapor/chemicals';
import { VadosePage } from '../vadose/VadosePage';
import { ReportPage } from '../report/ReportPage';
import { ChemicalsPage } from './ChemicalsPage';

beforeEach(() => {
  forgetMemory();
  newProject();
});
afterEach(() => forgetMemory());

async function loaded() {
  render(<ChemicalsPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
}

const define = () =>
  fireEvent.click(screen.getByRole('button', { name: /define a new chemical/i }));
const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const editor = () => screen.getByRole('region', { name: /define a new chemical/i });

describe('defining a chemical on the chemicals page', () => {
  it('needs only a name', async () => {
    await loaded();
    define();
    type(/^name$/i, 'Site solvent');
    fireEvent.click(screen.getByRole('button', { name: /save chemical/i }));
    expect(getChemicals()).toEqual([{ id: 'user-1', name: 'Site solvent', values: {} }]);
    const section = screen.getByRole('region', { name: /project chemicals/i });
    expect(within(section).getByText('Site solvent')).toBeTruthy();
  }, 30000);

  it('says in the editor why a chemical is not saved when the project has filled up meanwhile', async () => {
    await loaded();
    define();
    type(/^name$/i, 'Site solvent');
    act(() => {
      for (let i = 0; i < 50; i++) addChemical({ id: `fill-${i}`, name: `Fill ${i}` });
    });
    fireEvent.click(screen.getByRole('button', { name: /save chemical/i }));
    expect(getChemicals().length).toBe(50);
    expect(within(editor()).getByRole('alert').textContent).toMatch(/50 chemicals/i);
    expect(within(editor()).getByRole('alert').textContent).toMatch(/remove one/i);
  }, 30000);

  it('refuses a value without a note and saves nothing', async () => {
    await loaded();
    define();
    type(/^name$/i, 'Site solvent');
    type(/^oral reference dose value/i, '0.02');
    fireEvent.click(screen.getByRole('button', { name: /save chemical/i }));
    expect(within(editor()).getByRole('alert').textContent).toMatch(/source note is required/i);
    expect(getChemicals()).toEqual([]);
    type(/^oral reference dose source note/i, 'site toxicologist memo');
    fireEvent.click(screen.getByRole('button', { name: /save chemical/i }));
    expect(getChemicals()[0]!.values).toEqual({
      rfdo: { value: '0.02', note: 'site toxicologist memo' },
    });
  }, 30000);

  it('refuses a CAS number the database holds, pointing at the overrides', async () => {
    await loaded();
    define();
    type(/^name$/i, 'My benzene');
    type(/^cas number/i, '71-43-2');
    fireEvent.click(screen.getByRole('button', { name: /save chemical/i }));
    const alert = within(editor()).getByRole('alert').textContent ?? '';
    expect(alert).toMatch(/already benzene/i);
    expect(alert).toMatch(/overrides/i);
    expect(getChemicals()).toEqual([]);
  }, 30000);

  it('starts a copy of a database chemical with a provenance note on each copied value', async () => {
    await loaded();
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: '71-43-2' } });
    fireEvent.click(
      await screen.findByRole('button', { name: /^copy as a new chemical: benzene$/i }),
    );
    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe('Benzene (copy)');
    expect((screen.getByLabelText(/^cas number/i) as HTMLInputElement).value).toBe('');
    const note = screen.getByLabelText(/^oral slope factor source note/i) as HTMLInputElement;
    expect(note.value).toMatch(/Copied from the EPA RSL tables, edition/);
    fireEvent.click(screen.getByRole('button', { name: /save chemical/i }));
    const saved = getChemicals()[0]!;
    expect(saved.id).toBe('user-1');
    expect(saved.values!['sfo']!.note).toMatch(/Benzene/);
  }, 30000);

  it('edits a user chemical in place', async () => {
    addChemical({ id: 'user-1', name: 'Site solvent', values: {} });
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /^edit site solvent$/i }));
    type(/^name$/i, 'Site solvent B');
    fireEvent.click(screen.getByRole('button', { name: /save chemical/i }));
    expect(getChemicals()).toEqual([{ id: 'user-1', name: 'Site solvent B', values: {} }]);
  }, 30000);
});

describe('user chemicals elsewhere', () => {
  it('the chemical table writes each value with source user and its note', () => {
    const rows = browseCsvRows(
      userBrowseRecords([
        {
          id: 'user-1',
          name: 'Site solvent',
          cas: '999-99-5',
          values: { rfdo: { value: '0.02', note: 'memo' } },
        },
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      chemical: 'Site solvent',
      cas: '999-99-5',
      property: 'Oral reference dose',
      value: 0.02,
    });
    expect(String(rows[0]!.source)).toMatch(/^User value \(this project\): memo$/);
  });

  it('the report lists each user chemical with every value and its note', () => {
    addChemical({
      id: 'user-1',
      name: 'Site solvent',
      values: { rfdo: { value: '0.02', note: 'site toxicologist memo' } },
    });
    render(<ReportPage />);
    expect(screen.getByRole('heading', { name: /chemicals defined by the user/i })).toBeTruthy();
    const cell = screen.getByText('site toxicologist memo');
    const row = cell.closest('tr')!;
    expect(row.textContent).toMatch(/Site solvent/);
    expect(row.textContent).toMatch(/0\.02/);
    expect(row.textContent).toMatch(/user/);
  });

  it('a fate screen names the property a user chemical lacks', async () => {
    addChemical({
      id: 'user-1',
      name: 'Site solvent',
      values: { koc: { value: '150', note: 'measured' } },
    });
    render(<VadosePage />);
    await act(async () => {
      await loadVaporChemicals();
    });
    fireEvent.change(screen.getByLabelText('Chemical'), { target: { value: 'user-1' } });
    expect(getScreen('vadose').form.chemicalId).toBe('user-1');
    expect((screen.getByLabelText(/^koc/i) as HTMLInputElement).value).toBe('150');
    const msg = screen.getByText(/has no usable/i).textContent ?? '';
    expect(msg).toMatch(/Molar mass/);
    expect(msg).toMatch(/Solubility/);
    expect(msg).not.toMatch(/Koc/);
  }, 60000);
});
