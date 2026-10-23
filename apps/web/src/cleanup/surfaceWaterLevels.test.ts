import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { SurfaceWaterCoefficient } from '../surfaceWater/coefficient';
import { buildCleanup } from './build';
import { runCleanup } from './compute';
import { defaultCleanupForm } from './form';
import { surfaceWaterSourceLevels } from './surfaceWaterLevels';
import { solveSurfaceJob } from './surfaceSolve';
import { jobsOf } from './surfaceSolved';
import { run, unlinkedRequest } from './surfaceSolve.testkit';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const ON: PathwayId[] = ['swimIngestion', 'swimDermal'];

function outcome() {
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, ON.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  const form = {
    ...f,
    chemicals: [newChemicalRow(db.byId.get('71-43-2')!)],
    a: { ...f.a, pathways, swimTime: '2.6', swimDays: '12' },
  };
  const b = buildCleanup(form, db);
  if (!b.ok) throw new Error(b.errors.join('; '));
  return runCleanup(b);
}

const coef = (over: Partial<SurfaceWaterCoefficient> = {}): SurfaceWaterCoefficient => ({
  value: 0.04,
  reason: null,
  method: 'surfaceWater.mass-discharge',
  sourceMedium: 'groundwater',
  sourceUnit: 'mg/L',
  ...over,
});

const feed = (c: SurfaceWaterCoefficient | undefined): SurfaceWaterFeed => ({
  method: 'mass-discharge',
  origin: 'surfaceWater.mass-discharge',
  label: 'Modern mass-discharge surface water, 10.0 years',
  times: [1],
  values: [1e-6],
  ...(c ? { coefficient: c } : {}),
});

