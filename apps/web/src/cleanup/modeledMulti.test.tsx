import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { toScenario, DEFAULT_FORM } from '../transport/form';
import { clearTransportFeed, setTransportFeed, type TransportFeed } from '../transport/chainFeed';
import { addChemical, forgetMemory, getScreen, setScreen } from '../project/store';
import { buildModeled, buildModeledRows, type Feeds } from './modeledBuild';
import { computeModeled } from './compute';
import { defaultCleanupForm, type CleanupForm } from './form';
import { modeledCsvTablesAll } from './csv';
import { CleanupPage } from './CleanupPage';
import { solveAll, type ModeledItem } from './modeledSolve';
import type { ModeledRequest } from './modeledTypes';
import { clearModeledSummary, modeledFingerprint, setModeledSummary } from './modeledSummary';
import type { ModeledUncertaintySummary } from './modeledSummary';
import { modeledReportEntry } from '../report/modeledReport';
import { defaultScreens } from '../project';
import { UncertaintyReportView } from '../report/UncertaintyResults';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

afterEach(() => {
  clearTransportFeed();
  clearModeledSummary();
  forgetMemory();
});

const BENZENE = '71-43-2';
const TOLUENE = '108-88-3';
const WATER: PathwayId[] = ['waterIngestion', 'waterDermal'];

function transport(chemicalId?: string, label = 'test aquifer', K = '10'): TransportFeed {
  const r = toScenario({ ...DEFAULT_FORM, timeYr: '10', K });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return { scenario: r.scenario, label, ...(chemicalId ? { chemicalId } : {}) };
}

function form(ids: string[]): CleanupForm {
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, WATER.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  return {
    ...f,
    chemicals: ids.map((id) => newChemicalRow(db.byId.get(id)!)),
    a: { ...f.a, pathways },
    source: 'dissolved',
  };
}

const none = { vadose: null, saturated: null };

