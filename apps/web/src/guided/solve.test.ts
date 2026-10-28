import { beforeAll, describe, expect, it } from 'vitest';
import { solveAll } from '../cleanup/modeledSolve';
import type { ModeledSolved } from '../cleanup/ModeledCleanup';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { loadVaporChemicals, type VaporChemicalRow } from '../vapor/chemicals';
import type { ChemicalData } from './derive';
import { BENZENE, MTBE, guidedWith, setValue } from './forms.testkit';
import type { GuidedKeptLevel } from './levels';
import {
  guidedDirectCleanup,
  guidedKeptLevels,
  guidedSolvePlan,
  keptLevelsFrom,
  levelReason,
  levelsCheckFor,
  plainMessage,
  requestsToSolve,
  type GuidedSolvePlan,
} from './solve';
import type { GuidedState } from './state';

let db: ChemicalDb;
let rows: VaporChemicalRow[] = [];
beforeAll(async () => {
  db = await loadChemicalDb();
  rows = await loadVaporChemicals();
}, 30000);

const data = (id: string, name: string): ChemicalData => ({
  id,
  name,
  fate: rows.find((r) => r.id === id)!,
});
const both = (): ChemicalData[] => [data(BENZENE, 'Benzene'), data(MTBE, 'MTBE')];
const ctx = (chemicals: ChemicalData[] = both()) => ({ chemicals, db });

/** Groundwater at 2 mg/L benzene and 4 mg/L MTBE carried to a well, solved for cleanup levels. */
const gw = (patch?: (g: GuidedState) => void): GuidedState =>
  guidedWith((x) => {
    x.site.sources = ['groundwater'];
    x.site.paths.well = true;
    x.targets.mode = 'cleanup';
    setValue(x, BENZENE, 'groundwater', '2', 'mg/L');
    setValue(x, MTBE, 'groundwater', '4', 'mg/L');
    patch?.(x);
  });

/** Solves what the plan asks for, as the worker would, and returns the levels to keep. */
function solveAndKeep(plan: GuidedSolvePlan, g: GuidedState): GuidedKeptLevel[] {
  const reqs = requestsToSolve(plan, g.levels ?? {});
  const items = solveAll(reqs);
  const solved = new Map<string, ModeledSolved>();
  reqs.forEach((req, i) => solved.set(req.chemical.id, { req, item: items[i]! }));
  return keptLevelsFrom(plan, solved);
}
const keep = (g: GuidedState, entries: GuidedKeptLevel[]): GuidedState => ({
  ...g,
  levels: Object.fromEntries(entries.map((e) => [e.chemicalId, e])),
});
const modern = (e: GuidedKeptLevel | null | undefined) => {
  const m = e?.methods.modern;
  if (m === undefined || !m.ok) throw new Error(`no modern level: ${JSON.stringify(m)}`);
  return m;
};

describe('the step 5 solve plan', () => {
  it('builds one modeled request per chemical from the derived scenarios, with no Run needed for a groundwater source', () => {
    const plan = guidedSolvePlan(gw(), ctx());
    expect(plan.source).toBe('dissolved');
    expect(plan.rows.map((r) => r.id)).toEqual([BENZENE, MTBE]);
    for (const r of plan.rows) {
      expect(r.result.ok ? [] : r.result.errors).toEqual([]);
      expect(r.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    }
    expect(plan.rows[0]!.fingerprint).not.toBe(plan.rows[1]!.fingerprint);
  });

  it('has nothing to solve when the concentrations are measured at the receptor', () => {
    const g = guidedWith((x) => {
      x.site.basis = 'measured';
      x.site.measured = ['groundwater'];
      x.targets.mode = 'cleanup';
    });
    const plan = guidedSolvePlan(g, ctx());
    expect(plan.source).toBe('direct');
    expect(plan.rows).toEqual([]);
    expect(guidedKeptLevels(g, BENZENE, ctx())).toEqual({
      needed: false,
      levels: null,
      current: false,
    });
  });

  it('a soil source without a Run says to run step 3d, in the words of the steps', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['soilAbove'];
      x.site.paths.leaching = true;
      x.site.paths.well = true;
      x.targets.mode = 'cleanup';
      setValue(x, BENZENE, 'soilAbove', '10', 'mg/kg');
    });
    const plan = guidedSolvePlan(g, ctx([data(BENZENE, 'Benzene')]));
    expect(plan.source).toBe('vadose');
    const r = plan.rows[0]!;
    expect(r.result.ok).toBe(false);
    const errors = r.result.ok ? [] : r.result.errors;
    expect(errors.join(' ')).toMatch(/step 3d/);
    expect(errors.join(' ')).not.toMatch(/screen|press/i);
    expect(r.fingerprint).toBeNull();
  });

  it('the fingerprint follows the targets, and a standard moves only its own chemical', () => {
    const base = guidedSolvePlan(gw(), ctx()).rows.map((r) => r.fingerprint);
    const risk = guidedSolvePlan(
      gw((x) => (x.targets.targetRisk = '1e-5')),
      ctx(),
    ).rows.map((r) => r.fingerprint);
    expect(risk[0]).not.toBe(base[0]);
    expect(risk[1]).not.toBe(base[1]);
    const std = guidedSolvePlan(
      gw((x) => (x.targets.standards[MTBE] = { kind: 'mcl', value: '', unit: '', source: '' })),
      ctx(),
    ).rows.map((r) => r.fingerprint);
    expect(std[0]).toBe(base[0]);
    expect(std[1]).not.toBe(base[1]);
  });
});

