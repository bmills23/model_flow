import { beforeAll, describe, expect, it } from 'vitest';
import { PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import {
  vaporCoefficients,
  type VaporCoefficient,
  type VaporCoefficients,
} from '../vapor/coefficients';
import type { VaporRiskFeed } from '../vapor/feeds';
import { DEFAULT_FORM, toInputs, type VaporForm } from '../vapor/form';
import { forwardAir, type VaporSolveSpec } from '../vapor/forward';
import { DEFAULT_OUTDOOR } from '../vapor/outdoor';
import type { MethodKey } from '../vapor/series';
import { buildCleanup } from './build';
import { runCleanup } from './compute';
import { defaultCleanupForm } from './form';
import { solveVaporSource } from './vaporSolve';
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

const OXY = { dvDa: '0.18', dvDw: '2.1e-5', dvH: '32' } as const;
const TPH: Partial<VaporForm> = { source: 'soil', tphOn: true, tph: '5000', tphMolarMass: '100' };

function coefficientsOf(
  patch: Partial<VaporForm>,
  method: MethodKey,
): { coefficients: VaporCoefficients; form: VaporForm } {
  const form: VaporForm = { ...DEFAULT_FORM, method, ...patch };
  const p = toInputs(form);
  if (!p.ok) throw new Error(`form: ${p.errors.join('; ')}`);
  return { coefficients: vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, method), form };
}

function solveOf(c: VaporCoefficient | undefined): VaporSolveSpec {
  if (!c?.solve) throw new Error(`no solve state: ${c && !c.quantified ? c.reason : ''}`);
  return c.solve;
}

interface Case {
  name: string;
  patch: Partial<VaporForm>;
  method: MethodKey;
  path: 'indoor' | 'outdoor';
  /** A source inside the search limit whose forward air is the target. */
  source: number;
  soil: boolean;
}

const CASES: Case[] = [
  {
    name: 'legacy indoor, TPH soil',
    patch: TPH,
    method: 'legacy',
    path: 'indoor',
    source: 2e-5,
    soil: true,
  },
  {
    name: 'modern indoor, TPH soil',
    patch: TPH,
    method: 'modern',
    path: 'indoor',
    source: 2e-5,
    soil: true,
  },
  {
    name: 'legacy outdoor box, TPH soil',
    patch: TPH,
    method: 'legacy',
    path: 'outdoor',
    source: 2e-5,
    soil: true,
  },
  {
    name: 'oxygen-limited indoor, TPH soil',
    patch: { ...TPH, dvOxMode: 'entered' },
    method: 'devaull',
    path: 'indoor',
    source: 2e-5,
    soil: true,
  },
  {
    name: 'oxygen-limited fast reaction, soil gas',
    patch: { source: 'soilGas', soilGas: '20000', dvOxMode: 'fastReaction', ...OXY },
    method: 'devaull',
    path: 'indoor',
    source: 0.02,
    soil: false,
  },
  {
    name: 'oxygen-limited coupled, soil gas',
    patch: { source: 'soilGas', soilGas: '20000', dvOxMode: 'coupled', ...OXY },
    method: 'devaull',
    path: 'indoor',
    source: 0.02,
    soil: false,
  },
  {
    name: 'oxygen-limited coupled, groundwater',
    patch: {
      source: 'groundwater',
      cgw: '1',
      capHeight: '0.2',
      capPorosity: '0.35',
      capMoisture: '0.345',
      dvOxMode: 'coupled',
      ...OXY,
    },
    method: 'devaull',
    path: 'indoor',
    source: 1e-3,
    soil: false,
  },
  {
    name: 'oxygen-limited fast reaction, soil',
    patch: { source: 'soil', soilConc: '10', dvOxMode: 'fastReaction', ...OXY },
    method: 'devaull',
    path: 'indoor',
    source: 1e-5,
    soil: true,
  },
];

