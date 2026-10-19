import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import type { HouseholdRiskFeed } from '../household/feeds';
import { buildCleanup } from './build';
import { runCleanup } from './compute';
import { defaultCleanupForm } from './form';
import { householdSourceLevels } from './householdLevels';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const ON: PathwayId[] = ['showerInhalation', 'outdoorInhalation'];

function outcome() {
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, ON.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  const form = {
    ...f,
    chemicals: [newChemicalRow(db.byId.get('71-43-2')!)],
    a: { ...f.a, pathways, bathTime: '0.25', outdoorTime: '2' },
  };
  const b = buildCleanup(form, db);
  if (!b.ok) throw new Error(b.errors.join('; '));
  return runCleanup(b);
}

const FEED: HouseholdRiskFeed = {
  chemicalId: '71-43-2',
  label: 'Benzene, household run',
  coefficients: { bathroomAir: 0.002, sprayAir: 5e-5, particulateAir: 2e-9 },
  methods: {
    bathroomAir: 'shower.little-1992',
    sprayAir: 'irrigation.sprinkler-fc',
    particulateAir: 'particulate.ssg-pef-1996',
  },
};

describe('householdSourceLevels', () => {
  it('divides the air level by the model coefficient: tap water, irrigation water and soil', () => {
    const out = outcome();
    const rows = householdSourceLevels(out, FEED);
    const modern = rows.filter((r) => r.method === 'modern');
    expect(modern.map((r) => r.what)).toEqual([
      'Tap water (shower air)',
      'Irrigation water (sprinkler spray air)',
      'Surface soil (windblown particulates)',
    ]);
    if (!out.modern.ok) throw new Error('modern should run');
    const bath = out.modern.result.media.find((m) => m.medium === 'bathroomAir')!.levels[0]!;
    const outdoor = out.modern.result.media.find((m) => m.medium === 'outdoorAir')!.levels[0]!;
    expect(modern[0]!.level).toBe(bath.level! / 0.002);
    expect(modern[1]!.level).toBe(outdoor.level! / 5e-5);
    expect(modern[2]!.level).toBe(outdoor.level! / 2e-9);
    // the level reproduces the air level through the coefficient
    expect(modern[0]!.level! * 0.002).toBeCloseTo(bath.level!, 18);
    expect(modern[0]!.unit).toBe('mg/L');
    expect(modern[2]!.unit).toBe('mg/kg');
  });

  it('names the household method behind each row and puts the RSL term on indoor air', () => {
    const out = outcome();
    const rows = householdSourceLevels(out, FEED);
    expect(rows.find((r) => r.what.startsWith('Tap water'))!.householdMethod).toBe(
      'shower.little-1992',
    );
    expect(rows.find((r) => r.what.startsWith('Irrigation'))!.householdMethod).toBe(
      'irrigation.sprinkler-fc',
    );
  });

  it('labels the RSL whole-house term as household air', () => {
    const f = defaultCleanupForm();
    const pathways = Object.fromEntries(
      PATHWAY_IDS.map((p) => [p, p === 'indoorInhalation']),
    ) as Record<PathwayId, boolean>;
    const b = buildCleanup(
      {
        ...f,
        chemicals: [newChemicalRow(db.byId.get('71-43-2')!)],
        a: { ...f.a, pathways },
      },
      db,
    );
    if (!b.ok) throw new Error(b.errors.join('; '));
    const rows = householdSourceLevels(runCleanup(b), {
      ...FEED,
      coefficients: { householdAir: 0.5 },
      methods: { householdAir: 'shower.rsl-household' },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.what).toBe('Tap water (household air)');
    expect(rows[0]!.householdMethod).toBe('shower.rsl-household');
  });

  it('skips a term the feed did not compute and a chemical it was not run for', () => {
    const out = outcome();
    const some = householdSourceLevels(out, {
      ...FEED,
      coefficients: { bathroomAir: 0.002 },
      methods: {},
    });
    expect(some.every((r) => r.what.startsWith('Tap water'))).toBe(true);
    expect(householdSourceLevels(out, { ...FEED, chemicalId: '108-88-3' })).toEqual([]);
  });

  it('reports a zero coefficient as not quantified, with the engine warning', () => {
    const rows = householdSourceLevels(outcome(), {
      ...FEED,
      coefficients: { bathroomAir: 0 },
      methods: {},
    });
    expect(rows[0]!.level).toBeNull();
    expect(rows[0]!.warnings.join(' ')).toMatch(/coefficient 0/);
  });
});
