import { describe, expect, it } from 'vitest';
import table from './fixtures/cleanup/ssg1996-table-a1.json' with { type: 'json' };
import {
  dilutionAttenuationFactor,
  massLimitLevel,
  mixingDepth,
  partitionFactor,
  ssgLeachingLevel,
  GENERIC_DAF,
} from '../src/processes/cleanup/ssg.js';
import { equilibriumPoreWater } from '../src/processes/vadose/partitioning.js';
import { soilSaturationConcentration } from '../src/processes/saturatedSource/partitioning.js';

const YEAR = 365.25 * 86400;
const RHO_B = table.soil.bulkDensityKgPerL * 1000;
const RHO_S = table.soil.particleDensityKgPerL * 1000;
const soil = {
  rhoB: RHO_B,
  rhoS: RHO_S,
  foc: table.soil.foc,
  theta: table.soil.waterFilledPorosity,
};

/** Half a unit in the last printed digit of Table A-1. */
function halfUnit(printed: number): number {
  const sig = printed >= 10 ? 2 : 1;
  return 0.5 * 10 ** (Math.floor(Math.log10(printed)) - sig + 1);
}

function level(c: (typeof table.chemicals)[number], daf: number): number {
  const kd = 'kdLPerKg' in c ? c.kdLPerKg * 1e-3 : undefined;
  const koc = 'kocLPerKg' in c ? c.kocLPerKg * 1e-3 : undefined;
  const r = ssgLeachingLevel({
    kind: c.kind as 'organic' | 'inorganic',
    soil,
    ...(kd !== undefined ? { kd } : {}),
    ...(koc !== undefined ? { koc } : {}),
    H: c.henryDimensionless,
    target: c.mclMgPerL * 1e-3,
    daf,
  });
  return r.level * 1e6; // kg/kg to mg/kg
}

describe('SSG 1996 Table A-1 (fixture 1)', () => {
  it('has thirty printed values', () => {
    expect(table.chemicals).toHaveLength(15);
  });
  for (const c of table.chemicals) {
    it(`${c.name}: DAF 20 prints ${c.printedDaf20MgPerKg}, DAF 1 prints ${c.printedDaf1MgPerKg}`, () => {
      expect(Math.abs(level(c, GENERIC_DAF.halfAcre) - c.printedDaf20MgPerKg)).toBeLessThanOrEqual(
        halfUnit(c.printedDaf20MgPerKg),
      );
      expect(Math.abs(level(c, GENERIC_DAF.none) - c.printedDaf1MgPerKg)).toBeLessThanOrEqual(
        halfUnit(c.printedDaf1MgPerKg),
      );
    });
  }
});

describe('H3: site-specific DAF', () => {
  const site = { K: 10 / 86400, i: 0.005, I: 0.18 / YEAR, L: 45, da: 10 };
  it('mixing depth and DAF, aquifer 10 m', () => {
    const d = dilutionAttenuationFactor(site);
    expect(d.mixingDepth).toBeCloseTo(5.19619198, 8);
    expect(Math.abs(d.daf - 12.71548841) / 12.71548841).toBeLessThan(1e-9);
    expect(d.capped).toBe(false);
  });
  it('mixing depth capped at a 3 m aquifer and warned', () => {
    const d = dilutionAttenuationFactor({ ...site, da: 3 });
    expect(d.capped).toBe(true);
    expect(d.mixingDepth).toBe(3);
    expect(Math.abs(d.daf - 7.76388889) / 7.76388889).toBeLessThan(1e-9);
    expect(mixingDepth({ ...site, da: 3 }).uncapped).toBeGreaterThan(3);
    const r = ssgLeachingLevel({
      kind: 'organic',
      soil: { rhoB: 1500 },
      koc: 0.1458,
      H: 0.22690106295994,
      target: 0.005e-3,
      daf: { site: { ...site, da: 3 } },
    });
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.mixing-depth-capped');
  });
  it('benzene with RSL inputs: partition factor and SSL', () => {
    const r = ssgLeachingLevel({
      kind: 'organic',
      soil: { rhoB: 1500 },
      koc: 0.1458,
      H: 0.22690106295994,
      target: 0.005e-3,
      daf: { site },
    });
    expect(Math.abs(r.partitionFactor * 1e3 - 0.5118641201) / 0.5118641201).toBeLessThan(1e-9);
    expect(Math.abs(r.level * 1e6 - 3.25430114e-2) / 3.25430114e-2).toBeLessThan(1e-9);
    expect(r.mixingDepth).toBeCloseTo(5.19619198, 8);
  });
});

describe('H4: mass-limit level', () => {
  const base = {
    kind: 'organic' as const,
    soil: { rhoB: 1500 },
    koc: 0.0589 * 1, // m3/kg
    H: 0.228,
    target: 0.1e-3 / 20, // 0.1 mg/L at DAF 20
    daf: 20,
  };
  it('F_mass = 0.42 mg/kg to 1e-12', () => {
    const f = massLimitLevel({
      cw: 0.1e-3,
      depth: 2,
      rhoB: 1500,
      infiltration: 0.18 / YEAR,
      duration: 70 * YEAR,
    });
    expect(Math.abs(f * 1e6 - 0.42) / 0.42).toBeLessThan(1e-12);
  });
  it('governs over the partition level of about 0.0338 mg/kg', () => {
    const r = ssgLeachingLevel({ ...base, koc: 58.9e-3, sourceDepth: 2 });
    expect(r.partitionLevel * 1e6).toBeCloseTo(0.0338, 4);
    expect(r.governs).toBe('mass-limit');
    expect(r.level).toBe(r.massLimitLevel);
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.mass-limit-governs');
  });
  it('partition level governs for a deep source and no warning is raised', () => {
    const r = ssgLeachingLevel({ ...base, koc: 58.9e-3, sourceDepth: 2000 });
    expect(r.governs).toBe('partition');
    expect(r.warnings.map((w) => w.code)).not.toContain('cleanup.mass-limit-governs');
  });
});