describe('every solved vapor path meets its target', () => {
  for (const c of CASES) {
    it(`${c.name}: the forward air at the solved source equals the target`, () => {
      const { coefficients } = coefficientsOf(c.patch, c.method);
      const coef = coefficients[c.path];
      expect(coef?.quantified).toBe(false);
      const spec = solveOf(coef);
      // the state is plain JSON: it survives a save
      const wired: VaporSolveSpec = JSON.parse(JSON.stringify(spec));
      const target = forwardAir(wired, c.source);
      expect(target).toBeGreaterThan(0);
      const r = solveVaporSource(wired, target, c.soil);
      expect(r.error).toBeUndefined();
      expect(r.notReached).toBe(false);
      expect(r.level).not.toBeNull();
      expect(Math.abs(forwardAir(wired, r.level!) / target - 1)).toBeLessThan(1e-9);
      expect(r.warnings).toEqual([]);
      // twice the air needs more source (the model rises with it), and the level is solved each time
      const r2 = solveVaporSource(wired, target / 3, c.soil);
      expect(r2.level!).toBeLessThan(r.level!);
      expect(Math.abs(forwardAir(wired, r2.level!) / (target / 3) - 1)).toBeLessThan(1e-9);
    });
  }

  it('a TPH mixture soil source is proportional to the source up to the pure-substance limit, and the solve shows it', () => {
    const { coefficients } = coefficientsOf(TPH, 'legacy');
    const spec = solveOf(coefficients.indoor);
    expect(spec.cap?.value).toBeCloseTo((5e-3 * 78e-3) / 100e-3, 12);
    const a = forwardAir(spec, 1e-5);
    expect(forwardAir(spec, 2e-5) / a).toBeCloseTo(2, 9);
  });

  it('a target above everything the model gives up to the limit is not reached, with the limit', () => {
    const { coefficients } = coefficientsOf(
      { source: 'soilGas', soilGas: '20000', dvOxMode: 'coupled', ...OXY },
      'devaull',
    );
    const spec = solveOf(coefficients.indoor);
    const atCap = forwardAir(spec, spec.cap!.value);
    const r = solveVaporSource(spec, atCap * 2, false);
    expect(r.notReached).toBe(true);
    expect(r.level).toBeNull();
    expect(r.maxAir).toBeCloseTo(atCap, 18);
  });

  it('a soil source past its residual-phase limit: the forward model gives no more air there', () => {
    const { coefficients } = coefficientsOf({ source: 'soil', soilConc: '10' }, 'legacy');
    const ind = coefficients.indoor;
    if (!ind?.quantified || ind.maxSource === undefined || !ind.solve) throw new Error('coef');
    expect(ind.solve.cap?.value).toBe(ind.maxSource);
    const plateau = forwardAir(ind.solve, ind.maxSource);
    expect(plateau).toBeCloseTo(ind.value * ind.maxSource, 15);
    // no source past the limit gives more air
    expect(forwardAir(ind.solve, ind.maxSource * 50)).toBeCloseTo(plateau, 15);
    const r = solveVaporSource(ind.solve, plateau * 1.5, true);
    expect(r.notReached).toBe(true);
    // a target inside the range is met, and agrees with the linear coefficient
    const inside = solveVaporSource(ind.solve, plateau / 3, true);
    expect(inside.level! / (ind.maxSource / 3) - 1).toBeCloseTo(0, 8);
  });
});

function feedOf(c: Partial<VaporCoefficients>): VaporRiskFeed {
  const EPC = { kind: 'constant' as const, value: 1e-6, origin: 'x' };
  return {
    chemicalId: '71-43-2',
    label: 'Benzene, vapor run',
    ...(c.indoor ? { indoor: EPC } : {}),
    ...(c.outdoor ? { outdoor: EPC } : {}),
    coefficients: c,
  };
}

function directLevel(o: ReturnType<typeof outcome>, method: 'legacy' | 'modern', medium: string) {
  const m = o[method];
  if (!m.ok) throw new Error('should run');
  return m.result.media.find((x) => x.medium === medium)!.levels[0]!;
}

