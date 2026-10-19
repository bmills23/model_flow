import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, backCalculateLegacy, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { buildCleanup } from './build';
import { defaultCleanupForm, type CleanupForm } from './form';
import {
  buildProbabilisticSetup,
  probabilisticChoices,
  runCleanupProbabilistic,
} from './probabilistic';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const BENZENE = '71-43-2';
const TAP: PathwayId[] = ['waterIngestion', 'waterDermal'];

function legacyFor(over: Partial<CleanupForm> = {}, on: PathwayId[] = TAP) {
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, on.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  const form: CleanupForm = {
    ...f,
    chemicals: [newChemicalRow(db.byId.get(BENZENE)!)],
    a: { ...f.a, pathways },
    ...over,
  };
  const r = buildCleanup(form, db);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.legacy;
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

function setupFor(input = legacyFor()) {
  const s = buildProbabilisticSetup(input, BENZENE, 'groundwater');
  if (!s.ok) throw new Error(s.error);
  return s;
}

describe('probabilistic cleanup setup', () => {
  it('lists the chemical and medium pairs that have a switched-on pathway', () => {
    const choices = probabilisticChoices(legacyFor());
    expect(choices).toEqual([{ chemicalId: BENZENE, medium: 'groundwater' }]);
  });

  it('the deterministic level equals the direct back-calculation (tap water, cancer and noncancer)', () => {
    const input = legacyFor();
    const s = setupFor(input);
    const direct = backCalculateLegacy(input).media.find((m) => m.medium === 'groundwater')!
      .levels[0]!.level!;
    expect(s.deterministic).not.toBeNull();
    expect(rel(s.deterministic!, direct)).toBeLessThan(1e-8);
  });

  it('matches the direct back-calculation for soil with explicit targets', () => {
    const input = legacyFor({ targetRisk: '1e-5', targetHq: '0.5' }, [
      'soilIngestion',
      'soilDermal',
    ]);
    const s = buildProbabilisticSetup(input, BENZENE, 'soil');
    if (!s.ok) throw new Error(s.error);
    const direct = backCalculateLegacy(input).media.find((m) => m.medium === 'soil')!.levels[0]!
      .level!;
    expect(rel(s.deterministic!, direct)).toBeLessThan(1e-8);
  });

  it('matches the direct back-calculation with two additive receptors', () => {
    const f = defaultCleanupForm();
    const input = legacyFor({
      b: { ...f.a, preset: 'worker' },
      additive: true,
    });
    expect(input.receptors.length).toBe(2);
    const s = setupFor(input);
    const direct = backCalculateLegacy(input).media.find((m) => m.medium === 'groundwater')!
      .levels[0]!.level!;
    expect(rel(s.deterministic!, direct)).toBeLessThan(1e-8);
  });

  it('refuses a medium with no switched-on pathway', () => {
    const s = buildProbabilisticSetup(legacyFor(), BENZENE, 'soil');
    expect(s.ok).toBe(false);
  });

  it('keeps the receptor labels on the sampled inputs', () => {
    const s = setupFor();
    const labels = (s.model.uncertainInputs ?? []).map((u) => u.label);
    expect(labels.some((l) => l.includes('Receptor A'))).toBe(true);
    expect(labels.every((l) => !/^Receptor \d/.test(l))).toBe(true);
  });
});

describe('runCleanupProbabilistic', () => {
  const ids = (s: ReturnType<typeof setupFor>) => (s.model.uncertainInputs ?? []).map((u) => u.id);
  const bwId = (s: ReturnType<typeof setupFor>) => ids(s).find((i) => i.endsWith('.bw'))!;

  it('orders the protection levels and brackets the deterministic level', () => {
    const s = setupFor();
    const r = runCleanupProbabilistic(s, {
      distributions: { [bwId(s)]: { kind: 'lognormal', gm: 70, gsd: 1.3 } },
      n: 400,
    });
    const at = (p: number) => r.levels.find((l) => l.p === p)!.level!;
    expect(at(0.95)).toBeLessThan(at(0.9));
    expect(at(0.9)).toBeLessThan(at(0.5));
    expect(r.succeeded).toBe(400);
    // median body weight equals the base 70 kg, so the median level is near the deterministic one
    expect(rel(at(0.5), s.deterministic!)).toBeLessThan(0.1);
  });

  it('is reproducible for a seed and differs for another', () => {
    const s = setupFor();
    const d = { [bwId(s)]: { kind: 'lognormal' as const, gm: 70, gsd: 1.3 } };
    const a = runCleanupProbabilistic(s, { distributions: d, n: 200, seed: 'one' });
    const b = runCleanupProbabilistic(s, { distributions: d, n: 200, seed: 'one' });
    const c = runCleanupProbabilistic(s, { distributions: d, n: 200, seed: 'two' });
    expect(b.iterationLevels).toEqual(a.iterationLevels);
    expect(c.iterationLevels).not.toEqual(a.iterationLevels);
  });
});