describe('kept levels and the guided fingerprint', () => {
  it('each chemical alone: the solved levels are kept current, and an edit makes them out of date', () => {
    const g = gw();
    const plan = guidedSolvePlan(g, ctx());
    const entries = solveAndKeep(plan, g);
    expect(entries.map((e) => e.chemicalId)).toEqual([BENZENE, MTBE]);
    const held = keep(g, entries);
    const b = guidedKeptLevels(held, BENZENE, ctx());
    expect(b.needed).toBe(true);
    expect(b.current).toBe(true);
    expect(b.levels?.medium).toBe('groundwater');
    expect(b.levels?.allocation).toBe('individual');
    expect(b.levels?.target).toBe('risk');
    expect(modern(b.levels).level).toBeGreaterThan(0);
    // nothing is solved again while the kept levels are current
    expect(requestsToSolve(guidedSolvePlan(held, ctx()), held.levels ?? {})).toEqual([]);

    const edited = { ...held, targets: { ...held.targets, targetHq: '0.1' } };
    const after = guidedKeptLevels(edited, BENZENE, ctx());
    expect(after.current).toBe(false);
    expect(after.levels).toEqual(b.levels);
    const check = levelsCheckFor(edited, ctx());
    expect(check(BENZENE)).toBe('stale');
    expect(levelsCheckFor(held, ctx())(BENZENE)).toBe('current');
    expect(levelsCheckFor(g, ctx())(BENZENE)).toBe('missing');
  });

  it('a federal MCL and a state standard with its source are solved as concentrations at the well', () => {
    const g = gw((x) => {
      x.targets.standards[BENZENE] = { kind: 'mcl', value: '', unit: '', source: '' };
      x.targets.standards[MTBE] = {
        kind: 'state',
        value: '20',
        unit: 'ug/L',
        source: 'State groundwater rule',
      };
    });
    const entries = solveAndKeep(guidedSolvePlan(g, ctx()), g);
    const [b, m] = entries;
    expect(b?.target).toBe('mcl');
    expect(modern(b).endpoint).toBe('concentration');
    expect(m?.target).toBe('state');
    expect(modern(m).endpoint).toBe('concentration');
    expect(modern(m).target).toBeCloseTo(2e-5, 12);
  });

  it('all chemicals together keep the ratios of their 3b source values and meet the summed targets', () => {
    const alone = solveAndKeep(guidedSolvePlan(gw(), ctx()), gw());
    const g = gw((x) => (x.targets.allocation = 'cumulative'));
    const plan = guidedSolvePlan(g, ctx());
    expect(plan.groupProblem).toBeNull();
    const together = solveAndKeep(plan, g);
    const [b, m] = together.map(modern);
    expect(together.every((e) => e.allocation === 'cumulative')).toBe(true);
    expect(m!.level! / b!.level!).toBeCloseTo(2, 9);
    // the summed share of each target is at most one, and exactly one for the endpoint that governs
    const [ba, ma] = alone.map(modern);
    const cancer = b!.level! / ba!.cancerLevel! + m!.level! / (ma!.cancerLevel ?? Infinity);
    const hazard = b!.level! / ba!.noncancerLevel! + m!.level! / (ma!.noncancerLevel ?? Infinity);
    expect(Math.max(cancer, hazard)).toBeCloseTo(1, 9);
    expect(b!.level!).toBeLessThan(ba!.level!);
    // the fingerprint of every member covers the others: an edit to one chemical's value moves both
    const moved = guidedSolvePlan(
      gw((x) => {
        x.targets.allocation = 'cumulative';
        setValue(x, MTBE, 'groundwater', '8', 'mg/L');
      }),
      ctx(),
    );
    expect(moved.rows[0]!.fingerprint).not.toBe(plan.rows[0]!.fingerprint);
  });

  it('all together: a chemical not detected at the source gets no level, with the reason', () => {
    const g = gw((x) => {
      x.targets.allocation = 'cumulative';
      setValue(x, MTBE, 'groundwater', 'ND', 'mg/L');
    });
    const alone = solveAndKeep(guidedSolvePlan(gw(), ctx()), gw());
    const entries = solveAndKeep(guidedSolvePlan(g, ctx()), g);
    const m = entries.find((e) => e.chemicalId === MTBE);
    expect(m?.reason).toMatch(/not detected/);
    expect(m?.methods).toEqual({});
    const b = modern(entries.find((e) => e.chemicalId === BENZENE));
    expect(b.level!).toBeCloseTo(modern(alone[0]).level!, 12);
  });

  it('a target split equally divides each endpoint among the chemicals that carry it', () => {
    const alone = solveAndKeep(guidedSolvePlan(gw(), ctx()), gw()).map(modern);
    const g = gw((x) => (x.targets.allocation = 'equal'));
    const split = solveAndKeep(guidedSolvePlan(g, ctx()), g).map(modern);
    const nC = alone.filter((a) => a.cancerLevel !== null).length;
    const nN = alone.filter((a) => a.noncancerLevel !== null).length;
    alone.forEach((a, i) => {
      const c = a.cancerLevel === null ? Infinity : a.cancerLevel / nC;
      const n = a.noncancerLevel === null ? Infinity : a.noncancerLevel / nN;
      expect(split[i]!.level!).toBeCloseTo(Math.min(c, n), 12);
    });
  });

  it('a chemical with a water standard is solved alone when the others are solved together', () => {
    const g = gw((x) => {
      x.targets.allocation = 'cumulative';
      x.targets.standards[MTBE] = { kind: 'mcl', value: '', unit: '', source: '' };
    });
    const entries = solveAndKeep(guidedSolvePlan(g, ctx()), g);
    expect(entries.find((e) => e.chemicalId === MTBE)?.allocation).toBe('individual');
    expect(entries.find((e) => e.chemicalId === BENZENE)?.allocation).toBe('cumulative');
  });
});

