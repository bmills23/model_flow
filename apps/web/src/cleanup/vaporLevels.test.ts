import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import type { VaporRiskFeed } from '../vapor/feeds';
import { buildCleanup } from './build';
import { runCleanup } from './compute';
import { defaultCleanupForm } from './form';
import { vaporSourceLevels } from './vaporLevels';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const ON: PathwayId[] = ['indoorInhalation', 'outdoorInhalation'];

function outcome() {
  const f = defaultCleanupForm();
  const pathways = Object.fromEntries(PATHWAY_IDS.map((p) => [p, ON.includes(p)])) as Record<
    PathwayId,
    boolean
  >;
  const form = {
    ...f,
    chemicals: [newChemicalRow(db.byId.get('71-43-2')!)],
    a: { ...f.a, pathways, outdoorTime: '2' },
  };
  const b = buildCleanup(form, db);
  if (!b.ok) throw new Error(b.errors.join('; '));
  return runCleanup(b);
}

const EPC = { kind: 'constant' as const, value: 1e-6, origin: 'x' };
const FEED: VaporRiskFeed = {
  chemicalId: '71-43-2',
  label: 'Benzene, vapor run',
  indoor: EPC,
  outdoor: EPC,
  coefficients: {
    indoor: { quantified: true, methodId: 'vapor.je-1991', value: 2e-4, source: 'groundwater' },
    outdoor: {
      quantified: true,
      methodId: 'outdoorAir.box',
      value: 3e-9,
      source: 'soil',
      maxSource: 100,
    },
  },
};

function levelOf(o: ReturnType<typeof outcome>, method: 'legacy' | 'modern', medium: string) {
  const m = o[method];
  if (!m.ok) throw new Error('should run');
  return m.result.media.find((x) => x.medium === medium)!.levels[0]!;
}

