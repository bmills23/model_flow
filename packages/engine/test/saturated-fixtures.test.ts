import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import ssg from './fixtures/saturatedSource/ssg1996-csat.json' with { type: 'json' };
import bio from './fixtures/saturatedSource/bioscreen-mass.json' with { type: 'json' };
import { hand } from './saturatedHelpers.js';
import {
  soilSaturationConcentration,
  sourceInitialMass,
} from '../src/processes/saturatedSource/index.js';

const finite = z.number().finite();
const provenance = z.object({
  id: z.string().min(1),
  source: z.string().min(10),
  page: z.string().min(1),
  tolerance: z.object({}).passthrough(),
});

describe('saturated source fixtures carry provenance', () => {
  it('parses the three fixture files', () => {
    for (const f of [ssg, bio, hand]) expect(() => provenance.parse(f)).not.toThrow();
    const chemicals = z
      .array(
        z.object({
          name: z.string(),
          solubilityMgPerL: finite.positive(),
          henryDimensionless: finite.positive(),
          kocLPerKg: finite.positive(),
          printedCsatMgPerKg: finite.positive(),
          toleranceMgPerKg: finite.positive(),
        }),
      )
      .length(6)
      .parse(ssg.chemicals);
    expect(chemicals.map((c) => c.name)).toContain('toluene');
    expect(bio.zones).toHaveLength(3);
    expect(Object.keys(hand.cases)).toEqual(['A', 'B']);
  });
});

describe('soil saturation limit against SSG 1996 Table 3-A', () => {
  const s = ssg.soil;
  for (const c of ssg.chemicals) {
    it(`${c.name}: printed ${c.printedCsatMgPerKg} mg/kg within ${c.toleranceMgPerKg}`, () => {
      const csat = soilSaturationConcentration({
        S: c.solubilityMgPerL * 1e-3,
        x: 1,
        rhoB: s.bulkDensityKgPerL * 1000,
        kd: c.kocLPerKg * 1e-3 * s.foc,
        theta: s.waterFilledPorosity,
        thetaA: s.airFilledPorosity,
        H: c.henryDimensionless,
      });
      const mgPerKg = csat * 1e6;
      expect(Math.abs(mgPerKg - c.printedCsatMgPerKg)).toBeLessThanOrEqual(c.toleranceMgPerKg);
      expect(Math.abs(mgPerKg - c.engineValueMgPerKg) / c.engineValueMgPerKg).toBeLessThan(1e-3);
    });
  }
  it('scales with the mole fraction and rejects bad input', () => {
    const base = { S: 1, rhoB: 1500, kd: 1e-3, theta: 0.15, thetaA: 0.28, H: 0.2 };
    const full = soilSaturationConcentration({ ...base, x: 1 });
    expect(soilSaturationConcentration({ ...base, x: 0.25 })).toBeCloseTo(full / 4, 15);
    expect(() => soilSaturationConcentration({ ...base, x: 0 })).toThrow(RangeError);
    expect(() => soilSaturationConcentration({ ...base, x: 1.1 })).toThrow(RangeError);
  });
});

describe('initial mass against the BIOSCREEN soluble-mass example', () => {
  const FT = 0.3048;
  const masses = bio.zones.map((z) =>
    sourceInitialMass({
      F: z.soilMgPerKg * 1e-6,
      rhoB: bio.bulkDensityKgPerL * 1000,
      thickness: bio.depthFt * FT,
      length: FT * 10,
      width: (z.areaFt2 * FT * FT) / (FT * 10),
    }),
  );
  bio.zones.forEach((z, i) => {
    it(`zone ${i + 1}: ${z.printedKg} kg within ${bio.tolerance.absoluteKg} kg`, () => {
      expect(Math.abs(masses[i]! - z.printedKg)).toBeLessThanOrEqual(bio.tolerance.absoluteKg);
    });
  });
});
