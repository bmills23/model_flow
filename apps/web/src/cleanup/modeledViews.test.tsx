import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { toScenario, DEFAULT_FORM } from '../transport/form';
import { computeModeled } from './compute';
import { defaultCleanupForm } from './form';
import { buildModeledRows, type ModeledRowBuild } from './modeledBuild';
import { modeledCsvTablesAll } from './csv';
import { ModeledRowsView, ModeledUncertaintyView, type ModeledSolved } from './ModeledCleanup';

vi.mock('./ModeledSourceUncertainty', () => ({
  ModeledSourceUncertainty: (p: { name: string }) => <div data-testid="panel">{p.name}</div>,
}));

const BENZENE = '71-43-2';
const TOLUENE = '108-88-3';
const WATER: PathwayId[] = ['waterIngestion', 'waterDermal'];

let db: ChemicalDb;
let rows: ModeledRowBuild[];
let solved: Map<string, ModeledSolved>;

function transport(K: string) {
  const r = toScenario({ ...DEFAULT_FORM, timeYr: '10', K });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return { scenario: r.scenario, label: 'test aquifer' };
}

function rowsFor(ids: string[], K = '10'): ModeledRowBuild[] {
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, WATER.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  return buildModeledRows(
    {
      ...f,
      chemicals: ids.map((id) => newChemicalRow(db.byId.get(id)!)),
      a: { ...f.a, pathways },
      source: 'dissolved',
    },
    db,
    (id) => ({ transport: { ...transport(K), chemicalId: id }, vadose: null, saturated: null }),
  );
}

const solve = (row: ModeledRowBuild): ModeledSolved => {
  if (!row.result.ok) throw new Error('row');
  const req = { ...row.result.request, only: 'modern' as const };
  // the held answer is for the row's own request; only the solve is limited to one method for speed
  return { req: row.result.request, item: { ok: true, outcome: computeModeled(req) } };
};

beforeAll(async () => {
  db = await loadChemicalDb();
  rows = rowsFor([BENZENE, TOLUENE]);
  solved = new Map(rows.map((r) => [r.id, solve(r)]));
}, 120000);

const view = (over: Partial<Parameters<typeof ModeledRowsView>[0]> = {}) => (
  <ModeledRowsView
    rows={rows}
    solved={solved}
    computing={false}
    progress={null}
    solveError={null}
    feeds={[]}
    {...over}
  />
);

describe('modeled cleanup results view', () => {
  it('greys only the chemical being solved again and keeps the download for the current ones', () => {
    // toluene's inputs changed: its held solve answers an older request than its row now builds
    const toluene2 = rowsFor([BENZENE, TOLUENE], '40')[1]!;
    const nowRows = [rows[0]!, toluene2];
    const { container } = render(view({ rows: nowRows, computing: true }));
    const [b, t] = [...container.querySelectorAll('.modeled-chemical')];
    expect(b!.querySelector('.stale')).toBeNull();
    expect(t!.querySelector('.stale')).not.toBeNull();
    // the file would hold benzene's current tables, so it stays usable; the older solve is left out
    const buttons = screen.getAllByRole('button', { name: /download csv/i });
    expect(buttons.map((x) => x.textContent)).toEqual([
      expect.stringContaining('Benzene'),
      expect.stringContaining('Benzene'),
    ]);
    for (const x of buttons) expect((x as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables the download while nothing it would export is current', () => {
    const toluene2 = rowsFor([TOLUENE], '40')[0]!;
    render(
      view({
        rows: [toluene2],
        solved: new Map([[TOLUENE, solved.get(TOLUENE)!]]),
        computing: true,
      }),
    );
    for (const x of screen.getAllByRole('button', { name: /download csv/i }))
      expect((x as HTMLButtonElement).disabled).toBe(true);
  });

  it('nests the sections of each chemical under its heading when several are shown', () => {
    const { container } = render(view());
    for (const block of container.querySelectorAll('.modeled-chemical')) {
      expect(within(block as HTMLElement).getAllByRole('heading', { level: 2 })).toHaveLength(1);
      expect(
        within(block as HTMLElement).getAllByRole('heading', { level: 3 }).length,
      ).toBeGreaterThan(1);
    }
    expect(container.querySelectorAll('h2')).toHaveLength(2);
  });

  it('keeps the flat outline for a single chemical', () => {
    const only = new Map([[BENZENE, solved.get(BENZENE)!]]);
    const { container } = render(view({ rows: [rows[0]!], solved: only }));
    expect(container.querySelectorAll('h2').length).toBeGreaterThan(1);
    expect(container.querySelectorAll('.modeled-chemical > h2')).toHaveLength(0);
  });

  it('tags each CSV table with its chemical so stale marks cannot attach to another', () => {
    const entries = rows.map((r) => {
      const item = solved.get(r.id)!.item;
      if (!item.ok) throw new Error('solve');
      return { id: r.id, name: r.name, outcome: item.outcome };
    });
    const tables = modeledCsvTablesAll(entries);
    expect(tables.map((t) => t.chemicalId)).toEqual([BENZENE, BENZENE, TOLUENE, TOLUENE]);
    expect(modeledCsvTablesAll(entries.slice(1)).map((t) => t.chemicalId)).toEqual([
      TOLUENE,
      TOLUENE,
    ]);
  });
});

describe('modeled probabilistic chemical select', () => {
  it('offers each solved chemical and samples the one chosen', () => {
    render(<ModeledUncertaintyView rows={rows} solved={solved} pending={false} feeds={[]} />);
    const select = screen.getByLabelText(/chemical for the probabilistic cleanup level/i);
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Benzene', 'Toluene']);
    expect(screen.getByTestId('panel').textContent).toBe('Benzene');
    fireEvent.change(select, { target: { value: TOLUENE } });
    expect(screen.getByTestId('panel').textContent).toBe('Toluene');
  });

  it('shows no select for one solved chemical, and leaves out one that is not solved', () => {
    const only = new Map([[BENZENE, solved.get(BENZENE)!]]);
    render(<ModeledUncertaintyView rows={rows} solved={only} pending={false} feeds={[]} />);
    expect(screen.queryByLabelText(/chemical for the probabilistic cleanup level/i)).toBeNull();
    expect(screen.getByTestId('panel').textContent).toBe('Benzene');
  });
});
