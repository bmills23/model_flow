import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultGuided, type GuidedState } from '../state';
import { ToxicityStep } from './ToxicityStep';
import { addChemical, forgetMemory, getGuided, getOverrides, setGuided } from '../../project/store';

beforeEach(() => forgetMemory());
afterEach(() => {
  cleanup();
  forgetMemory();
});

const LOAD = { timeout: 20000 };
const start = (patch: (g: GuidedState) => void): void => {
  const g = defaultGuided();
  g.site.basis = 'measured';
  g.site.measured = ['soil'];
  patch(g);
  setGuided(g);
};

describe('ToxicityStep, 4c', () => {
  it('asks for chemicals first, then for a ticked pathway', () => {
    start(() => undefined);
    render(<ToxicityStep />);
    expect(screen.getByText(/add at least one chemical/i)).toBeTruthy();
    cleanup();
    addChemical({ id: '71-43-2', name: 'Benzene' });
    start((g) => {
      g.exposure.pathways = { soilIngestion: false, soilDermal: false };
    });
    render(<ToxicityStep />);
    expect(screen.getByRole('status').textContent).toMatch(/no toxicity value is needed yet/i);
  });

  it('lists only the oral values for soil contact, with sources, and no inhalation basis', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    start(() => undefined);
    render(<ToxicityStep />);
    const table = await screen.findByRole('table', { name: /toxicity values of benzene/i }, LOAD);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('rowheader')[0]!.textContent)).toEqual([
      expect.stringMatching(/oral slope factor/i),
      expect.stringMatching(/oral reference dose/i),
    ]);
    expect(screen.queryByRole('region', { name: /inhalation basis/i })).toBeNull();
    expect(screen.queryByLabelText(/your value for inhalation/i)).toBeNull();
  });

  it('shows the inhalation basis as text that follows the 3d method, with no control of its own', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    start((g) => {
      g.site.measured = ['indoorAir'];
    });
    render(<ToxicityStep />);
    const basis = screen.getByRole('region', { name: /inhalation basis/i });
    expect(basis.textContent).toMatch(/modern method.*unit risk and reference concentration/i);
    expect(basis.textContent).toMatch(/check.*slope factor and reference dose/i);
    expect(within(basis).queryByRole('radio')).toBeNull();
    expect(within(basis).queryByRole('checkbox')).toBeNull();
    await screen.findByRole('table', { name: /toxicity values of benzene/i }, LOAD);
    const g = getGuided();
    setGuided({ ...g, run: { ...g.run, basis: 'legacy' } });
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /inhalation basis/i }).textContent).toMatch(
        /legacy method.*slope factor and reference dose/i,
      ),
    );
  });

  it('names the exposure input a pathway lacks, not a bare missing toxicity value (M3)', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    start((g) => {
      g.run.basis = 'legacy';
    });
    render(<ToxicityStep />);
    const missing = await screen.findByRole('alert', { name: /missing inputs/i }, LOAD);
    expect(missing.textContent).toMatch(/Receptor A has no soil skin area \(cm2\)/i);
    expect(missing.textContent).toMatch(/soil dermal contact needs/i);
    expect(
      within(missing)
        .getAllByRole('link', { name: /step 4b/i })[0]!
        .getAttribute('href'),
    ).toBe('#/step/receptors');
  });

  it('keeps a value typed for a needed field with its note', async () => {
    addChemical({ id: '71-43-2', name: 'Benzene' });
    start(() => undefined);
    render(<ToxicityStep />);
    await screen.findByRole('table', { name: /toxicity values of benzene/i }, LOAD);
    const panel = document.querySelector('details.override-panel') as HTMLDetailsElement;
    panel.open = true;
    fireEvent.change(within(panel).getByLabelText(/your value for oral slope factor/i), {
      target: { value: '0.5' },
    });
    fireEvent.change(within(panel).getAllByLabelText(/source note \(required\)/i)[0]!, {
      target: { value: 'State value' },
    });
    expect(getOverrides().toxicity['71-43-2']?.['sfo']).toEqual({
      value: '0.5',
      note: 'State value',
    });
    expect(await screen.findByText(/user value \(this project\) \(edited\)/i)).toBeTruthy();
  });
});
