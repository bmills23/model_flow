import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type Criterion, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { loadCriteriaDb, type CriteriaDb } from '../surfaceWater/criteriaDb';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import { buildCleanup } from './build';
import { runCleanup } from './compute';
import { defaultCleanupForm } from './form';
import { surfaceWaterSourceLevels } from './surfaceWaterLevels';
import { solveSurfaceJob } from './surfaceSolve';
import { run, unlinkedRequest, vadoseScenario } from './surfaceSolve.testkit';
import {
  DEFAULT_CRITERION_ENDPOINTS,
  criterionSi,
  defaultCriterion,
  newSurfaceTarget,
  surfaceTargetLevels,
  surfaceTargetTables,
  type SurfaceTargetRow,
} from './surfaceWaterTarget';

let chem: ChemicalDb;
let crit: CriteriaDb;
beforeAll(async () => {
  chem = await loadChemicalDb();
  crit = await loadCriteriaDb();
}, 30000);

const BENZENE = '71-43-2';
const XYLENE = '1330-20-7';
const NAMES = { [BENZENE]: 'Benzene', [XYLENE]: 'Xylene' };

const feed = (
  chemicalId: string | undefined,
  value: number | null = 0.04,
  extra: Partial<NonNullable<SurfaceWaterFeed['coefficient']>> = {},
): SurfaceWaterFeed => ({
  method: 'mass-discharge',
  origin: 'surfaceWater.mass-discharge',
  label: 'Modern mass-discharge surface water, 10.0 years',
  times: [1],
  values: [1e-6],
  ...(chemicalId ? { chemicalId } : {}),
  coefficient: {
    value,
    reason: value === null ? 'the run is not proportional to its source' : null,
    method: 'surfaceWater.mass-discharge',
    sourceMedium: 'groundwater',
    sourceUnit: 'mg/L',
    ...extra,
  },
});
const slots = (...fs: SurfaceWaterFeed[]) => new Map(fs.map((f) => [f.chemicalId ?? '', f]));

const user = (chemicalId: string, value: string, note: string): SurfaceTargetRow => ({
  ...newSurfaceTarget(chemicalId),
  kind: 'user',
  value,
  note,
});
const nrwqc = (chemicalId: string, criterionId = ''): SurfaceTargetRow => ({
  ...newSurfaceTarget(chemicalId),
  kind: 'nrwqc',
  criterionId,
});

describe('a criterion stated on an element basis', () => {
  it('is no target: it is not a number of the chemical itself', () => {
    const c: Criterion = {
      id: 'ccme:14797-65-0:surfaceWater:fresh:long-term',
      chemicalId: '14797-65-0',
      medium: 'surfaceWater',
      endpoint: 'ccme-fresh-long-term',
      value: 60,
      unit: 'ug/L',
      source: 'database',
    };
    expect(criterionSi(c)).toBeCloseTo(6e-5, 15);
    expect(criterionSi({ ...c, elementBasis: 'nitrogen (NO2-N)' })).toBeNull();
  });
});

describe('criterion lookup', () => {
  it('defaults to the freshwater chronic criterion, then the human health water and organism one', () => {
    expect(DEFAULT_CRITERION_ENDPOINTS).toEqual([
      'aquatic-freshwater-chronic',
      'human-health-water-organism',
    ]);
    const c = defaultCriterion(crit, BENZENE)!;
    expect(c.endpoint).toBe('human-health-water-organism');
    expect(c.value).toBeGreaterThan(0);
  });

  it('finds no criterion for a chemical the tables do not hold', () => {
    expect(defaultCriterion(crit, XYLENE)).toBeUndefined();
  });

  it('takes the freshwater chronic criterion before the human health one', () => {
    const mk = (endpoint: string, value: number): Criterion => ({
      id: `x:${endpoint}`,
      chemicalId: 'a',
      medium: 'surfaceWater',
      endpoint,
      value,
      unit: 'ug/L',
      source: 'database',
    });
    const list = [mk('human-health-water-organism', 5), mk('aquatic-freshwater-chronic', 9)];
    const db = { byChemical: new Map([['a', list]]) } as unknown as CriteriaDb;
    expect(defaultCriterion(db, 'a')!.endpoint).toBe('aquatic-freshwater-chronic');
  });
});

