import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, runProbabilisticCleanup, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { toScenario, DEFAULT_FORM } from '../transport/form';
import { toScenario as vadoseScenario, DEFAULT_FORM as VADOSE_FORM } from '../vadose/form';
import { handlePoolRequest } from '../uncertainty/dispatch';
import { runModeledCleanupAnalysis } from '../uncertainty/headless';
import { RunCancelledError, type WorkerFactory, type WorkerLike } from '../uncertainty/pool';
import type { EditorSpec } from '../uncertainty/editor';
import type { ModeledRowsRequest, PoolRequest } from '../uncertainty/protocol';
import { computeModeled, solveModeledIteration } from './compute';
import { buildModeled } from './modeledBuild';
import { MODELED_DEFAULT_N, SMALL_TAIL_DRAWS, modeledUncertainInputs } from './modeledUncertainty';
import { buildModeledSetup } from './modeledSetup';
import { defaultCleanupForm, type CleanupForm } from './form';
import type { ModeledOutcome, ModeledRequest } from './modeledTypes';

let db: ChemicalDb;
let dissolved: ModeledRequest;
let dissolvedOutcome: ModeledOutcome;
let vadose: ModeledRequest;

const WATER: PathwayId[] = ['waterIngestion', 'waterDermal'];

function request(source: CleanupForm['source']): ModeledRequest {
  const t = toScenario({ ...DEFAULT_FORM, timeYr: '10' });
  if (!t.ok) throw new Error(t.errors.join('; '));
  const v = vadoseScenario({ ...VADOSE_FORM });
  if (!v.ok) throw new Error('vadose scenario');
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, WATER.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  const r = buildModeled(
    { ...f, chemicals: [newChemicalRow(db.byId.get('71-43-2')!)], a: { ...f.a, pathways }, source },
    db,
    {
      transport: { scenario: t.scenario, label: 'test aquifer' },
      vadose: { scenario: v.scenario, method: 'modern', label: 'v' },
      saturated: null,
    },
  );
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.request;
}

beforeAll(async () => {
  db = await loadChemicalDb();
  dissolved = request('dissolved');
  vadose = request('vadose');
  dissolvedOutcome = computeModeled(dissolved);
}, 120000);

/** A worker that answers on a timer tick with the same handler the real worker runs. */
function inlineFactory(created: WorkerLike[] = []): WorkerFactory {
  return () => {
    const w: WorkerLike & { stopped: boolean } = {
      onmessage: null,
      onerror: null,
      stopped: false,
      postMessage(m: PoolRequest) {
        const res = handlePoolRequest(m);
        setTimeout(() => {
          if (!w.stopped) w.onmessage?.({ data: res });
        }, 0);
      },
      terminate() {
        w.stopped = true;
      },
    };
    created.push(w);
    return w;
  };
}

const VELOCITY = 'groundwater.velocity';

describe('modeledUncertainInputs', () => {
  it('declares the transport scalars and, on the legacy side, the receptor factors', () => {
    const ids = modeledUncertainInputs(dissolved, 'legacy').map((u) => u.id);
    for (const id of [VELOCITY, 'groundwater.retardation', 'groundwater.dx']) {
      expect(ids).toContain(id);
    }
    expect(ids).toContain('exposure.receptor0.bw');
    const modern = modeledUncertainInputs(dissolved, 'modern').map((u) => u.id);
    expect(modern).toContain(VELOCITY);
    expect(modern.some((id) => id.startsWith('exposure.'))).toBe(false);
  });

  it('every declared input has a finite base value and round-trips through set and get', () => {
    for (const u of modeledUncertainInputs(dissolved, 'legacy')) {
      const v = u.get(dissolved);
      expect(Number.isFinite(v)).toBe(true);
      const next = u.set(dissolved, v * 1.5 + 1e-9);
      expect(u.get(next)).toBeCloseTo(v * 1.5 + 1e-9, 15);
    }
    const v = modeledUncertainInputs(dissolved, 'legacy').find((u) => u.id === VELOCITY)!;
    const moved = v.set(dissolved, 1e-6);
    expect(moved.transport.velocity).toBe(1e-6);
    expect(dissolved.transport.velocity).not.toBe(1e-6);
  });

  it('declares the source inputs of a soil source but never the solved source concentration', () => {
    const ids = modeledUncertainInputs(vadose, 'modern').map((u) => u.id);
    expect(ids).toContain('vadose.infiltration');
    expect(ids).not.toContain('vadose.source.F');
    const u = modeledUncertainInputs(vadose, 'modern').find((x) => x.id === 'vadose.infiltration')!;
    const moved = u.set(vadose, 2e-9);
    expect(moved.source.kind === 'vadose' && moved.source.vadose.modern.q).toBe(2e-9);
  });
});

describe('solveModeledIteration', () => {
  it('gives the level the screen solve reports for the same request', () => {
    const lv = solveModeledIteration(dissolved, 'legacy');
    const screen = dissolvedOutcome.legacy;
    expect(screen?.ok).toBe(true);
    if (!screen?.ok) return;
    expect(lv.reachable).toBe(true);
    expect(lv.level).toBe(screen.run.result.levels[0]!.level);
    expect(lv.evaluations).toBeGreaterThan(0);
  }, 60000);
});