describe('modeled cleanup for several chemicals', () => {
  it('gives each chemical the levels of a single-chemical run with its own chain', () => {
    const feeds: Record<string, TransportFeed> = {
      [BENZENE]: transport(BENZENE, 'aquifer one', '10'),
      [TOLUENE]: transport(TOLUENE, 'aquifer two', '40'),
    };
    const both = buildModeledRows(form([BENZENE, TOLUENE]), db, (id) => ({
      transport: feeds[id]!,
      ...none,
    }));
    expect(both.map((r) => r.id)).toEqual([BENZENE, TOLUENE]);
    for (const row of both) {
      const alone = buildModeled(form([row.id]), db, { transport: feeds[row.id]!, ...none });
      expect(row.result.ok && alone.ok).toBe(true);
      if (!row.result.ok || !alone.ok) continue;
      expect(row.result.request).toEqual(alone.request);
    }
    // the batch the screen solves (one worker pass over every chemical) answers each chemical as a
    // solve of that chemical alone does, whatever the order: a request that leaked state into the next
    // one, or a solve that read another chemical's chain, would change a level
    const level = (o: ModeledItem) =>
      o.ok && o.outcome.modern?.ok ? o.outcome.modern.run.result.levels[0]!.level : null;
    const modern = (req: ModeledRequest): ModeledRequest => ({ ...req, only: 'modern' });
    const reqs = both.map((r) => {
      if (!r.result.ok) throw new Error('row');
      return modern(r.result.request);
    });
    const alone = both.map((r) => {
      const one = buildModeled(form([r.id]), db, { transport: feeds[r.id]!, ...none });
      if (!one.ok) throw new Error('alone');
      return level({ ok: true, outcome: computeModeled(modern(one.request)) });
    });
    const forward = solveAll(reqs).map(level);
    const backward = solveAll([...reqs].reverse())
      .map(level)
      .reverse();
    expect(forward).toEqual(alone);
    expect(backward).toEqual(alone);
    expect(alone[0]).not.toBeNull();
    expect(alone[0]).not.toBe(alone[1]);
    // the two chains differ, so the two requests do not share a chain
    const [a, b] = both.map((r) => (r.result.ok ? r.result.request.transport : null));
    expect(a).not.toEqual(b);
  }, 60000);

  it('reports a chemical whose upstream run is missing, wrong or untagged on its row and solves the rest', () => {
    const feedsOf = (id: string): Feeds =>
      id === BENZENE ? { transport: transport(BENZENE), ...none } : { transport: null, ...none };
    const rows = buildModeledRows(form([BENZENE, TOLUENE]), db, feedsOf);
    expect(rows[0]!.result.ok).toBe(true);
    const missing = rows[1]!.result;
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.join(' ')).toMatch(/groundwater transport screen/);

    const wrong = buildModeledRows(form([BENZENE, TOLUENE]), db, () => ({
      transport: transport(BENZENE),
      ...none,
    }));
    expect(wrong[0]!.result.ok).toBe(true);
    const bad = wrong[1]!.result;
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.join(' ')).toMatch(/Toluene: .*is for Benzene, not Toluene/);
    }

    const untagged = buildModeledRows(form([BENZENE, TOLUENE]), db, () => ({
      transport: transport(),
      ...none,
    }));
    for (const r of untagged) {
      expect(r.result.ok).toBe(false);
      if (!r.result.ok) expect(r.result.errors.join(' ')).toMatch(/does not record which chemical/);
    }
    // a lone chemical still takes an untagged run
    expect(
      buildModeledRows(form([BENZENE]), db, () => ({ transport: transport(), ...none }))[0]!.result
        .ok,
    ).toBe(true);
  });

  it('names each chemical in the CSV tables, with its own file per chemical', () => {
    const rows = buildModeledRows(form([BENZENE, TOLUENE]), db, (id) => ({
      transport: transport(id),
      ...none,
    }));
    const entries = rows.map((r) => {
      if (!r.result.ok) throw new Error('row');
      return {
        id: r.id,
        name: r.name,
        outcome: computeModeled({ ...r.result.request, only: 'modern' }),
      };
    });
    const tables = modeledCsvTablesAll(entries);
    expect(tables).toHaveLength(4);
    expect(new Set(tables.map((t) => t.name)).size).toBe(4);
    for (const t of tables) {
      expect(t.label).toMatch(/Benzene|Toluene/);
      const name = t.label.includes('Benzene') ? 'Benzene' : 'Toluene';
      expect(t.rows.length).toBeGreaterThan(0);
      for (const r of t.rows) expect(r.chemical).toBe(name);
    }
    // one chemical keeps the original two tables
    expect(modeledCsvTablesAll(entries.slice(0, 1)).map((t) => t.name)).toEqual([
      'cleanup-modeled-levels',
      'cleanup-modeled-curve',
    ]);
  }, 60000);

  it('marks only the chemical whose slot is stale', async () => {
    const edit = (patch: Record<string, string>) =>
      act(() => {
        const s = getScreen('transport');
        setScreen('transport', { ...s, form: { ...s.form, ...patch } });
      });
    // each slot is sent while the transport screen is on its chemical
    edit({ chemicalId: TOLUENE });
    setTransportFeed(transport(TOLUENE, 'toluene aquifer'));
    edit({ chemicalId: BENZENE });
    setTransportFeed(transport(BENZENE, 'benzene aquifer'));

    // the cleanup rows follow the project chemical list
    addChemical({ id: BENZENE, name: 'Benzene' });
    addChemical({ id: TOLUENE, name: 'Toluene' });
    render(<CleanupPage />);
    await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    const benzene = (
      await screen.findByText(/benzene.*aquifer and well: benzene aquifer/i)
    ).closest('p')!;
    const toluene = screen.getByText(/toluene.*aquifer and well: toluene aquifer/i).closest('p')!;
    expect(within(benzene).queryByText('Out of date')).toBeNull();
    expect(within(toluene).queryByText('Out of date')).toBeNull();

    edit({ K: '99' });
    expect(within(benzene).getByText('Out of date')).toBeTruthy();
    expect(within(toluene).queryByText('Out of date')).toBeNull();
  }, 60000);

  it('solves the other chemicals when one fails and reports progress per chemical', () => {
    const rows = buildModeledRows(form([BENZENE, TOLUENE]), db, (id) => ({
      transport: transport(id),
      ...none,
    }));
    const reqs = rows.map((r) => {
      if (!r.result.ok) throw new Error('row');
      return { ...r.result.request, only: 'modern' as const };
    });
    // a request that throws outside the per-method guards stops only its own chemical
    const bad = { ...reqs[0]!, source: undefined } as never;
    const seen: number[] = [];
    const items = solveAll([bad, reqs[1]!], (p) => seen.push(p.done));
    expect(seen).toEqual([1, 2]);
    expect(items[0]!.ok).toBe(false);
    expect(items[1]!.ok).toBe(true);
  }, 60000);

  it('keeps one report entry per chemical, so one chemical run does not vouch for the other', () => {
    setTransportFeed(transport(BENZENE));
    setTransportFeed(transport(TOLUENE));
    const screens = defaultScreens();
    screens.cleanup = { form: form([BENZENE, TOLUENE]) };
    const rows = buildModeledRows(screens.cleanup.form, db, (id) => ({
      transport: transport(id),
      ...none,
    }));
    const benzene = rows[0]!.result;
    if (!benzene.ok) throw new Error('row');
    const summary = (id: string, name: string, fingerprint: string): ModeledUncertaintySummary => ({
      chemicalId: id,
      chemical: name,
      fingerprint,
      label: name + ' at the source, Wexler (1992) transport',
      unit: 'mg/L',
      fromSi: 1000,
      deterministic: 2e-3,
      n: 200,
      succeeded: 198,
      seed: 'k7',
      forwardRuns: 12,
      workers: 1,
      chosen: 0.95,
      levels: [{ p: 0.95, level: 1e-3 }],
      warnings: [],
      spearman: [{ label: 'Seepage velocity', rho: -0.4 }],
    });
    setModeledSummary(
      summary(BENZENE, 'Benzene', modeledFingerprint(benzene.request, screens.uncertainty.modeled)),
    );
    const entry = modeledReportEntry(screens, db);
    expect(entry?.state).toBe('many');
    if (entry?.state !== 'many') return;
    expect(entry.entries.map((e) => [e.chemical, e.state])).toEqual([
      ['Benzene', 'current'],
      ['Toluene', 'none'],
    ]);

    render(<UncertaintyReportView runs={{ exposure: null, cleanup: null, modeled: entry }} />);
    // each block is a landmark with its own name (the same name twice fails the landmark-unique check)
    const benzeneBlock = screen.getByLabelText('Modeled source uncertainty results: Benzene');
    const tolueneBlock = screen.getByLabelText('Modeled source uncertainty results: Toluene');
    const blocks = [benzeneBlock, tolueneBlock];
    expect(blocks[0]!.textContent).toMatch(/Benzene at the source/);
    expect(blocks[1]!.textContent).toMatch(/Toluene/);
    expect(blocks[1]!.textContent).toMatch(/No run yet/);
  }, 60000);

  it('solves the chemical with a chain and puts the problem of the other on its own row', async () => {
    act(() => {
      const s = getScreen('transport');
      setScreen('transport', { ...s, form: { ...s.form, chemicalId: BENZENE } });
    });
    setTransportFeed(transport(BENZENE, 'benzene aquifer'));
    // the cleanup rows follow the project chemical list
    addChemical({ id: BENZENE, name: 'Benzene' });
    addChemical({ id: TOLUENE, name: 'Toluene' });
    render(<CleanupPage />);
    await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    // toluene reads the benzene run (the only slot held), so the chemical check names both chemicals
    // on toluene's own row while benzene is solved
    expect(
      await screen.findByText(/is for Benzene, not Toluene/i, undefined, { timeout: 20000 }),
    ).toBeTruthy();
    expect(
      await screen.findByRole(
        'region',
        { name: /modeled cleanup level, modern, benzene/i },
        { timeout: 30000 },
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole('region', { name: /modeled cleanup level, modern, toluene/i }),
    ).toBeNull();
  }, 90000);

  it('says plainly that no run is held for a chemical when only another chemical has one', async () => {
    act(() => {
      const s = getScreen('transport');
      setScreen('transport', { ...s, form: { ...s.form, chemicalId: BENZENE } });
    });
    setTransportFeed(transport(BENZENE, 'benzene aquifer'));
    addChemical({ id: BENZENE, name: 'Benzene' });
    addChemical({ id: TOLUENE, name: 'Toluene' });
    render(<CleanupPage />);
    await screen.findByText(/890 chemicals/i, undefined, { timeout: 20000 });
    fireEvent.click(screen.getByRole('radio', { name: /groundwater source/i }));
    const benzene = (
      await screen.findByText(/benzene: aquifer and well: benzene aquifer/i)
    ).closest('p')!;
    const toluene = screen.getByText(/toluene: no aquifer run held/i).closest('p')!;
    expect(toluene.textContent).toMatch(/the run held is for Benzene/);
    expect(toluene.textContent).not.toMatch(/aquifer and well/);
    // benzene goes stale: only benzene's own hint carries the mark, toluene shows no one else's slot
    act(() => {
      const s = getScreen('transport');
      setScreen('transport', { ...s, form: { ...s.form, K: '99' } });
    });
    expect(within(benzene).getByText('Out of date')).toBeTruthy();
    expect(within(toluene).queryByText('Out of date')).toBeNull();
  }, 60000);
});