describe('vaporSourceLevels', () => {
  it('divides the indoor and outdoor air levels by the coefficient; a larger coefficient halves the level', () => {
    const out = outcome();
    const rows = vaporSourceLevels(out, FEED);
    const modern = rows.filter((r) => r.method === 'modern');
    expect(modern.map((r) => r.what)).toEqual(['Groundwater (indoor air)', 'Soil (outdoor air)']);
    expect(modern[0]!.level).toBe(levelOf(out, 'modern', 'indoorAir').level! / 2e-4);
    expect(modern[1]!.level).toBe(levelOf(out, 'modern', 'outdoorAir').level! / 3e-9);
    expect(modern[0]!.vaporMethod).toBe('vapor.je-1991');
    expect(modern[1]!.vaporMethod).toBe('outdoorAir.box');
    expect(modern[0]!.unit).toBe('mg/L');
    expect(modern[0]!.fromSi).toBe(1e3);
    expect(modern[1]!.unit).toBe('mg/kg');
    expect(modern[1]!.fromSi).toBe(1e6);
    // the level reproduces the air level through the coefficient
    expect(modern[0]!.level! * 2e-4).toBeCloseTo(levelOf(out, 'modern', 'indoorAir').level!, 18);
    const rows2 = vaporSourceLevels(out, {
      ...FEED,
      coefficients: {
        ...FEED.coefficients!,
        indoor: { quantified: true, methodId: 'vapor.je-1991', value: 4e-4, source: 'groundwater' },
      },
    });
    expect(rows2.find((r) => r.method === 'modern')!.level).toBeCloseTo(modern[0]!.level! / 2, 18);
  });

  it('labels and scales each source medium', () => {
    const out = outcome();
    const make = (source: 'soil' | 'soilGas' | 'groundwater' | 'poreWater') =>
      vaporSourceLevels(out, {
        ...FEED,
        coefficients: {
          indoor: { quantified: true, methodId: 'vapor.je-epa', value: 1e-3, source },
        },
      })[0]!;
    expect(make('soilGas')).toMatchObject({
      what: 'Soil gas (indoor air)',
      unit: 'mg/m3',
      fromSi: 1e6,
    });
    expect(make('poreWater')).toMatchObject({
      what: 'Soil pore water (indoor air)',
      unit: 'mg/L',
      fromSi: 1e3,
    });
    expect(make('soil')).toMatchObject({ what: 'Soil (indoor air)', unit: 'mg/kg', fromSi: 1e6 });
  });

  it('reports a level above the residual-phase limit as not quantified, with the reason', () => {
    const rows = vaporSourceLevels(outcome(), {
      ...FEED,
      coefficients: {
        outdoor: {
          quantified: true,
          methodId: 'outdoorAir.box',
          value: 3e-9,
          source: 'soil',
          maxSource: 1e-12,
        },
      },
    });
    const outdoor = rows.filter((r) => r.what.includes('outdoor'));
    expect(outdoor.length).toBeGreaterThan(0);
    for (const r of outdoor) {
      expect(r.level).toBeNull();
      expect(r.reason).toMatch(/residual/i);
    }
  });

  it('carries a not-quantified coefficient with its reason, never as zero', () => {
    const rows = vaporSourceLevels(outcome(), {
      ...FEED,
      coefficients: {
        indoor: { quantified: false, methodId: 'vapor.je-epa', reason: 'a TPH mixture' },
      },
    });
    const indoor = rows.filter((r) => r.what.includes('indoor'));
    expect(indoor.length).toBeGreaterThan(0);
    for (const r of indoor) {
      expect(r.level).toBeNull();
      expect(r.cancerLevel).toBeNull();
      expect(r.reason).toBe('a TPH mixture');
      expect(r.vaporMethod).toBe('vapor.je-epa');
    }
  });

  it('reports a zero coefficient as not quantified, with the engine warning', () => {
    const rows = vaporSourceLevels(outcome(), {
      ...FEED,
      coefficients: {
        indoor: { quantified: true, methodId: 'vapor.je-1991', value: 0, source: 'groundwater' },
      },
    });
    const r = rows.find((x) => x.what.includes('indoor'))!;
    expect(r.level).toBeNull();
    expect(r.reason).toMatch(/transfers nothing/);
    expect(r.warnings.join(' ')).toMatch(/coefficient 0/);
  });

  it('says a feed saved before coefficients existed must be sent again', () => {
    const { coefficients: dropped, ...old } = FEED;
    expect(dropped).toBeDefined();
    const rows = vaporSourceLevels(outcome(), old);
    expect(rows.length).toBe(4);
    expect(rows.every((r) => r.level === null && /send it again/i.test(r.reason ?? ''))).toBe(true);
  });

  it('skips a path the feed has no air for and a chemical it was not run for', () => {
    const out = outcome();
    const { outdoor: dropped, ...indoorOnly } = FEED;
    expect(dropped).toBeDefined();
    const rows = vaporSourceLevels(out, indoorOnly);
    expect(rows.every((r) => r.what.endsWith('(indoor air)'))).toBe(true);
    expect(vaporSourceLevels(out, { ...FEED, chemicalId: '108-88-3' })).toEqual([]);
  });

  it('carries the oxygen-limited indoor method: a level where it is linear, the reason where it is not', () => {
    const out = outcome();
    const indoorOnly = (indoor: NonNullable<VaporRiskFeed['coefficients']>['indoor']) => {
      const { outdoor: _outdoor, ...rest } = FEED;
      void _outdoor;
      return { ...rest, coefficients: { indoor } } as VaporRiskFeed;
    };
    const linear = vaporSourceLevels(
      out,
      indoorOnly({
        quantified: true,
        methodId: 'vapor.devaull-2007',
        value: 5e-5,
        source: 'groundwater',
      }),
    ).find((r) => r.method === 'modern')!;
    expect(linear.vaporMethod).toBe('vapor.devaull-2007');
    expect(linear.level).toBe(levelOf(out, 'modern', 'indoorAir').level! / 5e-5);
    const reason =
      'the fast reaction front oxygen option takes the oxygen demand from the source vapor';
    const not = vaporSourceLevels(
      out,
      indoorOnly({ quantified: false, nonlinear: true, methodId: 'vapor.devaull-2007', reason }),
    ).find((r) => r.method === 'modern')!;
    expect(not.level).toBeNull();
    expect(not.reason).toBe(reason);
    expect(not.vaporMethod).toBe('vapor.devaull-2007');
  });
});
