import { describe, expect, it } from 'vitest';
import { registry } from '../src/index.js';
import { references } from '../src/references/index.js';
import {
  briggsRootConcentrationFactor,
  hhrapAirToPlantBv,
  hhrapPlantSoilBr,
  hhrapProduce,
  leafSteadyState,
  leafTimeDependent,
  legacyPlantUptake,
  poreWaterConcentration,
  type LegacyPlantInput,
} from '../src/processes/plantUptake/index.js';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('pore water step', () => {
  it('matches C_s rho_b / (theta_w + rho_b K_d)', () => {
    const cs = 2e-6; // kg/kg
    const rhoB = 1500; // kg/m3
    const theta = 0.3;
    const kd = 0.004; // m3/kg
    const expected = (cs * rhoB) / (theta + rhoB * kd);
    expect(rel(poreWaterConcentration(cs, rhoB, theta, kd), expected)).toBeLessThan(1e-12);
  });
  it('refuses nonsense', () => {
    expect(() => poreWaterConcentration(-1, 1500, 0.3, 0.01)).toThrow(RangeError);
    expect(() => poreWaterConcentration(1, 1500, 0, 0)).toThrow(RangeError);
  });
});

describe('Briggs root concentration factor (as printed in the HHRAP appendix)', () => {
  it('uses log RCF = 0.77 log Kow - 1.52 at log Kow >= 2', () => {
    for (const logKow of [2, 3, 4.6, 6]) {
      const expected = Math.pow(10, 0.77 * logKow - 1.52);
      expect(rel(briggsRootConcentrationFactor(logKow).value, expected)).toBeLessThan(1e-10);
    }
  });
  it('uses log (RCF - 0.82) = 0.77 log Kow - 1.52 below 2', () => {
    for (const logKow of [-0.5, 0, 1, 1.9]) {
      const expected = Math.pow(10, 0.77 * logKow - 1.52) + 0.82;
      expect(rel(briggsRootConcentrationFactor(logKow).value, expected)).toBeLessThan(1e-10);
    }
  });
  it('caps log Kow at -0.57 and 8.2 and says so', () => {
    const low = briggsRootConcentrationFactor(-3);
    expect(low.clamped).toBe(true);
    expect(low.value).toBe(briggsRootConcentrationFactor(-0.57).value);
    const high = briggsRootConcentrationFactor(10);
    expect(high.clamped).toBe(true);
    expect(high.value).toBe(briggsRootConcentrationFactor(8.2).value);
    expect(briggsRootConcentrationFactor(3).clamped).toBe(false);
  });
});

const leaf = {
  tscf: 0.5,
  transpiration_m3_per_d: 2e-4,
  conductance_m_per_d: 400,
  leafArea_m2: 0.05,
  mass_kg: 0.1,
  kLeafAir_m3_per_kg: 5e4,
  lossRate_per_d: 0.1,
};

describe('one-compartment leaf model', () => {
  const porewater = 1e-6; // kg/m3
  const ca = 2e-9; // kg/m3
  it('steady state is (TSCF Q Cpw + g A Ca) / (g A / Kla + lambda M)', () => {
    const s =
      leaf.tscf * leaf.transpiration_m3_per_d * porewater +
      leaf.conductance_m_per_d * leaf.leafArea_m2 * ca;
    const k =
      (leaf.conductance_m_per_d * leaf.leafArea_m2) / leaf.kLeafAir_m3_per_kg +
      leaf.lossRate_per_d * leaf.mass_kg;
    expect(rel(leafSteadyState(leaf, porewater, ca).concentration, s / k)).toBeLessThan(1e-12);
  });
  it('time-dependent solution is the exponential, starts at zero and tends to steady state', () => {
    const ss = leafSteadyState(leaf, porewater, ca);
    const tau = ss.timeConstant_d;
    const t = 0.7 * tau;
    const expected = ss.concentration * (1 - Math.exp(-t / tau));
    expect(rel(leafTimeDependent(leaf, porewater, ca, t).concentration, expected)).toBeLessThan(
      1e-12,
    );
    expect(leafTimeDependent(leaf, porewater, ca, 0).concentration).toBe(0);
    expect(
      rel(leafTimeDependent(leaf, porewater, ca, 60 * tau).concentration, ss.concentration),
    ).toBeLessThan(1e-12);
  });
  it('closes the mass balance against an independent RK4 integration (1e-9)', () => {
    const ss = leafSteadyState(leaf, porewater, ca);
    const gA = leaf.conductance_m_per_d * leaf.leafArea_m2;
    const src = leaf.tscf * leaf.transpiration_m3_per_d * porewater + gA * ca;
    const f = (c: number) =>
      (src - (gA / leaf.kLeafAir_m3_per_kg + leaf.lossRate_per_d * leaf.mass_kg) * c) /
      leaf.mass_kg;
    const T = 1.3 * ss.timeConstant_d;
    const n = 2000;
    const h = T / n;
    let c = 0;
    for (let i = 0; i < n; i++) {
      const k1 = f(c);
      const k2 = f(c + (h / 2) * k1);
      const k3 = f(c + (h / 2) * k2);
      const k4 = f(c + h * k3);
      c += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    }
    expect(rel(leafTimeDependent(leaf, porewater, ca, T).concentration, c)).toBeLessThan(1e-9);
  });
  it('rejects non-positive parameters', () => {
    expect(() => leafSteadyState({ ...leaf, mass_kg: 0 }, 1, 1)).toThrow(RangeError);
    expect(() => leafSteadyState({ ...leaf, kLeafAir_m3_per_kg: -1 }, 1, 1)).toThrow(RangeError);
    expect(() => leafSteadyState({ ...leaf, tscf: 1.5 }, 1, 1)).toThrow(RangeError);
  });
});

