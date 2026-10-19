import { describe, expect, it } from 'vitest';
import {
  DIRECT_PATHWAY_IDS,
  PATHWAY_IDS,
  PATHWAYS,
  backCalculateLegacy,
  backCalculateModern,
  efhHomeProducedIntake,
  evaluateLegacyReceptor,
  evaluateModernReceptor,
  irrigationInputFromSource,
  irrigationSource,
  legacyPathway,
  legacyReceptor,
  lifeStage,
  modernPathway,
  producePlantFactor,
  legacyPlantUptake,
  hhrapProduce,
  type ModernReceptor,
} from '../src/index.js';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const DAY = 86400;
const YEAR = 365 * DAY;

// ---- hand case: one produce class, legacy kernel
const sfo = 2e-9; // (kg/(kg s))^-1, arbitrary test value
const rfdo = 3e-11; // kg/(kg s)
const bp = 0.05; // kg fresh / kg soil
const receptor = legacyReceptor({
  bwKg: 70,
  edYr: 30,
  efDaysPerYr: 350,
  produce: { root: { kgPerDay: 0.1, lossFraction: 0.2, fractionHomegrown: 0.4 } },
});
const chem = { sfo, rfdo, produceFactors: { root: bp } };

describe('produce pathway registration', () => {
  it('sits beside the nine direct pathways and reads the soil medium', () => {
    expect(DIRECT_PATHWAY_IDS).toHaveLength(9);
    expect(PATHWAY_IDS).toHaveLength(10);
    expect(PATHWAY_IDS).toContain('produce');
    expect(PATHWAYS.produce).toEqual({ medium: 'soil', route: 'oral', epcUnit: 'mg/kg' });
  });
});

describe('legacy produce kernel against a hand-computed dose', () => {
  const cs = 1e-4; // kg/kg soil
  const cell = legacyPathway('produce', { cancer: cs, noncancer: cs }, receptor, chem);
  const perEpc = (bp * (1 - 0.2) * (0.1 / DAY) * 0.4) / 70; // kg/(kg s) per kg/kg
  const ef = 350 / 365;
  it('CADD and LADD follow C_p (1 - L) IR FH EF ED / (BW AT)', () => {
    expect(cell.computable).toBe(true);
    expect(rel(cell.cadd!, perEpc * cs * ef)).toBeLessThan(1e-10);
    expect(rel(cell.ladd!, (perEpc * cs * ef * 30 * YEAR) / (70 * YEAR))).toBeLessThan(1e-10);
    expect(rel(cell.risk!, sfo * cell.ladd!)).toBeLessThan(1e-10);
    expect(rel(cell.hq!, cell.cadd! / rfdo)).toBeLessThan(1e-10);
  });
  it('a per-body-weight intake rate gives the same dose independent of body weight', () => {
    const per = legacyReceptor({
      bwKg: 15,
      edYr: 30,
      efDaysPerYr: 350,
      produce: {
        root: { gPerKgDay: (0.1 * 1000) / 70, lossFraction: 0.2, fractionHomegrown: 0.4 },
      },
    });
    const c2 = legacyPathway('produce', { cancer: cs, noncancer: cs }, per, chem);
    expect(rel(c2.cadd!, cell.cadd!)).toBeLessThan(1e-10);
  });
  it('sums the classes', () => {
    const r2 = legacyReceptor({
      bwKg: 70,
      edYr: 30,
      efDaysPerYr: 350,
      produce: {
        root: { kgPerDay: 0.1, fractionHomegrown: 1 },
        abovegroundExposed: { kgPerDay: 0.2, fractionHomegrown: 0.5 },
      },
    });
    const c = legacyPathway('produce', { cancer: 1, noncancer: 1 }, r2, {
      rfdo,
      produceFactors: { root: 0.1, abovegroundExposed: 0.3 },
    });
    const expected = ((0.1 * 0.1 + 0.3 * 0.2 * 0.5) / DAY / 70) * (350 / 365);
    expect(rel(c.cadd!, expected)).toBeLessThan(1e-10);
  });
  it('is not computable, never zero, without a plant factor or an intake', () => {
    const noFactor = legacyPathway('produce', { cancer: 1, noncancer: 1 }, receptor, { sfo });
    expect(noFactor.computable).toBe(false);
    expect(noFactor.missing).toEqual(['produceFactors.root']);
    const bare = legacyReceptor({ bwKg: 70, edYr: 30, efDaysPerYr: 350 });
    const noIntake = legacyPathway('produce', { cancer: 1, noncancer: 1 }, bare, chem);
    expect(noIntake.computable).toBe(false);
    expect(noIntake.missing).toEqual(['produce']);
  });
  it('rejects an intake given both ways, neither way, or a fraction out of range', () => {
    const base = { bwKg: 70, edYr: 30, efDaysPerYr: 350 };
    expect(() =>
      legacyReceptor({
        ...base,
        produce: { root: { kgPerDay: 0.1, gPerKgDay: 1, fractionHomegrown: 1 } },
      }),
    ).toThrow(RangeError);
    expect(() => legacyReceptor({ ...base, produce: { root: { fractionHomegrown: 1 } } })).toThrow(
      RangeError,
    );
    expect(() =>
      legacyReceptor({ ...base, produce: { root: { kgPerDay: 0.1, fractionHomegrown: 1.5 } } }),
    ).toThrow(RangeError);
    expect(() =>
      legacyReceptor({
        ...base,
        produce: { root: { kgPerDay: 0.1, lossFraction: 1, fractionHomegrown: 1 } },
      }),
    ).toThrow(RangeError);
  });
  it('reports a missing plant factor as a chemical gap in the receptor run', () => {
    const res = evaluateLegacyReceptor({
      label: 'r',
      receptor,
      pathways: ['produce'],
      chemicals: [{ id: 'x', chemical: { sfo }, epcs: { produce: 1e-4 } }],
    });
    expect(res.warnings.map((w) => w.code)).toContain('exposure.not-quantified');
    expect(res.warnings.map((w) => w.code)).not.toContain('exposure.site-specific-required');
    expect(res.totals.risk).toBe(0);
  });
});

