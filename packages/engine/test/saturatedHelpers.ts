import hand from './fixtures/saturatedSource/hand-cases.json' with { type: 'json' };
import { convert } from '../src/numerics/units.js';
import type { SaturatedSourceInput } from '../src/processes/saturatedSource/index.js';

export const DAY = 86400;
export const YEAR = 365.25 * DAY;
export { hand };

export type HandCase = 'A' | 'B';

/** Hand-calculation input (fixtures/saturatedSource/hand-cases.json) converted to SI. */
export function handInput(which: HandCase, overrides: Partial<SaturatedSourceInput> = {}) {
  const c = hand.common;
  const k = hand.cases[which];
  const input: SaturatedSourceInput = {
    source: {
      length: c.sourceLengthM,
      width: c.sourceWidthM,
      thickness: c.sourceThicknessM,
      minSaturatedThickness: k.minSaturatedThicknessM,
      fluctuation: k.fluctuationM,
      fractionHigh: k.fractionHigh,
    },
    soil: {
      porosity: c.porosity,
      rhoB: c.bulkDensityGcm3 * 1000,
      foc: c.foc,
      thetaR: c.residualMoisture,
      n: c.vanGenuchtenN,
    },
    aquifer: {
      conductivity: convert(c.conductivityMPerDay, 'm/d', 'm/s'),
      gradient: c.gradient,
    },
    infiltration: convert(c.infiltrationCmPerYear, 'cm/yr', 'm/s'),
    chemical: {
      F: k.soilMgPerKg * 1e-6,
      M: c.chemical.molarMassGPerMol / 1000,
      S: convert(c.chemical.solubilityMgPerL, 'mg', 'kg') / 1e-3,
      H: c.chemical.henryDimensionless,
      koc: convert(c.chemical.kocMlPerG, 'mL', 'm3') / 1e-3,
      ...(k.tphMgPerKg === null
        ? {}
        : { FT: k.tphMgPerKg * 1e-6, MT: (k.tphMolarMassGPerMol as number) / 1000 }),
    },
    tEnd: 10 * YEAR,
  };
  return { ...input, ...overrides } as SaturatedSourceInput;
}

export const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