describe('legacy method run', () => {
  const base: LegacyPlantInput = {
    logKow: 3,
    soil: {
      concentration_kg_per_kg: 1e-6,
      bulkDensity_kg_per_m3: 1500,
      waterFilledPorosity: 0.3,
      kd_m3_per_kg: 0.002,
    },
    airConcentration_kg_per_m3: 0,
    produce: 'aboveground',
    leaf,
  };
  it('above-ground equals the steady state at the soil pore water', () => {
    const cpw = (1e-6 * 1500) / (0.3 + 1500 * 0.002);
    const r = legacyPlantUptake(base);
    expect(
      rel(r.concentration_kg_per_kg ?? NaN, leafSteadyState(leaf, cpw, 0).concentration),
    ).toBeLessThan(1e-12);
    expect(rel(r.poreWater_kg_per_m3, cpw)).toBeLessThan(1e-12);
  });
  it('root produce is RCF times pore water (RCF in L/kg)', () => {
    const cpw = (1e-6 * 1500) / (0.3 + 1500 * 0.002);
    const rcf = Math.pow(10, 0.77 * 3 - 1.52);
    const r = legacyPlantUptake({ ...base, produce: 'root' });
    expect(rel(r.concentration_kg_per_kg ?? NaN, rcf * 1e-3 * cpw)).toBeLessThan(1e-12);
  });
  it('warns when the growing period is short, and when log Kow leaves the Briggs range', () => {
    const r = legacyPlantUptake({ ...base, growthPeriod_d: 0.01, logKow: 7 });
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('PLANT_NOT_STEADY');
    expect(codes).toContain('PLANT_LOGKOW_OUT_OF_RANGE');
  });
  it('time-dependent run is below the steady state', () => {
    const ss = legacyPlantUptake(base).concentration_kg_per_kg as number;
    const td = legacyPlantUptake({ ...base, growthPeriod_d: 5 }).concentration_kg_per_kg as number;
    expect(td).toBeLessThan(ss);
  });
  it('flags ionizable chemicals and an inorganic without a BCF', () => {
    expect(legacyPlantUptake({ ...base, ionizable: true }).warnings.map((w) => w.code)).toContain(
      'PLANT_IONIZABLE',
    );
    const inorg = legacyPlantUptake({ ...base, inorganic: true });
    expect(inorg.warnings.map((w) => w.code)).toContain('PLANT_INORGANIC_NEEDS_BCF');
    expect(inorg.concentration_kg_per_kg).toBeNull();
    const withBcf = legacyPlantUptake({ ...base, inorganic: true, userBcf: 0.02 });
    expect(withBcf.concentration_kg_per_kg).toBeCloseTo(0.02 * 1e-6, 20);
  });
  it('uses an explicit root-zone water concentration when given', () => {
    const r = legacyPlantUptake({ ...base, produce: 'root', rootZoneWater_kg_per_m3: 3e-6 });
    expect(r.poreWater_kg_per_m3).toBe(3e-6);
  });
});

