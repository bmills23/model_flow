import { describe, expect, it } from 'vitest';
import r7 from './fixtures/vadose/r7.json' with { type: 'json' };
import { convert } from '../src/numerics/units.js';
import { vadoseVadsat, type VadsatInput, type VadsatSoil } from '../src/processes/vadose/index.js';

// Table R-7 (arcadis2001) in SI. The table counts years as 365 days (fixture interpretation).
const i = r7.inputs;
const YEAR = i.interpretation.yearLengthDays * 86400;

function soil(l: (typeof i.layers)['source']): VadsatSoil {
  return {
    thetaS: l.porosity,
    thetaR: l.residualMoisture,
    n: l.vanGenuchtenN,
    Ks: convert(l.ksMPerDay, 'm/d', 'm/s'),
    rhoB: l.bulkDensityGcm3 * 1000,
    foc: l.foc,
  };
}

const MONTH = YEAR / 12;
const input: VadsatInput = {
  q: (i.infiltrationCmPerYear * 0.01) / YEAR,
  depthToSource: i.interpretation.thicknessAboveSourceIncludingLensM,
  above: soil(i.layers.vadoseAboveSource),
  lens: { ...soil(i.layers.lens), thickness: i.layers.lens.thicknessM },
  source: {
    ...soil(i.layers.source),
    thickness: i.layers.source.thicknessM,
    length: i.sourceLengthM,
    width: i.sourceWidthM,
    F: i.benzeneSoilMgPerKg * 1e-6,
    FT: i.tphSoilMgPerKg * 1e-6,
    MT: i.tphMolarMassGPerMol / 1000,
    decayRate: i.sourceDecayPerDay / 86400,
  },
  below: {
    ...soil(i.layers.belowSource),
    thickness: i.interpretation.transportDistanceBelowSourceM,
  },
  chemical: {
    M: i.benzene.molarMassGPerMol / 1000,
    S: convert(i.benzene.solubilityMgPerL, 'mg/L', 'kg/m3'),
    H: i.benzene.henryDimensionless,
    Koc: convert(i.benzene.kocMlPerG, 'mL/g', 'm3/kg'),
    Da: convert(i.benzene.airDiffusionCm2PerS, 'cm/s', 'm/s') * 0.01,
    Dw: convert(i.benzene.waterDiffusionCm2PerS, 'cm/s', 'm/s') * 0.01,
    mu: i.vadoseDecayPerDay / 86400,
  },
  duration: 10 * YEAR,
  seriesStep: MONTH,
};

describe('Table R-7 (arcadis2001) with the legacy method', () => {
  const out = vadoseVadsat.run(input);
  const mgL = (kgm3: number) => convert(kgm3, 'kg/m3', 'mg/L');

  it('uses the reading of the table recorded in the fixture', () => {
    expect(out.diffusionPath).toBeCloseTo(i.interpretation.leachingDistanceDownM, 12);
    expect(out.moisture.below.theta).toBeCloseTo(0.0885, 4);
    expect(Math.abs(out.moisture.lens!.theta - 0.2031)).toBeLessThan(1e-4);
    expect(out.evaluation).toBe('closed-form');
  });

  it(`reproduces the source pore water ${r7.targets.sourcePoreWaterMgPerL.value} mg/L within 1 percent`, () => {
    const t = r7.targets.sourcePoreWaterMgPerL;
    const cs0 = mgL(out.series.sourcePoreWater[0]!);
    expect(out.partition.residual).toBe(true);
    expect(Math.abs(cs0 - t.value) / t.value).toBeLessThanOrEqual(t.relativeTolerance);
  });

  it(`reproduces the year-10 month-end mean ${r7.targets.waterTableYear10MeanMgPerL.value} mg/L within 3 percent`, () => {
    const t = r7.targets.waterTableYear10MeanMgPerL;
    const wt = out.series.waterTable;
    expect(wt).toHaveLength(121);
    const months = wt.slice(109, 121).map(mgL); // month-ends 109 to 120
    const mean = months.reduce((a, b) => a + b, 0) / 12;
    expect(Math.abs(mean - t.value) / t.value).toBeLessThanOrEqual(t.relativeTolerance);
    // and agrees with the independent reconstruction to print precision
    expect(mean).toBeCloseTo(r7.reconstruction.yearTenMonthEndMeanMgPerL, 1);
    expect(mgL(wt[120]!)).toBeCloseTo(r7.reconstruction.pointValueAtTenYearsMgPerL, 1);
  });

  it('warns about the residual phase and that the reproduction rests on the dispersivity regression', () => {
    // r7.json gives no dispersivity: the agreement above is the RISC5 regression, chosen on purpose
    expect(input.alphaL).toBeUndefined();
    expect(out.warnings.map((w) => w.code)).toEqual([
      'vadose.residual-phase',
      'vadose.dispersivity-regression-unsourced',
    ]);
  });

  it('reports the first-type inlet excess at 10 yr and over the release', () => {
    expect(out.budget.inletExcessRatio).toBeCloseTo(1.06, 2);
    expect(out.budget.lifetimeInletExcessRatio).toBeCloseTo(1.019, 3);
  });
});