describe('modern produce kernel, two stages', () => {
  const stages = [
    lifeStage({
      id: 'child',
      group: 'child',
      bwKg: 15,
      edYr: 6,
      efDaysPerYr: 350,
      produce: { abovegroundExposed: { gPerKgDay: 3, lossFraction: 0.1, fractionHomegrown: 0.5 } },
    }),
    lifeStage({
      id: 'adult',
      group: 'adult',
      bwKg: 80,
      edYr: 20,
      efDaysPerYr: 350,
      produce: { abovegroundExposed: { gPerKgDay: 1, lossFraction: 0.1, fractionHomegrown: 0.5 } },
    }),
  ];
  const rec: ModernReceptor = { label: 'resident', lifetime: 70 * YEAR, stages };
  const mc = { mutagen: false, sfo, rfdo, produceFactors: { abovegroundExposed: 0.02 } };
  const cell = modernPathway('produce', rec, mc, 1);
  const unit = (g: number) => (0.02 * 0.9 * 0.5 * (g * 1e-3)) / DAY;
  it('stage cancer coefficients and group hazard quotients', () => {
    const ef = 350 / 365;
    const c0 = (sfo * unit(3) * ef * 6 * YEAR) / (70 * YEAR);
    const c1 = (sfo * unit(1) * ef * 20 * YEAR) / (70 * YEAR);
    expect(rel(cell.riskPerEpc!, c0 + c1)).toBeLessThan(1e-10);
    expect(rel(cell.riskByStage[0]!.riskPerEpc, c0)).toBeLessThan(1e-10);
    expect(
      rel(cell.hqByGroup.find((g) => g.group === 'child')!.hqPerEpc, (unit(3) * ef) / rfdo),
    ).toBeLessThan(1e-10);
    expect(cell.hqPerEpc).toBe(Math.max(...cell.hqByGroup.map((g) => g.hqPerEpc)));
  });
  it('is not computable without a factor', () => {
    const c = modernPathway('produce', rec, { mutagen: false, sfo }, 1);
    expect(c.computable).toBe(false);
    expect(c.missing).toEqual(['produceFactors.abovegroundExposed']);
  });
  it('flags a missing factor as a chemical gap in the receptor run', () => {
    const res = evaluateModernReceptor({
      label: 'r',
      receptor: rec,
      pathways: ['produce'],
      chemicals: [{ id: 'x', chemical: { mutagen: false, sfo }, epcs: { produce: 1e-4 } }],
    });
    expect(res.warnings.map((w) => w.code)).not.toContain('exposure.site-specific-required');
  });
});

