import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { buildCleanup, type CleanupLegacyInput } from './build';
import { CleanupUncertainty } from './CleanupUncertainty';
import { defaultCleanupForm } from './form';

let db: ChemicalDb;
let input: CleanupLegacyInput;
beforeAll(async () => {
  db = await loadChemicalDb();
  const f = defaultCleanupForm();
  const on: PathwayId[] = ['waterIngestion', 'waterDermal'];
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, on.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  const r = buildCleanup(
    { ...f, chemicals: [newChemicalRow(db.byId.get('71-43-2')!)], a: { ...f.a, pathways } },
    db,
  );
  if (!r.ok) throw new Error(r.errors.join('; '));
  input = r.legacy;
}, 30000);

function clock(stepMs: number): () => number {
  let t = 0;
  return () => (t += stepMs);
}

function sampleBodyWeight() {
  const row = screen.getByRole('group', { name: /body weight/i });
  fireEvent.change(within(row).getByLabelText(/distribution/i), { target: { value: 'uniform' } });
  fireEvent.change(within(row).getByLabelText(/minimum/i), { target: { value: '50' } });
  fireEvent.change(within(row).getByLabelText(/maximum/i), { target: { value: '100' } });
}

const runButton = () => screen.getByRole('button', { name: /run probabilistic cleanup/i });

describe('CleanupUncertainty', () => {
  it('will not run until an input has a distribution', () => {
    render(<CleanupUncertainty input={input} names={{ '71-43-2': 'Benzene' }} />);
    expect((runButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText(/protect/i)).toBeTruthy();
  });

  it('runs, reports the protective levels in the screen unit and draws the charts', async () => {
    render(<CleanupUncertainty input={input} names={{ '71-43-2': 'Benzene' }} />);
    sampleBodyWeight();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '200' } });
    expect((screen.getByLabelText(/seed/i) as HTMLInputElement).value).toBe('model-flow');
    fireEvent.click(runButton());
    const table = await screen.findByRole('table', { name: /protective cleanup levels/i });
    expect(within(table).getAllByRole('row').length).toBe(4);
    expect(table.textContent).toMatch(/95/);
    expect(table.textContent).toMatch(/mg\/L/);
    expect(
      screen.getByRole('img', { name: /cumulative distribution of the output/i }),
    ).toBeTruthy();
    expect(screen.getByRole('img', { name: /histogram/i })).toBeTruthy();
    expect(screen.getByRole('img', { name: /spearman/i })).toBeTruthy();
    expect(screen.getByText(/200 of 200 iterations/i)).toBeTruthy();
  });

  it('refuses a protection fraction outside 0 to 100 percent', async () => {
    render(<CleanupUncertainty input={input} names={{}} />);
    sampleBodyWeight();
    fireEvent.change(screen.getByLabelText(/protect/i), { target: { value: '100' } });
    fireEvent.click(runButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/between 0 and 100/i);
  });

  it('asks before a run projected above 60 s and stops when declined', async () => {
    render(<CleanupUncertainty input={input} names={{}} now={clock(1000)} />);
    sampleBodyWeight();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '500' } });
    fireEvent.click(runButton());
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await screen.findByText(/run was cancelled/i);
    expect(screen.queryByRole('table', { name: /protective cleanup levels/i })).toBeNull();
  });

  it('refuses a run projected above 10 minutes', async () => {
    render(<CleanupUncertainty input={input} names={{}} now={clock(100000)} />);
    sampleBodyWeight();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '500' } });
    fireEvent.click(runButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/run-budget/);
  });

  it('marks the results stale when the scenario changes after a run', async () => {
    const { rerender } = render(<CleanupUncertainty input={input} names={{}} />);
    sampleBodyWeight();
    fireEvent.change(screen.getByLabelText(/iterations/i), { target: { value: '50' } });
    fireEvent.click(runButton());
    await screen.findByRole('table', { name: /protective cleanup levels/i });
    rerender(<CleanupUncertainty input={{ ...input }} names={{}} />);
    expect(screen.getByText(/scenario inputs changed/i)).toBeTruthy();
  });
});