describe('the plain words of a level', () => {
  it('names the chemical instead of its CAS number', () => {
    expect(plainMessage('71-43-2: the level misses the target', { [BENZENE]: 'Benzene' })).toBe(
      'Benzene: the level misses the target',
    );
  });

  it('gives the reason a level is not quantified', () => {
    expect(levelReason({ ok: false, error: 'refused input' })).toMatch(/refused input/);
    const base = modern(solveAndKeep(guidedSolvePlan(gw(), ctx()), gw())[0]);
    expect(levelReason(base)).toBeNull();
    expect(
      levelReason({
        ...base,
        level: null,
        limiting: null,
        warnings: [{ code: 'cleanup.target-not-reachable', message: 'x' }],
      }),
    ).toMatch(/not reached/);
  });
});

describe('the levels in the medium contacted', () => {
  it('measured: all together keep the measured ratios', () => {
    const g = guidedWith((x) => {
      x.site.basis = 'measured';
      x.site.measured = ['groundwater'];
      x.targets.mode = 'cleanup';
      x.targets.allocation = 'cumulative';
      setValue(x, BENZENE, 'groundwater', '1', 'mg/L');
      setValue(x, MTBE, 'groundwater', '3', 'mg/L');
    });
    const d = guidedDirectCleanup(g, both(), db);
    expect(d.individualFallback).toBe(false);
    expect(d.built.ok ? [] : d.built.errors).toEqual([]);
    const o = d.outcome?.modern;
    expect(o?.ok).toBe(true);
    if (!o?.ok) return;
    const gwLevels = o.result.media.find((m) => m.medium === 'groundwater')!.levels;
    const lb = gwLevels.find((l) => l.chemical === BENZENE)!.level!;
    const lm = gwLevels.find((l) => l.chemical === MTBE)!.level!;
    expect(lm / lb).toBeCloseTo(3, 9);
  });

  it('modeled: all together falls back to each chemical alone, since no air or water ratios are measured', () => {
    const d = guidedDirectCleanup(
      gw((x) => (x.targets.allocation = 'cumulative')),
      both(),
      db,
    );
    expect(d.individualFallback).toBe(true);
    expect(d.built.ok).toBe(true);
  });
});