describe('surfaceTargetLevels', () => {
  it('refuses an untagged slot for a target in a two-chemical run, though only one chemical has a target', () => {
    const [r] = surfaceTargetLevels({
      targets: [user(BENZENE, '5', 'Permit limit')],
      runCount: 2,
      db: crit,
      slots: slots(feed(undefined)),
      names: NAMES,
      source: 'dissolved',
    });
    expect(r!.level).toBeNull();
    expect(r!.reason).toMatch(/does not record which chemical/);
  });

  it('a user value over the coefficient reproduces the direct surface water level', () => {
    const f = defaultCleanupForm();
    const pathways = Object.fromEntries(
      PATHWAY_IDS.map((p) => [p, (['swimIngestion', 'swimDermal'] as PathwayId[]).includes(p)]),
    ) as Record<PathwayId, boolean>;
    const form = {
      ...f,
      chemicals: [newChemicalRow(chem.byId.get(BENZENE)!)],
      a: { ...f.a, pathways, swimTime: '2.6', swimDays: '12' },
    };
    const b = buildCleanup(form, chem);
    if (!b.ok) throw new Error(b.errors.join('; '));
    const out = runCleanup(b);
    const sf = feed(BENZENE);
    const direct = surfaceWaterSourceLevels(out, sf).find((r) => r.method === 'modern')!;
    const ugPerL = direct.mediumLevel! * 1e6;
    const rows = surfaceTargetLevels({
      targets: [user(BENZENE, String(ugPerL), 'Permit limit')],
      db: crit,
      slots: slots(sf),
      runCount: 1,
      names: NAMES,
      source: 'dissolved',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.level).toBeCloseTo(direct.level!, 12);
    expect(rows[0]!.unit).toBe('mg/L');
    expect(rows[0]!.fromSi).toBe(1e3);
    expect(rows[0]!.targetUnit).toBe('ug/L');
  });

  it('divides an NRWQC criterion by the coefficient and cites the table', () => {
    const [r] = surfaceTargetLevels({
      targets: [nrwqc(BENZENE)],
      db: crit,
      slots: slots(feed(BENZENE, 0.5)),
      runCount: 1,
      names: NAMES,
      source: 'dissolved',
    });
    const c = defaultCriterion(crit, BENZENE)!;
    expect(r!.reason).toBeNull();
    expect(r!.target).toBeCloseTo(c.value! * 1e-6, 15);
    expect(r!.level).toBeCloseTo((c.value! * 1e-6) / 0.5, 15);
    expect(r!.basis).toBe('human-health water-organism');
    expect(r!.citationKey).toBe('epanrwqchh');
    expect(r!.citation).toMatch(/Human Health Criteria Table/);
    expect(r!.note).toBe('');
  });

  it('a chosen criterion id wins over the default', () => {
    const id = crit.byChemical
      .get(BENZENE)!
      .find((c) => c.endpoint === 'human-health-organism-only')!.id;
    const [r] = surfaceTargetLevels({
      targets: [nrwqc(BENZENE, id)],
      db: crit,
      slots: slots(feed(BENZENE)),
      runCount: 1,
      names: NAMES,
      source: 'direct',
    });
    expect(r!.basis).toBe('human-health organism-only');
  });

  it('says there is no criterion for a chemical without one, and asks for a value', () => {
    const [r] = surfaceTargetLevels({
      targets: [nrwqc(XYLENE)],
      db: crit,
      slots: slots(feed(XYLENE)),
      runCount: 1,
      names: NAMES,
      source: 'dissolved',
    });
    expect(r!.level).toBeNull();
    expect(r!.reason).toMatch(/Xylene.*no NRWQC surface water criterion.*enter your own value/i);
  });

  it('a user value needs a positive number and a note', () => {
    const run = (t: SurfaceTargetRow) =>
      surfaceTargetLevels({
        targets: [t],
        db: crit,
        slots: slots(feed(XYLENE)),
        runCount: 1,
        names: NAMES,
        source: 'dissolved',
      })[0]!;
    expect(run(user(XYLENE, '10', '')).reason).toMatch(/note/i);
    expect(run(user(XYLENE, '', 'Permit')).reason).toMatch(/enter/i);
    expect(run(user(XYLENE, '-1', 'Permit')).reason).toMatch(/above zero/i);
    const ok = run(user(XYLENE, '10', 'State standard, 2025'));
    expect(ok.level).toBeCloseTo(10e-6 / 0.04, 15);
    expect(ok.citation).toBe('User value (this project)');
    expect(ok.citationKey).toBeNull();
    expect(ok.note).toBe('State standard, 2025');
  });

  it('a soil source with no vadose or saturated run sent says which screen to send from', () => {
    for (const source of ['vadose', 'saturated'] as const) {
      const [r] = surfaceTargetLevels({
        targets: [user(XYLENE, '10', 'n')],
        db: crit,
        slots: slots(feed(XYLENE)),
        runCount: 1,
        names: NAMES,
        source,
      });
      expect(r!.level).toBeNull();
      expect(r!.pending).toBe(false);
      expect(r!.reason).toMatch(
        source === 'vadose' ? /vadose zone screen/i : /saturated soil source screen/i,
      );
    }
  });

  it('a soil source needs a surface water run that holds its request and is linked', () => {
    const soil = {
      vadose: new Map([
        ['', { scenario: vadoseScenario, method: 'legacy' as const, label: 'R-7' }],
      ]),
      saturated: undefined,
      tphHeld: false,
    };
    const run = (f: SurfaceWaterFeed) =>
      surfaceTargetLevels({
        targets: [user(XYLENE, '10', 'n')],
        db: crit,
        slots: slots(f),
        runCount: 1,
        names: NAMES,
        source: 'vadose',
        soil,
      })[0]!;
    expect(run(feed(XYLENE)).reason).toMatch(/send the surface water result again/i);
    const unlinked = run({ ...feed(XYLENE), solve: { request: unlinkedRequest() } });
    expect(unlinked.reason).toMatch(/not linked to a groundwater transport run/i);
  });

  it('a run with an upstream background is solved, pending until the worker answers', () => {
    const request = unlinkedRequest({ background: '0.001' });
    const f: SurfaceWaterFeed = {
      ...feed(XYLENE, null, { path: 'background' }),
      solve: { request },
    };
    const args = {
      targets: [user(XYLENE, '10', 'n')],
      db: crit,
      slots: slots(f),
      runCount: 1,
      names: NAMES,
      source: 'dissolved' as const,
    };
    const [wait] = surfaceTargetLevels(args);
    expect(wait!.pending).toBe(true);
    expect(wait!.level).toBeNull();
    expect(wait!.reason).toBeNull();
    const job = wait!.job!;
    const solves = new Map([[job.key, solveSurfaceJob(job)]]);
    const [r] = surfaceTargetLevels({ ...args, solves });
    expect(r!.pending).toBe(false);
    expect(r!.path).toBe('solved');
    expect(r!.sourceMedium).toBe('groundwater');
    const forward = Math.max(
      ...run({ ...request, groundwaterConcentration: r!.level! }).modern.surfaceWater,
    );
    expect(Math.abs(forward / 10e-6 - 1)).toBeLessThan(1e-9);
    // the CSV says solved
    const [t] = surfaceTargetTables([r!]);
    expect(t!.rows[0]).toMatchObject({ path: 'solved', unit: 'mg/L' });
  });

  it('a target the background run cannot reach below the solubility is not reached, with the limit', () => {
    const request = unlinkedRequest({ background: '0.001', solubility: '0.001' });
    const f: SurfaceWaterFeed = {
      ...feed(XYLENE, null, { path: 'background', solubility: 1e-6 }),
      solve: { request },
    };
    const args = {
      targets: [user(XYLENE, '100000', 'n')],
      db: crit,
      slots: slots(f),
      runCount: 1,
      names: NAMES,
      source: 'dissolved' as const,
    };
    const job = surfaceTargetLevels(args)[0]!.job!;
    const solves = new Map([[job.key, solveSurfaceJob(job)]]);
    const [r] = surfaceTargetLevels({ ...args, solves });
    expect(r!.level).toBeNull();
    expect(r!.reason).toMatch(/not reached/i);
    expect(r!.reason).toMatch(/solubility/i);
  });

  it('names a missing surface water run, a missing coefficient and a chemical mismatch', () => {
    const run = (sl: ReturnType<typeof slots>) =>
      surfaceTargetLevels({
        targets: [user(BENZENE, '10', 'n')],
        db: crit,
        slots: sl,
        runCount: 1,
        names: NAMES,
        source: 'dissolved',
      })[0]!;
    expect(run(new Map()).reason).toMatch(/no surface water result.*Benzene/i);
    expect(run(slots(feed(BENZENE, null))).reason).toMatch(/not proportional/);
    const noCoef: SurfaceWaterFeed = { ...feed(BENZENE) };
    delete noCoef.coefficient;
    expect(run(slots(noCoef)).reason).toMatch(/send the surface water result again/i);
    expect(run(slots(feed(XYLENE))).reason).toMatch(/Xylene.*not Benzene/);
  });

  it('refuses a level above the solubility entered on the run', () => {
    const [r] = surfaceTargetLevels({
      targets: [user(BENZENE, '10', 'n')],
      db: crit,
      slots: slots(feed(BENZENE, 0.04, { solubility: 1e-6 })),
      runCount: 1,
      names: NAMES,
      source: 'dissolved',
    });
    expect(r!.level).toBeNull();
    expect(r!.reason).toMatch(/solubility/);
  });

  it('reads each chemical from its own slot', () => {
    const rows = surfaceTargetLevels({
      targets: [user(BENZENE, '10', 'n'), user(XYLENE, '10', 'n')],
      db: crit,
      slots: slots(feed(BENZENE, 0.1), feed(XYLENE, 0.2)),
      runCount: 1,
      names: NAMES,
      source: 'dissolved',
    });
    expect(rows[0]!.level).toBeCloseTo(10e-6 / 0.1, 15);
    expect(rows[1]!.level).toBeCloseTo(10e-6 / 0.2, 15);
    expect(rows[0]!.feedChemicalId).toBe(BENZENE);
  });
});

describe('surfaceTargetTables', () => {
  it('writes one row per target with the target, basis, citation and note, in screen units', () => {
    const rows = surfaceTargetLevels({
      targets: [user(XYLENE, '10', 'State standard'), nrwqc(BENZENE)],
      db: crit,
      slots: slots(feed(XYLENE), feed(BENZENE)),
      runCount: 1,
      names: NAMES,
      source: 'dissolved',
    });
    const [t] = surfaceTargetTables(rows);
    expect(t!.name).toBe('cleanup-surface-water-targets');
    expect(t!.rows).toHaveLength(2);
    expect(t!.rows[0]).toMatchObject({
      chemical: 'Xylene',
      target: 10,
      targetUnit: 'ug/L',
      basis: 'User value (this project)',
      note: 'State standard',
      unit: 'mg/L',
      reason: null,
    });
    expect(t!.rows[0]!.level).toBeCloseTo(0.25, 12);
    expect(t!.rows[1]!.basis).toMatch(/human-health water-organism/);
    expect(t!.rows[1]!.citation).toMatch(/National Recommended Water Quality Criteria/);
    expect(t!.feeds).toEqual([
      { feed: 'surfaceWater', chemicalId: XYLENE },
      { feed: 'surfaceWater', chemicalId: BENZENE },
    ]);
  });

  it('writes no table without a target', () => {
    expect(surfaceTargetTables([])).toEqual([]);
  });
});