describe('handlePoolRequest for modeled cleanup rows', () => {
  it('solves each row with the sampled value applied and reports a refused row as failed', () => {
    const base = dissolved.transport.velocity;
    const req: ModeledRowsRequest = {
      type: 'modeled-cleanup',
      job: 3,
      start: 0,
      request: dissolved,
      method: 'legacy',
      ids: [VELOCITY],
      rows: [[base * 2], [-1]],
    };
    const res = handlePoolRequest(req, () => 0);
    expect(res.type).toBe('rows');
    if (res.type !== 'rows') return;
    expect(res.job).toBe(3);
    const v = modeledUncertainInputs(dissolved, 'legacy').find((u) => u.id === VELOCITY)!;
    expect(res.outputs[0]).toBe(solveModeledIteration(v.set(dissolved, base * 2), 'legacy').level);
    expect(res.outputs[1]).toBeNaN();
    expect(res.failures.map((f) => f.row)).toEqual([1]);
    expect(res.evaluations?.[0]).toBeGreaterThan(0);
  }, 60000);
});

describe('runModeledCleanupAnalysis', () => {
  function specFor(): EditorSpec {
    const v = dissolved.transport.velocity;
    return {
      ok: true,
      distributions: { [VELOCITY]: { kind: 'uniform', a: v * 0.5, b: v * 2 } },
      correlation: undefined,
      issues: [],
      rowIssues: {},
      correlationIssues: [],
    };
  }
  // 12 rows: a 5-row pilot, then 7 rows in chunks of 2, so four chunks are queued after the pilot.
  const settings = { n: 12, seed: 'modeled', protection: 0.95 };
  const CHUNK = 2;

  it('matches the in-line engine run and is bit-identical on one and two workers', async () => {
    const setup = buildModeledSetup(dissolved, dissolvedOutcome, 'legacy');
    if (!setup.ok) throw new Error(setup.error);
    const labels = { [VELOCITY]: 'Velocity' };
    const oneWorkers: WorkerLike[] = [];
    const one = await runModeledCleanupAnalysis(setup, specFor(), settings, labels, {
      makeWorker: inlineFactory(oneWorkers),
      workers: 1,
      chunkSize: CHUNK,
    });
    const twoWorkers: WorkerLike[] = [];
    const two = await runModeledCleanupAnalysis(setup, specFor(), settings, labels, {
      makeWorker: inlineFactory(twoWorkers),
      workers: 2,
      chunkSize: CHUNK,
    });
    expect(oneWorkers).toHaveLength(1);
    expect(twoWorkers).toHaveLength(2);
    expect(two.workers).toBe(2);
    expect(two.result).toEqual(one.result);
    const inline = runProbabilisticCleanup({
      model: setup.model,
      base: dissolved,
      distributions: specFor().distributions,
      solve: (r) => solveModeledIteration(r, 'legacy'),
      n: settings.n,
      seed: settings.seed,
      protection: settings.protection,
      ...(setup.cap !== undefined ? { cap: setup.cap } : {}),
    });
    expect(one.result.iterationLevels).toEqual(inline.iterationLevels);
    expect(one.result.levels).toEqual(inline.levels);
    expect(one.result.forwardRuns).toBe(inline.forwardRuns);
    expect(one.deterministic).toBe(
      dissolvedOutcome.legacy?.ok ? dissolvedOutcome.legacy.run.result.levels[0]!.level : NaN,
    );
    expect(one.unit).toBe('mg/L');
  }, 120000);

  it('warns when the chosen protection rests on fewer than the stated number of draws', async () => {
    const setup = buildModeledSetup(dissolved, dissolvedOutcome, 'legacy');
    if (!setup.ok) throw new Error(setup.error);
    const r = await runModeledCleanupAnalysis(
      setup,
      specFor(),
      settings,
      {},
      {
        makeWorker: inlineFactory(),
        workers: 1,
      },
    );
    const w = r.result.warnings.find((x) => x.code === 'uncertainty.small-sample-tail');
    expect(w).toBeDefined();
    expect(w?.message).toMatch(new RegExp(`${SMALL_TAIL_DRAWS}`));
    expect(MODELED_DEFAULT_N * (1 - 0.95)).toBeGreaterThanOrEqual(SMALL_TAIL_DRAWS);
  }, 120000);

  it('stops every worker and rejects when cancelled', async () => {
    const setup = buildModeledSetup(dissolved, dissolvedOutcome, 'legacy');
    if (!setup.ok) throw new Error(setup.error);
    const ctl = new AbortController();
    const created: WorkerLike[] = [];
    const p = runModeledCleanupAnalysis(
      setup,
      specFor(),
      { ...settings, n: 40 },
      {},
      {
        makeWorker: inlineFactory(created),
        workers: 2,
        chunkSize: 4,
        onProgress: (pr) => {
          if (pr.done > 0) ctl.abort();
        },
        signal: ctl.signal,
      },
    );
    await expect(p).rejects.toBeInstanceOf(RunCancelledError);
    expect(created).toHaveLength(2);
    expect(created.every((w) => (w as unknown as { stopped: boolean }).stopped)).toBe(true);
  }, 120000);

  it('refuses a method the screen could not solve', () => {
    const r = buildModeledSetup(dissolved, { medium: 'groundwater' }, 'legacy');
    expect(r.ok).toBe(false);
  });
});