describe('surfaceWaterSourceLevels', () => {
  it('divides the surface water level by the coefficient and prints the source in mg/L', () => {
    const out = outcome();
    const rows = surfaceWaterSourceLevels(out, feed(coef()));
    const modern = rows.find((r) => r.method === 'modern')!;
    if (!out.modern.ok) throw new Error('modern should run');
    const sw = out.modern.result.media.find((m) => m.medium === 'surfaceWater')!.levels[0]!;
    expect(modern.level).toBe(sw.level! / 0.04);
    expect(modern.level! * 0.04).toBeCloseTo(sw.level!, 18);
    expect(modern.mediumLevel).toBe(sw.level);
    expect(modern.unit).toBe('mg/L');
    expect(modern.fromSi).toBe(1e3);
    expect(modern.surfaceMethod).toBe('surfaceWater.mass-discharge');
    expect(modern.reason).toBeNull();
  });

  it('is not quantified, with the reason, when the run recorded none', () => {
    const rows = surfaceWaterSourceLevels(outcome(), feed(undefined));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.level).toBeNull();
      expect(r.reason).toMatch(/send the surface water result again/i);
    }
  });

  it('is not quantified with the coefficient reason, never zero', () => {
    const rows = surfaceWaterSourceLevels(
      outcome(),
      feed(coef({ value: null, reason: 'has an upstream background concentration' })),
    );
    for (const r of rows) {
      expect(r.level).toBeNull();
      // a result sent before the path was recorded cannot be solved and says to send it again
      expect(r.reason).toMatch(/^has an upstream background concentration\./);
      expect(r.reason).toMatch(/send the surface water result again/i);
      expect(r.path).toBeNull();
    }
  });

  it('a linear level says so and is unchanged by the solve machinery', () => {
    const rows = surfaceWaterSourceLevels(outcome(), feed(coef({ path: 'linear' })));
    for (const r of rows) {
      expect(r.path).toBe('linear');
      expect(r.pending).toBe(false);
      expect(r.job).toBeNull();
      expect(r.sourceMedium).toBe('groundwater');
      expect(r.unit).toBe('mg/L');
    }
  });

  it('zero transfer stays not quantified, with the reason, even when the run holds its request', () => {
    const request = unlinkedRequest();
    const f = {
      ...feed(
        coef({
          value: null,
          reason: 'The run transfers nothing to the surface water.',
          path: 'none',
        }),
      ),
      solve: { request },
    };
    for (const r of surfaceWaterSourceLevels(outcome(), f)) {
      expect(r.level).toBeNull();
      expect(r.pending).toBe(false);
      expect(r.reason).toBe('The run transfers nothing to the surface water.');
    }
  });

  describe('a run with an upstream background is solved against the forward run', () => {
    const request = unlinkedRequest({ background: '0.01' });
    const f: SurfaceWaterFeed = {
      ...feed(
        coef({
          value: null,
          reason: 'The run has an upstream background concentration.',
          path: 'background',
          method: 'surfaceWater.mass-discharge',
        }),
      ),
      solve: { request },
    };

    it('is pending until the worker has the result, with the job to run', () => {
      const rows = surfaceWaterSourceLevels(outcome(), f);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.pending).toBe(true);
        expect(r.level).toBeNull();
        expect(r.reason).toBeNull();
        expect(r.job).not.toBeNull();
      }
      // legacy and modern receptors of one chemical share one job (one forward model)
      expect(new Set(rows.map((r) => r.job!.key)).size).toBe(1);
      expect(jobsOf(rows)).toHaveLength(1);
    });

    it('with the result: the solved source level reproduces the surface water level', () => {
      const out = outcome();
      const jobs = jobsOf(surfaceWaterSourceLevels(out, f));
      const solves = new Map(jobs.map((j) => [j.key, solveSurfaceJob(j)]));
      const rows = surfaceWaterSourceLevels(out, f, {}, solves);
      for (const r of rows) {
        expect(r.pending).toBe(false);
        expect(r.reason).toBeNull();
        expect(r.path).toBe('solved');
        expect(r.solver).toBeTruthy();
        expect(r.sourceMedium).toBe('groundwater');
        expect(r.unit).toBe('mg/L');
        const forward = run({ ...request, groundwaterConcentration: r.level! });
        const peak = Math.max(...forward.modern.surfaceWater);
        expect(Math.abs(peak / r.mediumLevel! - 1)).toBeLessThan(1e-9);
        // the linear estimate (level over the no-background coefficient) would miss
        expect(r.cancerLevel === null || r.cancerLevel > 0).toBe(true);
      }
    });

    it('a level the background alone exceeds is not quantified and says so', () => {
      const high = unlinkedRequest({ background: '1000' });
      const out = outcome();
      const fh: SurfaceWaterFeed = { ...f, solve: { request: high } };
      const jobs = jobsOf(surfaceWaterSourceLevels(out, fh));
      const solves = new Map(jobs.map((j) => [j.key, solveSurfaceJob(j)]));
      for (const r of surfaceWaterSourceLevels(out, fh, {}, solves)) {
        expect(r.level).toBeNull();
        expect(r.reason).toMatch(/background/i);
        expect(r.path).toBeNull();
      }
    });
  });

  it('is not quantified where the source level exceeds the solubility', () => {
    const out = outcome();
    const plain = surfaceWaterSourceLevels(out, feed(coef()))[0]!;
    const rows = surfaceWaterSourceLevels(out, feed(coef({ solubility: plain.level! / 2 })));
    expect(rows[0]!.level).toBeNull();
    expect(rows[0]!.reason).toMatch(/solubility/i);
    const fine = surfaceWaterSourceLevels(out, feed(coef({ solubility: plain.level! * 2 })));
    expect(fine[0]!.level).toBe(plain.level);
  });

  it('has no rows when the cleanup run has no surface water pathway', () => {
    const f = defaultCleanupForm();
    const form = {
      ...f,
      chemicals: [newChemicalRow(db.byId.get('71-43-2')!)],
      a: {
        ...f.a,
        pathways: Object.fromEntries(PATHWAY_IDS.map((p) => [p, p === 'soilIngestion'])) as Record<
          PathwayId,
          boolean
        >,
      },
    };
    const b = buildCleanup(form, db);
    if (!b.ok) throw new Error(b.errors.join('; '));
    expect(surfaceWaterSourceLevels(runCleanup(b), feed(coef()))).toEqual([]);
  });
});
