import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import r7 from './fixtures/vadose/r7.json' with { type: 'json' };
import vga from './fixtures/vadose/vga1982-a1.json' with { type: 'json' };

const finite = z.number().finite();
const layer = z.object({
  thicknessM: finite.positive(),
  porosity: finite.positive().max(1),
  bulkDensityGcm3: finite.positive(),
  vanGenuchtenN: finite.gt(1),
  residualMoisture: finite.min(0),
  ksMPerDay: finite.positive(),
  foc: finite.min(0),
});
const r7Schema = z.object({
  id: z.string(),
  source: z.string(),
  units: z.string(),
  inputs: z.object({
    layers: z.object({
      vadoseAboveSource: layer,
      lens: layer,
      source: layer,
      belowSource: layer,
    }),
    infiltrationCmPerYear: finite.positive(),
    sourceLengthM: finite.positive(),
    sourceWidthM: finite.positive(),
    sourceDecayPerDay: finite.min(0),
    vadoseDecayPerDay: finite.min(0),
    benzeneSoilMgPerKg: finite.positive(),
    tphSoilMgPerKg: finite.positive(),
    tphMolarMassGPerMol: finite.positive(),
    benzene: z.object({
      molarMassGPerMol: finite.positive(),
      solubilityMgPerL: finite.positive(),
      henryDimensionless: finite.positive(),
      kocMlPerG: finite.positive(),
      airDiffusionCm2PerS: finite.positive(),
      waterDiffusionCm2PerS: finite.positive(),
    }),
    interpretation: z.object({
      thicknessAboveSourceIncludingLensM: finite,
      diffusionPathAboveSourceM: finite,
      leachingDistanceDownM: finite,
      transportDistanceBelowSourceM: finite,
      dissolvedPhaseDecayOnly: z.boolean(),
      yearLengthDays: finite,
    }),
  }),
  targets: z.object({
    sourcePoreWaterMgPerL: z.object({
      value: finite,
      relativeTolerance: finite,
      note: z.string(),
    }),
    waterTableYear10MeanMgPerL: z.object({
      value: finite,
      relativeTolerance: finite,
      basis: z.string(),
    }),
  }),
  reconstruction: z.object({
    yearTenMonthEndMeanMgPerL: finite,
    pointValueAtTenYearsMgPerL: finite,
    unusedIndependentValueMgPerL: finite,
  }),
});

const column = z.array(finite).length(11);
const vgaSchema = z.object({
  source: z.string(),
  inputs: z.object({
    v: finite,
    D: finite,
    R: finite,
    Ci: finite,
    C0: finite,
    T0: finite,
  }),
  distances: z.array(finite).length(11),
  times: z.array(finite).length(5),
  absTolerance: finite,
  firstType: z.record(z.string(), column),
  thirdType: z.record(z.string(), column),
});

describe('Table R-7 fixture', () => {
  const f = r7Schema.parse(r7);
  it('has the tabulated soil layers and targets', () => {
    const i = f.inputs;
    expect(i.layers.vadoseAboveSource.thicknessM + i.layers.lens.thicknessM).toBeCloseTo(
      i.interpretation.thicknessAboveSourceIncludingLensM,
      12,
    );
    expect(i.layers.source.thicknessM).toBe(3);
    expect(i.benzene.solubilityMgPerL).toBe(1750);
    expect(f.targets.sourcePoreWaterMgPerL.value).toBe(224);
    expect(f.targets.waterTableYear10MeanMgPerL.value).toBe(10.8);
    expect(f.targets.waterTableYear10MeanMgPerL.relativeTolerance).toBe(0.03);
  });
});

describe('van Genuchten and Alves 1982 Table 6 fixture', () => {
  const f = vgaSchema.parse(vga);
  it('has 5 times by 11 distances in both columns, all finite', () => {
    expect(f.times).toEqual([5, 10, 15, 20, 25]);
    expect(f.distances).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    for (const col of [f.firstType, f.thirdType]) {
      expect(Object.keys(col).sort((a, b) => +a - +b)).toEqual(f.times.map(String));
      for (const t of f.times) for (const c of col[String(t)]!) expect(c).toBeGreaterThan(0);
    }
    expect(f.absTolerance).toBe(5e-5);
  });
  it('first-type column is 1 at the inlet and decreases with distance', () => {
    for (const t of f.times) {
      const c = f.firstType[String(t)]!;
      expect(c[0]).toBe(1);
      for (let k = 1; k < c.length; k++) expect(c[k]!).toBeLessThan(c[k - 1]!);
    }
  });
  it.todo('third-type column from the C14 solution within 5e-5 (stage M)');
});