describe('closed-form produce level in M5 (inverts to the target)', () => {
  it('legacy: the soil level returns the target cancer risk through the forward kernel', () => {
    const res = backCalculateLegacy({
      receptors: [{ label: 'r', receptor, pathways: ['produce'] }],
      chemicals: [{ id: 'x', chemical: chem }],
    });
    const lv = res.media[0]!.levels[0]!;
    expect(res.media[0]!.medium).toBe('soil');
    const forward = legacyPathway(
      'produce',
      { cancer: lv.cancerLevel!, noncancer: lv.cancerLevel! },
      receptor,
      chem,
    );
    expect(rel(forward.risk!, 1e-6)).toBeLessThan(1e-9);
    const fwdHq = legacyPathway(
      'produce',
      { cancer: lv.noncancerLevel!, noncancer: lv.noncancerLevel! },
      receptor,
      chem,
    );
    expect(rel(fwdHq.hq!, 1)).toBeLessThan(1e-9);
  });
  it('modern: the soil level returns the target through the staged kernel', () => {
    const stage = lifeStage({
      id: 'adult',
      group: 'adult',
      bwKg: 80,
      edYr: 20,
      efDaysPerYr: 350,
      produce: { root: { gPerKgDay: 1, fractionHomegrown: 1 } },
    });
    const rec: ModernReceptor = { label: 'a', lifetime: 70 * YEAR, stages: [stage] };
    const mc = { mutagen: false, sfo, rfdo, produceFactors: { root: 0.1 } };
    const res = backCalculateModern({
      receptors: [{ label: 'a', receptor: rec, pathways: ['produce'] }],
      chemicals: [{ id: 'x', chemical: mc }],
    });
    const lv = res.media[0]!.levels[0]!;
    expect(rel(modernPathway('produce', rec, mc, lv.cancerLevel!).risk!, 1e-6)).toBeLessThan(1e-9);
    expect(rel(modernPathway('produce', rec, mc, lv.noncancerLevel!).hq!, 1)).toBeLessThan(1e-9);
  });
});

describe('plant factor from the uptake engines', () => {
  const soil = { bulkDensity_kg_per_m3: 1500, waterFilledPorosity: 0.3, kd_m3_per_kg: 0.004 };
  it('legacy root factor equals the uptake concentration per unit soil concentration', () => {
    const f = producePlantFactor({
      method: 'legacy',
      input: { logKow: 3, soil, produce: 'root', leaf: undefined as never },
    });
    const direct = legacyPlantUptake({
      logKow: 3,
      soil: { ...soil, concentration_kg_per_kg: 1e-3 },
      produce: 'root',
      leaf: undefined as never,
    });
    expect(rel(f.factor!, direct.concentration_kg_per_kg! / 1e-3)).toBeLessThan(1e-12);
  });
  it('hhrap converts dry weight to fresh weight with a user moisture fraction', () => {
    const f = producePlantFactor({
      method: 'hhrap',
      moistureFraction: 0.85,
      input: { logKow: 3, kd_m3_per_kg: 0.004, produce: 'aboveground-protected' },
    });
    const d = hhrapProduce({
      logKow: 3,
      kd_m3_per_kg: 0.004,
      soilConcentration_kg_per_kg: 1,
      produce: 'aboveground-protected',
    });
    expect(rel(f.factor!, d.total_kg_per_kg_dw! * 0.15)).toBeLessThan(1e-12);
  });
  it('is null (not quantified) for an inorganic without a user factor', () => {
    const f = producePlantFactor({
      method: 'hhrap',
      moistureFraction: 0.85,
      input: { logKow: 3, kd_m3_per_kg: 0.004, produce: 'root', inorganic: true },
    });
    expect(f.factor).toBeNull();
    expect(f.warnings.map((w) => w.code)).toContain('PLANT_INORGANIC_NEEDS_BCF');
  });
  it('requires a moisture fraction in [0, 1)', () => {
    expect(() =>
      producePlantFactor({
        method: 'hhrap',
        moistureFraction: 1,
        input: { logKow: 3, kd_m3_per_kg: 0.004, produce: 'root' },
      }),
    ).toThrow(RangeError);
  });
});

