import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CleanupPage } from './CleanupPage';
import { clearTransportFeed, setTransportFeed } from '../transport/chainFeed';
import { toScenario } from '../transport/form';
import { REGRESSION_FORM as DEFAULT_FORM } from '../transport/regression.testkit';
import {
  currentProject,
  forgetMemory,
  getModeledLevels,
  getScreen,
  addChemical as addProjectChemical,
  newProject,
  setScreen,
} from '../project/store';
import { computeResults } from '../report/results';
import { newChemicalRow } from '../risk/form';
import { userRecord } from '../overrides/userChemicals';

afterEach(() => {
  cleanup();
  clearTransportFeed();
  forgetMemory();
  newProject();
});

async function withBenzene() {
  render(<CleanupPage />);
  await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
  fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: '71-43-2' } });
  fireEvent.click(await screen.findByRole('button', { name: /add benzene/i }));
}

function hold(): void {
  const r = toScenario({ ...DEFAULT_FORM, timeYr: '10' });
  if (!r.ok) throw new Error(r.errors.join('; '));
  act(() => setTransportFeed({ scenario: r.scenario, label: 'test aquifer' }));
}

describe('CleanupPage modeled sources', () => {
  it('asks for the groundwater screen when no aquifer is held', async () => {
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    expect(await screen.findByText(/press "use for cleanup levels"/i)).toBeTruthy();
  }, 40000);

  it('solves a dissolved source to the database MCL at the well and charts it', async () => {
    hold();
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    fireEvent.click(screen.getByRole('radio', { name: /concentration at the well/i }));
    expect(screen.getByText(/uses the mcl of benzene: 5 ug\/l/i)).toBeTruthy();
    const region = await screen.findByRole(
      'region',
      { name: /modeled cleanup level, modern/i },
      { timeout: 60000 },
    );
    expect(within(region).getByText(/concentration at the well/i, { selector: 'td' })).toBeTruthy();
    expect(within(region).getByText(/solved by/i)).toBeTruthy();
    expect(within(region).getByText(/residual/i)).toBeTruthy();
    expect(
      within(region).getByRole('img', { name: /against the source concentration/i }),
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: /modeled cleanup level, legacy/i })).toBeTruthy();
  }, 120000);

  it('offers the modeled-source probabilistic panel once the level is solved', async () => {
    hold();
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    const panel = await screen.findByRole(
      'region',
      { name: /probabilistic cleanup level, modeled source/i },
      { timeout: 60000 },
    );
    expect(within(panel).getByRole('group', { name: /seepage velocity/i })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: /run probabilistic cleanup/i })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /^probabilistic cleanup level$/i })).toBeNull();
  }, 120000);

  it('reports a target the source cannot reach under the solubility ceiling', async () => {
    hold();
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    fireEvent.click(screen.getByRole('radio', { name: /concentration at the well/i }));
    fireEvent.change(screen.getByLabelText(/solubility ceiling/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/well concentration target/i), {
      target: { value: '1000' },
    });
    const region = await screen.findByRole(
      'region',
      { name: /modeled cleanup level, modern/i },
      { timeout: 60000 },
    );
    expect(within(region).getByText(/not reached/i, { selector: 'strong' })).toBeTruthy();
    expect(within(region).getByText(/no cleanup level to report/i)).toBeTruthy();
  }, 120000);
});