describe('identity (e): partition factor inverts equilibrium partitioning', () => {
  it('P x equilibriumPoreWater(F = 1) = 1', () => {
    const p = { soil: { rhoB: 1500 }, koc: 0.1458, H: 0.22690106295994 };
    const P = partitionFactor(p);
    const n = 1 - 1500 / 2650;
    const c = equilibriumPoreWater({
      F: 1,
      rhoB: 1500,
      kd: 0.1458 * 0.002,
      theta: 0.3,
      thetaA: n - 0.3,
      H: 0.22690106295994,
    });
    expect(Math.abs(P * c - 1)).toBeLessThan(1e-12);
  });
});

describe('range errors', () => {
  const ok = {
    kind: 'organic' as const,
    soil: { rhoB: 1500 },
    koc: 0.1,
    H: 0.1,
    target: 1e-5,
    daf: 1,
  };
  it('rejects bad soil, DAF, depths and coefficients', () => {
    expect(() => ssgLeachingLevel({ ...ok, daf: 0.5 })).toThrow(RangeError);
    expect(() => ssgLeachingLevel({ ...ok, target: 0 })).toThrow(RangeError);
    expect(() => ssgLeachingLevel({ ...ok, soil: { rhoB: 2650 } })).toThrow(RangeError);
    expect(() => ssgLeachingLevel({ ...ok, soil: { rhoB: 0 } })).toThrow(RangeError);
    expect(() => ssgLeachingLevel({ ...ok, soil: { rhoB: 1500, theta: 0.5 } })).toThrow(RangeError);
    expect(() => ssgLeachingLevel({ ...ok, soil: { rhoB: 1500, theta: -0.1 } })).toThrow(
      RangeError,
    );
    expect(() => ssgLeachingLevel({ ...ok, soil: { rhoB: 1500, thetaA: 1.5 } })).toThrow(
      RangeError,
    );
    expect(() => ssgLeachingLevel({ ...ok, soil: { rhoB: 1500, foc: -1 } })).toThrow(RangeError);
    expect(() => ssgLeachingLevel({ ...ok, koc: -1 })).toThrow(RangeError);
    expect(() => ssgLeachingLevel({ ...ok, H: -1 })).toThrow(RangeError);
    expect(() => ssgLeachingLevel({ ...ok, sourceDepth: 0 })).toThrow(RangeError);
    expect(() =>
      ssgLeachingLevel({ kind: 'organic', soil: { rhoB: 1500 }, H: 0.1, target: 1e-5, daf: 1 }),
    ).toThrow(RangeError);
    const site = { K: 1e-5, i: 0.01, I: 1e-9, L: 30, da: 5 };
    for (const k of ['K', 'i', 'I', 'L', 'da'] as const) {
      expect(() => dilutionAttenuationFactor({ ...site, [k]: 0 })).toThrow(RangeError);
    }
  });
});

describe('warnings', () => {
  it('henry-assumed-zero for an organic with a blank H, not for an inorganic', () => {
    const base = { soil: { rhoB: 1500 }, koc: 0.1, target: 1e-5, daf: 1 };
    const org = ssgLeachingLevel({ ...base, kind: 'organic' });
    expect(org.warnings.map((w) => w.code)).toContain('cleanup.henry-assumed-zero');
    const inorg = ssgLeachingLevel({ ...base, kind: 'inorganic' });
    expect(inorg.warnings).toHaveLength(0);
  });
  it('csat-exceeded and leachate-above-solubility', () => {
    // benzene-like: S 1.75 kg/m3; a huge target gives a leachate and level above the limits
    const r = ssgLeachingLevel({
      kind: 'organic',
      soil: { rhoB: 1500 },
      koc: 0.0589,
      H: 0.228,
      target: 0.5,
      daf: 20,
      solubility: 1.75,
    });
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('cleanup.csat-exceeded');
    expect(codes).toContain('cleanup.leachate-above-solubility');
    const n = 1 - 1500 / 2650;
    const csat = soilSaturationConcentration({
      S: 1.75,
      x: 1,
      rhoB: 1500,
      kd: 0.0589 * 0.002,
      theta: 0.3,
      thetaA: n - 0.3,
      H: 0.228,
    });
    expect(r.csat).toBe(csat);
  });
  it('no csat warning for a small level', () => {
    const r = ssgLeachingLevel({
      kind: 'organic',
      soil: { rhoB: 1500 },
      koc: 0.0589,
      H: 0.228,
      target: 5e-6,
      daf: 1,
      solubility: 1.75,
    });
    expect(r.warnings).toHaveLength(0);
  });
});
