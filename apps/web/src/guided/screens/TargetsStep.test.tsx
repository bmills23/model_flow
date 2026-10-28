import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addChemical, forgetMemory, getGuided, setGuided } from '../../project/store';
import { DISPERSIVITY } from '../forms.testkit';
import { defaultGuided, type GuidedState } from '../state';
import { TargetsStep } from './TargetsStep';

beforeEach(() => forgetMemory());
afterEach(() => {
  cleanup();
  forgetMemory();
});

const BENZENE = '71-43-2';
const MTBE = '1634-04-4';
const SLOW = { timeout: 30000 };

function chemicals(): void {
  addChemical({ id: BENZENE, name: 'Benzene' });
  addChemical({ id: MTBE, name: 'MTBE' });
}

/** Both chemicals measured in the groundwater at the tap. */
function measuredSite(patch?: (g: GuidedState) => void): void {
  chemicals();
  const g = defaultGuided();
  g.site = { ...g.site, basis: 'measured', measured: ['groundwater'] };
  g.sources[BENZENE] = { values: { groundwater: { value: '1', unit: 'mg/L' } }, note: '', tph: '' };
  g.sources[MTBE] = { values: { groundwater: { value: '3', unit: 'mg/L' } }, note: '', tph: '' };
  patch?.(g);
  setGuided(g);
}

/** A groundwater source carried to a well: the levels are solved through the transport model. */
function wellSite(patch?: (g: GuidedState) => void): void {
  chemicals();
  const g = defaultGuided();
  g.site = { ...g.site, sources: ['groundwater'], paths: { ...g.site.paths, well: true } };
  g.run = { timeYr: '32', stepYr: '1', sourceYr: '', basis: 'modern' };
  g.forms.transport = DISPERSIVITY;
  g.targets = { ...g.targets, mode: 'cleanup' };
  g.sources[BENZENE] = { values: { groundwater: { value: '2', unit: 'mg/L' } }, note: '', tph: '' };
  g.sources[MTBE] = { values: { groundwater: { value: '4', unit: 'mg/L' } }, note: '', tph: '' };
  patch?.(g);
  setGuided(g);
}

describe('TargetsStep, step 5', () => {
  it('asks for chemicals, then for a site model that works', () => {
    render(<TargetsStep />);
    expect(screen.getByText(/add at least one chemical/i)).toBeTruthy();
    cleanup();
    addChemical({ id: BENZENE, name: 'Benzene' });
    render(<TargetsStep />);
    expect(screen.getByText(/finish the site model/i)).toBeTruthy();
  });

  it('forward risk is live from the measured concentrations', async () => {
    measuredSite();
    render(<TargetsStep />);
    expect(screen.getByRole('heading', { level: 1, name: /risk or cleanup/i })).toBeTruthy();
    expect(await screen.findByRole('region', { name: /legacy versus modern/i }, SLOW)).toBeTruthy();
  });

  it('cleanup levels: the choice, targets and allocation are saved, and all together keeps the measured ratios', async () => {
    measuredSite();
    render(<TargetsStep />);
    fireEvent.click(screen.getByRole('radio', { name: /cleanup levels/i }));
    expect(getGuided().targets.mode).toBe('cleanup');
    fireEvent.change(screen.getByLabelText(/target cancer risk/i), { target: { value: '1e-5' } });
    expect(getGuided().targets.targetRisk).toBe('1e-5');
    fireEvent.click(screen.getByRole('radio', { name: /all chemicals together/i }));
    expect(getGuided().targets.allocation).toBe('cumulative');
    const panel = await screen.findByRole('region', { name: /cleanup levels, modern/i }, SLOW);
    expect(within(panel).getByText(/keep the ratios/i)).toBeTruthy();
    // no water standard without a well
    expect(screen.queryByRole('group', { name: /water standard/i })).toBeNull();
  });

  it('solves each chemical through the well path and keeps its levels with the project', async () => {
    wellSite();
    render(<TargetsStep />);
    await waitFor(
      () => expect(Object.keys(getGuided().levels ?? {}).sort()).toEqual([MTBE, BENZENE].sort()),
      SLOW,
    );
    const table = await screen.findByRole(
      'table',
      { name: /source levels through the groundwater path/i },
      SLOW,
    );
    expect(within(table).getAllByText('Benzene').length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/up to date/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/\bscreens?\b/i).map((e) => e.textContent)).toEqual([]);
  });

  it('a state standard is entered with its source, and a level above the solubility is flagged', async () => {
    wellSite();
    render(<TargetsStep />);
    const group = screen.getByRole('group', { name: /water standard for benzene/i });
    fireEvent.click(within(group).getByRole('radio', { name: /state standard/i }));
    expect(getGuided().targets.standards[BENZENE]?.unit).toBe('ug/L');
    fireEvent.change(within(group).getByLabelText(/unit of the state standard/i), {
      target: { value: 'mg/L' },
    });
    fireEvent.change(within(group).getByLabelText(/state standard value/i), {
      target: { value: '5000' },
    });
    expect(getGuided().targets.standards[BENZENE]).toMatchObject({
      kind: 'state',
      value: '5000',
      unit: 'mg/L',
      source: '',
    });
    expect(within(group).getByText(/name the source/i)).toBeTruthy();
    fireEvent.change(within(group).getByLabelText(/source of the standard/i), {
      target: { value: 'State rule 7' },
    });
    expect(getGuided().targets.standards[BENZENE]?.source).toBe('State rule 7');
    expect(await screen.findAllByText(/above the solubility/i, {}, SLOW)).not.toHaveLength(0);
  });

  it('all together: a chemical not detected at the source is not quantified, with the reason', async () => {
    wellSite((g) => {
      g.targets.allocation = 'cumulative';
      g.sources[MTBE] = {
        values: { groundwater: { value: 'ND', unit: 'mg/L' } },
        note: '',
        tph: '',
      };
    });
    render(<TargetsStep />);
    expect(
      (await screen.findAllByText(/not detected at the source/i, {}, SLOW)).length,
    ).toBeGreaterThan(0);
  });
});
