import { describe, expect, it } from 'vitest';
import { registry } from '@model-flow/engine';
import { buildProject, defaultScreens, type Screens } from '../project';
import { loadChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { emptyRow } from '../uncertainty/editor';
import { handleRows } from '../uncertainty/protocol';
import type { WorkerLike } from '../uncertainty/pool';
import { planUncertainty, runUncertaintyPlan } from './uncertaintyReport';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const BENZENE = '71-43-2';

/** A stand-in for the worker pool that runs the registry model in this thread. */
function makeWorker(): WorkerLike {
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    terminate: () => {},
    postMessage: (req) => {
      const r = handleRows(req, (id) => registry.get(id) as never);
      queueMicrotask(() => w.onmessage?.({ data: r }));
    },
  };
  return w;
}

async function project(edit: (s: Screens, rec: ReturnType<typeof newChemicalRow>) => void) {
  const db = await loadChemicalDb();
  const rec = newChemicalRow(db.byId.get(BENZENE)!);
  const screens = defaultScreens();
  edit(screens, rec);
  return buildProject({ screens, createdWith: '0.0.1', now: NOW });
}

const uniform = (a: string, b: string) => ({
  ...emptyRow(),
  kind: 'uniform' as const,
  params: { a, b },
});

describe('planUncertainty', () => {
  it('plans nothing and says nothing when no panel was set up', async () => {
    const plan = await planUncertainty(await project(() => {}));
    expect(plan.exposure).toBeNull();
    expect(plan.cleanup).toBeNull();
    expect(plan.notes).toEqual([]);
  });

  it('says why an exposure panel with no sampled input has nothing to run', async () => {
    const plan = await planUncertainty(
      await project((s, rec) => {
        s.risk = {
          form: { ...s.risk.form, chemicals: [{ ...rec, conc: { groundwater: '0.005' } }] },
        };
        s.uncertainty = {
          ...s.uncertainty,
          risk: { ...s.uncertainty.risk, rows: { 'exposure.receptor0.bw': emptyRow() } },
        };
      }),
    );
    expect(plan.exposure).toBeNull();
    expect(plan.notes.join(' ')).toMatch(/no input has a distribution/);
  });

  it('plans and runs the exposure panel from the saved setup and seed, the same numbers twice', async () => {
    const proj = await project((s, rec) => {
      s.risk = {
        form: { ...s.risk.form, chemicals: [{ ...rec, conc: { groundwater: '0.005' } }] },
      };
      s.uncertainty = {
        ...s.uncertainty,
        risk: {
          ...s.uncertainty.risk,
          rows: { 'exposure.receptor0.bw': uniform('50', '100') },
          iterations: '40',
          seed: 'g2',
        },
      };
    });
    const plan = await planUncertainty(proj);
    expect(plan.exposure).not.toBeNull();
    const progress: number[] = [];
    const a = await runUncertaintyPlan(plan, {
      makeWorker,
      workers: 1,
      onProgress: (p) => progress.push(p.done),
    });
    const b = await runUncertaintyPlan(plan, { makeWorker, workers: 2 });
    expect(a.exposure!.n).toBe(40);
    expect(a.exposure!.seed).toBe('g2');
    expect(a.exposure!.summary).not.toBeNull();
    expect(a.exposure!.values).toEqual(b.exposure!.values);
    expect(a.exposure!.spearman.length).toBe(1);
    expect(progress.at(-1)).toBe(40);
    expect(a.cleanup).toBeNull();
  }, 60000);

  it('plans and runs the probabilistic cleanup panel of a direct source', async () => {
    const proj = await project((s, rec) => {
      s.cleanup = { form: { ...s.cleanup.form, chemicals: [rec] } };
      s.uncertainty = {
        ...s.uncertainty,
        cleanup: {
          ...s.uncertainty.cleanup,
          rows: { 'exposure.receptor0.bw': uniform('50', '100') },
          iterations: '30',
          seed: 'g2c',
        },
      };
    });
    const plan = await planUncertainty(proj);
    expect(plan.notes).toEqual([]);
    expect(plan.cleanup).not.toBeNull();
    const run = await runUncertaintyPlan(plan, { yieldToUi: async () => {} });
    expect(run.cleanup!.result.n).toBe(30);
    expect(run.cleanup!.result.seed).toBe('g2c');
    expect(run.cleanup!.result.levels.length).toBeGreaterThan(0);
    expect(run.cleanup!.label).toMatch(/in /);
  }, 60000);
});