describe('vapor source levels on the cleanup screen: solved rows', () => {
  it('a TPH soil source: the row is solved, and its forward air is the cleanup screen air level', () => {
    const out = outcome();
    const legacy = coefficientsOf(TPH, 'legacy').coefficients;
    const rows = vaporSourceLevels(out, feedOf(legacy));
    expect(rows.map((r) => r.what)).toEqual([
      'Soil (indoor air)',
      'Soil (outdoor air)',
      'Soil (indoor air)',
      'Soil (outdoor air)',
    ]);
    for (const r of rows) {
      expect(r.basis).toBe('solve');
      expect(r.reason).toBeNull();
      expect(r.level).toBeGreaterThan(0);
      const path = r.what.includes('indoor') ? 'indoor' : 'outdoor';
      const spec = solveOf(legacy[path]);
      const air = directLevel(out, r.method, path === 'indoor' ? 'indoorAir' : 'outdoorAir');
      expect(Math.abs(forwardAir(spec, r.level!) / air.level! - 1)).toBeLessThan(1e-9);
      expect(r.limiting).toBe(air.limiting);
      if (air.cancerLevel !== null) {
        expect(Math.abs(forwardAir(spec, r.cancerLevel!) / air.cancerLevel - 1)).toBeLessThan(1e-9);
      }
      if (air.noncancerLevel !== null && r.noncancerLevel !== null) {
        expect(Math.abs(forwardAir(spec, r.noncancerLevel) / air.noncancerLevel - 1)).toBeLessThan(
          1e-9,
        );
      }
      if (r.noncancerLevel === null) {
        // a level the model cannot reach up to its limit is a warning with the limit, never a number
        expect(r.warnings.join(' ')).toMatch(/noncancer level: the model does not reach/);
        expect(r.warnings.join(' ')).toMatch(/pure-substance limit/);
      }
    }
  });

  it('an oxygen-limited coupled mode without a total hydrocarbon vapor: solved, indoor only', () => {
    const out = outcome();
    const { coefficients } = coefficientsOf(
      { source: 'soilGas', soilGas: '20000', dvOxMode: 'coupled', ...OXY },
      'devaull',
    );
    const feed = feedOf({ indoor: coefficients.indoor! });
    const rows = vaporSourceLevels(out, feed);
    const spec = solveOf(coefficients.indoor);
    expect(rows.every((r) => r.what === 'Soil gas (indoor air)' && r.basis === 'solve')).toBe(true);
    for (const r of rows) {
      const air = directLevel(out, r.method, 'indoorAir');
      expect(r.vaporMethod).toBe('vapor.devaull-2007');
      expect(Math.abs(forwardAir(spec, r.level!) / air.level! - 1)).toBeLessThan(1e-9);
    }
  });

  it('a level the model cannot reach up to its limit says so, with the limit, and has no level', () => {
    const out = outcome();
    const { coefficients } = coefficientsOf(
      { source: 'soilGas', soilGas: '20000', dvOxMode: 'coupled', ...OXY },
      'devaull',
    );
    const spec = solveOf(coefficients.indoor);
    // a ceiling far below the source the cleanup air level needs
    const small: VaporSolveSpec = { ...spec, cap: { value: 1e-12, label: 'saturated vapor' } };
    const rows = vaporSourceLevels(out, {
      ...feedOf({ indoor: coefficients.indoor! }),
      coefficients: { indoor: { ...coefficients.indoor!, solve: small } as VaporCoefficient },
    });
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.level).toBeNull();
      expect(r.cancerLevel).toBeNull();
      expect(r.basis).toBe('solve');
      expect(r.reason).toMatch(/does not reach the air level/);
      expect(r.reason).toMatch(/saturated vapor of 1e-6 mg\/m3|saturated vapor of /);
    }
  });

  it('a soil level past the residual-phase limit is confirmed by the solve and reported as not reached', () => {
    const out = outcome();
    const base = coefficientsOf({ source: 'soil', soilConc: '10' }, 'legacy').coefficients.outdoor;
    if (!base?.quantified || !base.solve) throw new Error('coefficient');
    // a limit far below the source the air level needs
    const tight = {
      ...base,
      maxSource: 1e-12,
      solve: { ...base.solve, cap: { value: 1e-12, label: 'residual-phase limit' } },
    };
    const rows = vaporSourceLevels(out, feedOf({ outdoor: tight }));
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.level).toBeNull();
      expect(r.basis).toBe('solve');
      expect(r.reason).toMatch(/residual-phase limit/);
    }
  });

  it('a level inside the residual-phase limit keeps the linear coefficient', () => {
    const out = outcome();
    const base = coefficientsOf({ source: 'soil', soilConc: '10' }, 'legacy').coefficients.outdoor;
    if (!base?.quantified) throw new Error('coefficient');
    const rows = vaporSourceLevels(out, feedOf({ outdoor: base }));
    for (const r of rows) {
      expect(r.basis).toBe('linear');
      expect(r.level).toBe(directLevel(out, r.method, 'outdoorAir').level! / base.value);
    }
  });

  it('a feed saved before the solve asks to be sent again, and a missing input keeps its reason', () => {
    const out = outcome();
    const old = vaporSourceLevels(
      out,
      feedOf({
        indoor: {
          quantified: false,
          methodId: 'vapor.je-1991',
          reason:
            'a soil source with a TPH mixture sets the mole fraction from the source, so the vapor is not proportional to the soil concentration',
        },
        outdoor: {
          quantified: false,
          methodId: 'outdoorAir.box',
          reason: 'Wind speed must be a number above 0',
        },
      }),
    );
    const indoor = rows(old, 'indoor');
    const outdoor = rows(old, 'outdoor');
    expect(indoor.length).toBe(2);
    for (const r of indoor) {
      expect(r.level).toBeNull();
      expect(r.reason).toMatch(/send it again/i);
      expect(r.basis).toBeNull();
    }
    for (const r of outdoor) expect(r.reason).toBe('Wind speed must be a number above 0');
  });

  it('a nonlinear path whose forward model could not be built keeps its own reason', () => {
    const out = outcome();
    const rowsOut = vaporSourceLevels(
      out,
      feedOf({
        indoor: {
          quantified: false,
          nonlinear: true,
          methodId: 'vapor.je-1991',
          reason:
            'the air concentration is not proportional to the source (the doubling check failed)',
        },
      }),
    );
    for (const r of rowsOut) expect(r.reason).toMatch(/doubling check failed/);
  });
});

function rows(all: ReturnType<typeof vaporSourceLevels>, path: 'indoor' | 'outdoor') {
  return all.filter((r) => r.what.endsWith(`(${path} air)`));
}
