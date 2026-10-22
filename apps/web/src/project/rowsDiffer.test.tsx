import { readFileSync } from 'node:fs';
import { cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CleanupPage } from '../cleanup/CleanupPage';
import { RiskPage } from '../risk/RiskPage';
import { parseProject } from './index';
import {
  forgetMemory,
  getChemicals,
  getScreen,
  getStaleFeeds,
  getStaleSlots,
  loadProject,
  newProject,
} from './store';

const text = readFileSync(`${process.cwd()}/src/project/fixtures/project-rows-differ.json`, 'utf8');

/**
 * A project from before the screens followed the list: the risk rows (benzene, toluene) and the cleanup
 * rows (toluene, ethylbenzene) differ, and the file has no chemical list.
 */
describe('an older project whose risk and cleanup rows differed', () => {
  beforeEach(() => {
    cleanup();
    forgetMemory();
    newProject();
    const r = parseProject(text);
    if (!r.ok) throw new Error('fixture does not parse');
    loadProject(r.project, r.droppedFeeds ?? []);
  });

  it('opens with the union as the project list', () => {
    expect(getChemicals().map((c) => c.id)).toEqual(['71-43-2', '108-88-3', '100-41-4']);
  });

  it('shows all three chemicals on the risk screen, keeping the state each row had', async () => {
    const before = getStaleSlots();
    render(<RiskPage />);
    await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
    const benzene = await screen.findByRole('group', { name: /^benzene\b/i });
    const toluene = screen.getByRole('group', { name: /^toluene\b/i });
    const ethyl = screen.getByRole('group', { name: /^ethylbenzene\b/i });
    // benzene takes its groundwater from the well, so its field is not shown; the row keeps both
    expect(within(benzene).queryByLabelText(/groundwater \(mg\/L\)/i)).toBeNull();
    expect(getScreen('risk').form.chemicals.find((c) => c.id === '71-43-2')?.conc).toEqual({
      groundwater: '0.005',
    });
    expect((within(toluene).getByLabelText(/soil \(mg\/kg\)/i) as HTMLInputElement).value).toBe(
      '2',
    );
    expect(within(ethyl).getByText(/nothing set for this chemical/i)).toBeTruthy();
    expect(
      getScreen('risk').form.chemicals.find((c) => c.id === '71-43-2')?.groundwaterFromWell,
    ).toBe(true);
    expect(getStaleSlots()).toEqual(before);
  }, 30000);

  it('shows all three on the cleanup screen with its own state, and marks no feed stale', async () => {
    render(<CleanupPage />);
    await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
    await screen.findByRole('group', { name: /^benzene\b/i });
    expect(screen.getByRole('group', { name: /^toluene\b/i })).toBeTruthy();
    expect(screen.getByRole('group', { name: /^ethylbenzene\b/i })).toBeTruthy();
    const rows = getScreen('cleanup').form.chemicals;
    expect(rows.map((c) => c.id).sort()).toEqual(['100-41-4', '108-88-3', '71-43-2']);
    expect(rows.find((c) => c.id === '108-88-3')?.conc).toEqual({ soil: '7' });
    expect(rows.find((c) => c.id === '100-41-4')?.conc).toEqual({ groundwater: '0.3' });
    expect(getStaleFeeds()).toEqual([]);
  }, 30000);
});