const heldSummary = (id: string, name: string, fingerprint = 'old'): ModeledUncertaintySummary => ({
  chemicalId: id,
  chemical: name,
  fingerprint,
  label: name + ' at the source, Wexler (1992) transport',
  unit: 'mg/L',
  fromSi: 1000,
  deterministic: 2e-3,
  n: 200,
  succeeded: 198,
  seed: 'k7',
  forwardRuns: 12,
  workers: 1,
  chosen: 0.95,
  levels: [{ p: 0.95, level: 1e-3 }],
  warnings: [],
  spearman: [{ label: 'Seepage velocity', rho: -0.4 }],
});

describe('modeled report entry after the cleanup list changes', () => {
  it('stays out of date, not "no run yet", when the list is emptied after a run', () => {
    const screens = defaultScreens();
    screens.cleanup = { form: form([]) };
    expect(modeledReportEntry(screens, db)).toEqual({ state: 'none' });
    const held = heldSummary(BENZENE, 'Benzene');
    setModeledSummary(held);
    expect(modeledReportEntry(screens, db)).toEqual({ state: 'stale', summary: held });
    const other = heldSummary(TOLUENE, 'Toluene');
    setModeledSummary(other);
    const entry = modeledReportEntry(screens, db);
    expect(entry?.state).toBe('many');
    if (entry?.state !== 'many') return;
    expect(entry.entries.map((e) => [e.chemical, e.state])).toEqual([
      ['Benzene', 'stale'],
      ['Toluene', 'stale'],
    ]);
  });

  it('prints a stale chemical in the several-chemicals report without its numbers', () => {
    const entry = {
      state: 'many' as const,
      entries: [
        {
          state: 'stale' as const,
          summary: heldSummary(BENZENE, 'Benzene'),
          chemical: 'Benzene',
          id: BENZENE,
        },
        { state: 'none' as const, chemical: 'Toluene', id: TOLUENE },
      ],
    };
    render(<UncertaintyReportView runs={{ exposure: null, cleanup: null, modeled: entry }} />);
    const block = screen.getByLabelText('Modeled source uncertainty results: Benzene');
    expect(block.textContent).toMatch(/out of date/);
    expect(block.textContent).not.toMatch(/iterations ran/);
    expect(
      screen.getByLabelText('Modeled source uncertainty results: Toluene').textContent,
    ).toMatch(/No run yet/);
  });

  it('keys the blocks by chemical id, so two chemicals with one name do not collide', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const entry = {
        state: 'many' as const,
        entries: [
          { state: 'none' as const, chemical: 'Same', id: 'user-1' },
          { state: 'none' as const, chemical: 'Same', id: 'user-2' },
        ],
      };
      render(<UncertaintyReportView runs={{ exposure: null, cleanup: null, modeled: entry }} />);
      expect(screen.getByLabelText('Modeled source uncertainty results: Same')).toBeTruthy();
      expect(screen.getByLabelText('Modeled source uncertainty results: Same (2)')).toBeTruthy();
      expect(err.mock.calls.flat().join(' ')).not.toMatch(/same key/i);
    } finally {
      err.mockRestore();
    }
  });
});
