import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, backCalculateLegacy, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import type { ProduceRiskFeed } from '../plantsEco/feeds';
import { buildCleanup } from './build';
import { runCleanup } from './compute';
import { cleanupCsvTables } from './csv';
import { defaultCleanupForm, type CleanupForm } from './form';
import { buildProbabilisticSetup } from './probabilistic';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const BENZENE = '71-43-2';

// Arbitrary test inputs, not chemical data: the tests check the wiring and the identities only.
const FEED: ProduceRiskFeed = {
  chemicalId: BENZENE,
  label: 'Benzene, plantUptake.hhrap-2005',
  method: 'plantUptake.hhrap-2005',
  factors: { root: 0.02, abovegroundExposed: 0.05 },
  intakes: {
    root: { gPerKgDay: 1.5, fractionHomegrown: 0.4 },
    abovegroundExposed: { gPerKgDay: 1, fractionHomegrown: 0.4 },
  },
  intakeLabel: 'user entered',
  warnings: [{ code: 'PLANT_LOGKOW_OUT_OF_RANGE', message: 'log Kow is outside the fitted range' }],
};

function form(opts: { produce: boolean; flagged: boolean; pathways?: PathwayId[] }): CleanupForm {
  const f = defaultCleanupForm();
  const on = opts.pathways ?? ['soilIngestion'];
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, on.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  return {
    ...f,
    chemicals: [{ ...newChemicalRow(db.byId.get(BENZENE)!), produceFromPlantsEco: opts.flagged }],
    a: { ...f.a, pathways, produce: opts.produce },
  };
}

function soilLevels(f: CleanupForm, feed: ProduceRiskFeed | null) {
  const b = buildCleanup(f, db, { produce: feed });
  if (!b.ok) throw new Error(b.errors.join('; '));
  const out = runCleanup(b);
  if (!out.modern.ok || !out.legacy.ok) throw new Error('a method refused');
  return { b, out };
}

describe('homegrown produce in the cleanup build', () => {
  it('adds the produce pathway, the factors and the intake when receptor and chemical both opt in', () => {
    const { b } = soilLevels(form({ produce: true, flagged: true }), FEED);
    expect(b.modern.receptors[0]!.pathways).toContain('produce');
    expect(b.legacy.receptors[0]!.pathways).toContain('produce');
    expect(b.legacy.chemicals[0]!.chemical.produceFactors).toEqual(FEED.factors);
    expect(b.notes.join(' ')).toMatch(/homegrown produce uses the user entered intake/i);
  });

  it('lowers the soil level by exactly the produce term: 1/L = 1/L_soil + 1/L_produce', () => {
    const without = soilLevels(form({ produce: false, flagged: false }), null);
    const withP = soilLevels(form({ produce: true, flagged: true }), FEED);
    for (const m of ['legacy', 'modern'] as const) {
      const a = without.out[m];
      const c = withP.out[m];
      if (!a.ok || !c.ok) throw new Error('refused');
      const lvA = a.result.media.find((x) => x.medium === 'soil')!.levels[0]!;
      const lvC = c.result.media.find((x) => x.medium === 'soil')!.levels[0]!;
      expect(lvC.level!).toBeLessThan(lvA.level!);
      const alone = lvC.byReceptor[0]!.byPathway.find((p) => p.pathway === 'produce')!;
      expect(alone.cancerLevel).not.toBeNull();
      // cancer endpoint: coefficients add over pathways, so the levels add as reciprocals
      const sum = 1 / lvA.cancerLevel! + 1 / alone.cancerLevel!;
      expect(Math.abs(1 / lvC.cancerLevel! - sum) / sum).toBeLessThan(1e-9);
    }
  });

  it('skips the pathway with a note when the chemical does not use the plant factors', () => {
    const { b } = soilLevels(form({ produce: true, flagged: false }), FEED);
    expect(b.modern.receptors[0]!.pathways).not.toContain('produce');
    expect(b.notes.join(' ')).toMatch(/homegrown produce skipped/i);
  });

  it('is refused for a flagged chemical when no plants and ecology result is held', () => {
    const r = buildCleanup(form({ produce: true, flagged: true }), db, { produce: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/plants and ecology/i);
  });

  it('does not change a scenario that never opts in (old projects)', () => {
    const plain = buildCleanup(form({ produce: false, flagged: false }), db);
    const fed = buildCleanup(form({ produce: false, flagged: false }), db, { produce: FEED });
    expect(plain.ok && fed.ok).toBe(true);
    if (plain.ok && fed.ok) {
      expect(fed.modern.receptors[0]!.pathways).toEqual(plain.modern.receptors[0]!.pathways);
      expect(fed.notes).toEqual(plain.notes);
    }
  });

  it('keeps the feed warnings with the build so the screen can show them', () => {
    const { b } = soilLevels(form({ produce: true, flagged: true }), FEED);
    expect(b.feedWarnings.map((w) => w.code)).toContain('PLANT_LOGKOW_OUT_OF_RANGE');
  });

  it('writes the produce pathway into the pathway CSV', () => {
    const { out } = soilLevels(form({ produce: true, flagged: true }), FEED);
    const tables = cleanupCsvTables(out, { [BENZENE]: 'Benzene' });
    const paths = tables.find((t) => t.name === 'cleanup-pathways')!;
    expect(paths.rows.some((r) => String(r.pathway).toLowerCase().includes('produce'))).toBe(true);
  });

  it('the probabilistic setup holds the produce pathway at its point values and matches the direct level', () => {
    const { b } = soilLevels(form({ produce: true, flagged: true }), FEED);
    const s = buildProbabilisticSetup(b.legacy, BENZENE, 'soil');
    if (!s.ok) throw new Error(s.error);
    const direct = backCalculateLegacy(b.legacy).media.find((m) => m.medium === 'soil')!.levels[0]!
      .level!;
    expect(Math.abs(s.deterministic! - direct) / direct).toBeLessThan(1e-8);
  });
});