describe('irrigation interface consuming the M7 source', () => {
  const src = irrigationSource({
    waterConcentration: (t) => 2e-3 + 1e-3 * (t / YEAR),
    applicationRate: 5e-9, // m/s
    chemical: 'benzene',
  });
  it('converts the M7 source to the plant interface at a time', () => {
    const i = irrigationInputFromSource(src, 0);
    expect(i.source).toBe('m7');
    expect(rel(i.concentration_mg_per_L, 2)).toBeLessThan(1e-12);
    // 5e-9 m/s = 5e-9 * 86400 * 1000 L/m2/d
    expect(rel(i.applicationRate_L_per_m2_per_d, 5e-9 * DAY * 1000)).toBeLessThan(1e-12);
    const later = irrigationInputFromSource(src, YEAR);
    expect(rel(later.concentration_mg_per_L, 3)).toBeLessThan(1e-12);
  });
  it('root-zone water replaces the pore water in the legacy plant engine; foliar mass is added', () => {
    const leaf = {
      tscf: 0.5,
      transpiration_m3_per_d: 1e-3,
      conductance_m_per_d: 0,
      leafArea_m2: 1,
      mass_kg: 1,
      kLeafAir_m3_per_kg: 1,
      lossRate_per_d: 0.1,
    };
    const soil = {
      concentration_kg_per_kg: 0,
      bulkDensity_kg_per_m3: 1500,
      waterFilledPorosity: 0.3,
      kd_m3_per_kg: 0.004,
    };
    const input = irrigationInputFromSource(src, 0);
    const base = legacyPlantUptake({ logKow: 3, soil, produce: 'aboveground', leaf });
    expect(base.concentration_kg_per_kg).toBe(0);
    const root = legacyPlantUptake({
      logKow: 3,
      soil,
      produce: 'aboveground',
      leaf,
      irrigation: { input, rootZone: true },
    });
    // steady state: TSCF Q Cw / (lambda M), Cw = 2e-3 kg/m3
    expect(rel(root.concentration_kg_per_kg!, (0.5 * 1e-3 * 2e-3) / 0.1)).toBeLessThan(1e-12);
    const foliar = legacyPlantUptake({
      logKow: 3,
      soil,
      produce: 'aboveground',
      leaf,
      irrigation: { input, interceptionFraction: 0.3, plantedArea_m2: 2 },
    });
    // foliar source: f Cw[kg/m3] rate[m/d] A = 0.3 * 2e-3 * (5e-9*86400) * 2
    const source = 0.3 * 2e-3 * 5e-9 * DAY * 2;
    expect(rel(foliar.concentration_kg_per_kg!, source / 0.1)).toBeLessThan(1e-12);
  });
  it('raises IRRIGATION_USER_ENTERED for a user-entered input and not for M7', () => {
    const leaf = {
      tscf: 0.5,
      transpiration_m3_per_d: 1e-3,
      conductance_m_per_d: 0,
      leafArea_m2: 1,
      mass_kg: 1,
      kLeafAir_m3_per_kg: 1,
      lossRate_per_d: 0.1,
    };
    const soil = {
      concentration_kg_per_kg: 0,
      bulkDensity_kg_per_m3: 1500,
      waterFilledPorosity: 0.3,
      kd_m3_per_kg: 0.004,
    };
    const user = {
      concentration_mg_per_L: 1,
      applicationRate_L_per_m2_per_d: 2,
      source: 'user' as const,
    };
    const a = legacyPlantUptake({
      logKow: 3,
      soil,
      produce: 'aboveground',
      leaf,
      irrigation: { input: user, rootZone: true },
    });
    expect(a.warnings.map((w) => w.code)).toContain('IRRIGATION_USER_ENTERED');
    const m7 = legacyPlantUptake({
      logKow: 3,
      soil,
      produce: 'aboveground',
      leaf,
      irrigation: { input: irrigationInputFromSource(src, 0), rootZone: true },
    });
    expect(m7.warnings.map((w) => w.code)).not.toContain('IRRIGATION_USER_ENTERED');
  });
});

describe('EFH home-produced intake preset (epa2011efh, chapter 13)', () => {
  it('maps the consumer-only means to the three classes net of the preparation loss', () => {
    const p = efhHomeProducedIntake('20 to 39');
    // root: Table 13-62 mean 0.87 g/kg-day, vegetable preparation loss 12.4 percent
    expect(rel(p.intakes.root!.gPerKgDay!, 0.87 * (1 - 0.124))).toBeLessThan(1e-12);
    expect(p.intakes.root!.fractionHomegrown).toBe(1);
    // exposed: exposed fruit 1.09 with the fruit loss plus exposed vegetables 1.05 with the vegetable loss
    expect(
      rel(p.intakes.abovegroundExposed!.gPerKgDay!, 1.09 * (1 - 0.254) + 1.05 * (1 - 0.124)),
    ).toBeLessThan(1e-12);
    expect(p.omitted).toEqual([]);
  });
  it('omits a class when a food group has too few observations, and says so', () => {
    const p = efhHomeProducedIntake('1 to 2');
    expect(p.intakes.abovegroundExposed).toBeUndefined();
    expect(p.omitted).toContain('abovegroundExposed');
    expect(p.intakes.root).toBeDefined();
  });
  it('feeds the boundary converters', () => {
    const p = efhHomeProducedIntake('20 to 39');
    const r = legacyReceptor({ bwKg: 70, edYr: 30, efDaysPerYr: 350, produce: p.intakes });
    expect(r.produce?.root?.intakeRatePerBw).toBeGreaterThan(0);
  });
});