describe('CleanupPage solubility ceiling', () => {
  async function add(query: string, name: RegExp) {
    fireEvent.change(screen.getByLabelText(/find a chemical/i), { target: { value: query } });
    fireEvent.click(await screen.findByRole('button', { name }));
  }

  it('defaults each chemical to its database solubility and says where the value came from', async () => {
    render(<CleanupPage />);
    await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
    await add('108-88-3', /add toluene/i);
    await add('1330-20-7', /add xylenes/i);
    const list = await screen.findByRole('list', { name: /solubility used for each chemical/i });
    const text = list.textContent ?? '';
    expect(text).toMatch(
      /Toluene: 526 mg\/L \(aqueous solubility from the EPA Regional Screening Levels/,
    );
    expect(text).toMatch(/Xylenes[^:]*: 106 mg\/L/);
    expect(text).toContain('2024-11');
    // the box is there for every source, blank by default, and says a typed value wins
    const box = screen.getByLabelText(/solubility ceiling/i) as HTMLInputElement;
    expect(box.value).toBe('');
    fireEvent.change(box, { target: { value: '300' } });
    expect((await screen.findByRole('list', { name: /solubility used/i })).textContent).toMatch(
      /Toluene: 300 mg\/L \(a ceiling entered on the cleanup screen\)/,
    );
  }, 60000);
});

describe('CleanupPage solubility of a user-defined chemical', () => {
  it('uses the solubility the user entered for it and says so, instead of saying the database gives none', async () => {
    const mine = {
      id: 'user-1',
      name: 'Site solvent',
      values: {
        rfdo: { value: '0.02', note: 'lab memo' },
        s: { value: '42', note: 'measured at the site' },
      },
    };
    const other = {
      id: 'user-2',
      name: 'Other solvent',
      values: { rfdo: { value: '0.02', note: 'lab memo' } },
    };
    act(() => {
      addProjectChemical(mine);
      addProjectChemical(other);
      const c = getScreen('cleanup');
      setScreen('cleanup', {
        ...c,
        form: {
          ...c.form,
          chemicals: [newChemicalRow(userRecord(mine)), newChemicalRow(userRecord(other))],
        },
      });
    });
    render(<CleanupPage />);
    const list = await screen.findByRole('list', { name: /solubility used for each chemical/i });
    await waitFor(() => expect(list.textContent).not.toMatch(/loading the database solubility/));
    expect(list.textContent).toMatch(/Site solvent: 42 mg\/L \(a solubility entered by the user/);
    expect(list.textContent).toMatch(/Other solvent: no solubility was entered for this chemical/);
    expect(list.textContent).not.toMatch(/the database gives no solubility/);
  }, 60000);
});

describe('CleanupPage keeps the modeled levels with the project', () => {
  it('saves the solved levels and the report prints them while the inputs match, then calls them out of date', async () => {
    hold();
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    fireEvent.click(screen.getByRole('radio', { name: /concentration at the well/i }));
    await screen.findByRole(
      'region',
      { name: /modeled cleanup level, modern/i },
      { timeout: 60000 },
    );
    await waitFor(() => expect(getModeledLevels()['71-43-2']).toBeDefined(), { timeout: 10000 });
    const kept = getModeledLevels()['71-43-2']!;
    expect(kept.chemical).toBe('Benzene');
    expect(kept.methods.modern).toMatchObject({ ok: true });
    expect(kept.fingerprint).toMatch(/^[0-9a-f]{8}$/);

    // the saved project carries the levels, and a reload of its text brings them back
    const text = JSON.stringify(currentProject());
    const reread = JSON.parse(text) as { modeledLevels?: Record<string, unknown> };
    expect(Object.keys(reread.modeledLevels ?? {})).toEqual(['71-43-2']);

    const r = await computeResults(currentProject());
    const sec = r['cleanup']!;
    const table = sec.tables.find((t) => t.name === 'cleanup-modeled-levels');
    expect(table, sec.notes.join(' ')).toBeDefined();
    expect(table!.rows.length).toBeGreaterThan(0);
    expect(sec.notes.join(' ')).not.toMatch(/out of date|not been solved|not computed/i);

    // an input of the solve changes: the kept levels no longer match
    const edited = JSON.parse(text) as { screens: { cleanup: { form: Record<string, unknown> } } };
    edited.screens.cleanup.form['targetRisk'] = '1e-4';
    const again = await computeResults(edited as never);
    expect(
      again['cleanup']!.tables.find((t) => t.name === 'cleanup-modeled-levels'),
    ).toBeUndefined();
    expect(again['cleanup']!.notes.join(' ')).toMatch(/out of date/i);
  }, 180000);

  it('does not keep a solve made through a groundwater run that is out of date', async () => {
    hold();
    await withBenzene();
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    fireEvent.click(screen.getByRole('radio', { name: /concentration at the well/i }));
    await screen.findByRole(
      'region',
      { name: /modeled cleanup level, modern/i },
      { timeout: 60000 },
    );
    await waitFor(() => expect(getModeledLevels()['71-43-2']).toBeDefined(), { timeout: 10000 });
    const first = getModeledLevels()['71-43-2']!.fingerprint;
    // the groundwater screen's inputs change after the run was sent: the run is out of date
    act(() => {
      const t = getScreen('transport');
      setScreen('transport', { ...t, form: { ...t.form, K: '77' } });
    });
    await new Promise((r) => setTimeout(r, 700));
    expect(getModeledLevels()['71-43-2']!.fingerprint).toBe(first);
    const r = await computeResults(currentProject());
    expect(r['cleanup']!.tables.find((t) => t.name === 'cleanup-modeled-levels')).toBeUndefined();
    expect(r['cleanup']!.notes.join(' ')).toMatch(/out of date/i);
  }, 180000);
});
