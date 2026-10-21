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
      expect(r.reason).toBe('has an upstream background concentration');
    }
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