describe('HHRAP fallback (modern)', () => {
  it('Br follows log Br = 1.588 - 0.578 log Kow with caps at 1.15 and 9.35', () => {
    for (const k of [2, 4, 6, 9]) {
      expect(rel(hhrapPlantSoilBr(k).value, Math.pow(10, 1.588 - 0.578 * k))).toBeLessThan(1e-10);
    }
    expect(hhrapPlantSoilBr(0).clamped).toBe(true);
    expect(hhrapPlantSoilBr(0).value).toBe(hhrapPlantSoilBr(1.15).value);
    expect(hhrapPlantSoilBr(12).value).toBe(hhrapPlantSoilBr(9.35).value);
  });
  it('Bv follows the Bacci volumetric form with the factor-of-100 reduction', () => {
    const logKow = 4;
    const kaw = 0.01;
    const bvol = Math.pow(10, 1.065 * logKow - Math.log10(kaw) - 1.654);
    const bv = (1.19 * bvol) / ((1 - 0.85) * 770) / 100;
    expect(rel(hhrapAirToPlantBv(logKow, kaw), bv)).toBeLessThan(1e-10);
  });
  const chem = { logKow: 5, kaw: 0.02, kd_m3_per_kg: 0.05 };
  const cs = 1e-6;
  it('above-ground exposed adds root uptake and vapor transfer', () => {
    const ca = 1e-9;
    const vg = 0.01; // log Kow > 4
    const pr = cs * hhrapPlantSoilBr(5).value;
    const pv = (ca * hhrapAirToPlantBv(5, 0.02) * vg) / 1.19;
    const r = hhrapProduce({
      ...chem,
      soilConcentration_kg_per_kg: cs,
      vaporAirConcentration_kg_per_m3: ca,
      produce: 'aboveground-exposed',
    });
    expect(rel(r.rootUptake_kg_per_kg_dw ?? NaN, pr)).toBeLessThan(1e-10);
    expect(rel(r.vaporTransfer_kg_per_kg_dw ?? NaN, pv)).toBeLessThan(1e-10);
    expect(rel(r.total_kg_per_kg_dw ?? NaN, pr + pv)).toBeLessThan(1e-10);
  });
  it('protected produce has no vapor transfer; root produce uses RCF / Kd with VG 0.01 and 87 percent moisture', () => {
    const p = hhrapProduce({
      ...chem,
      soilConcentration_kg_per_kg: cs,
      vaporAirConcentration_kg_per_m3: 1e-9,
      produce: 'aboveground-protected',
    });
    expect(p.vaporTransfer_kg_per_kg_dw).toBe(0);
    const root = hhrapProduce({ ...chem, soilConcentration_kg_per_kg: cs, produce: 'root' });
    const rcfDw = Math.pow(10, 0.77 * 5 - 1.52) / (1 - 0.87);
    const expected = (cs * rcfDw * 0.01) / (0.05 * 1000);
    expect(rel(root.total_kg_per_kg_dw ?? NaN, expected)).toBeLessThan(1e-10);
  });
  it('uses VG 1.0 at log Kow below 4 for root and exposed produce', () => {
    const root = hhrapProduce({
      logKow: 2,
      kaw: 1e-3,
      kd_m3_per_kg: 0.01,
      soilConcentration_kg_per_kg: cs,
      produce: 'root',
    });
    const expected = (cs * (Math.pow(10, 0.77 * 2 - 1.52) / 0.13)) / (0.01 * 1000);
    expect(rel(root.total_kg_per_kg_dw ?? NaN, expected)).toBeLessThan(1e-10);
  });
  it('a user BCF replaces Br; an inorganic without one is not quantified', () => {
    const u = hhrapProduce({
      ...chem,
      soilConcentration_kg_per_kg: cs,
      produce: 'aboveground-protected',
      userBr: 0.3,
    });
    expect(rel(u.total_kg_per_kg_dw ?? NaN, 0.3 * cs)).toBeLessThan(1e-12);
    const n = hhrapProduce({
      ...chem,
      soilConcentration_kg_per_kg: cs,
      produce: 'aboveground-protected',
      inorganic: true,
    });
    expect(n.total_kg_per_kg_dw).toBeNull();
    expect(n.warnings.map((w) => w.code)).toContain('PLANT_INORGANIC_NEEDS_BCF');
  });
});

describe('registry', () => {
  const byKey = new Map(references.map((r) => [r.key, r]));
  it('registers a legacy and a modern plant uptake method citing used references', () => {
    const ms = registry.list('plantUptake');
    expect(ms.map((m) => m.id).sort()).toEqual([
      'plantUptake.hhrap-2005',
      'plantUptake.trapp-matthies-1995',
    ]);
    expect(registry.get('plantUptake.trapp-matthies-1995').kind).toBe('legacy');
    expect(registry.get('plantUptake.hhrap-2005').kind).toBe('modern');
    for (const m of ms) {
      expect(m.citations.length).toBeGreaterThan(0);
      for (const key of m.citations) expect(byKey.get(key)?.status, `${m.id} ${key}`).toBe('used');
      expect(m.assumptions.length).toBeGreaterThan(2);
    }
  });
});
