import { describe, expect, it } from 'vitest';
import { modernPathway } from '../src/processes/exposure/modern.js';
import { modernChemical, modernResident } from '../src/processes/exposure/receptorsModern.js';
import {
  mgPerKgToKgPerKg,
  mgPerLToKgPerM3,
  mgPerM3ToKgPerM3,
} from '../src/processes/exposure/units.js';

/** Half a unit in the last printed digit of a printed number. */
function expectPrinted(actual: number | null, printed: string): void {
  expect(actual).not.toBeNull();
  const mant = printed.split('e')[0]!;
  const decimals = mant.includes('.') ? mant.split('.')[1]!.length : 0;
  const exp = printed.includes('e') ? Number(printed.split('e')[1]) : 0;
  const tol = 0.5 * 10 ** -decimals;
  expect(Math.abs(actual! / 10 ** exp - Number(mant))).toBeLessThanOrEqual(tol * 1.0001);
}

// November 2024 RSL values, hand cases of docs/methods/exposure-and-risk.md (fixture plan, item 3).
const benzene = modernChemical({
  id: '71-43-2',
  mutagen: false,
  sfo: 0.055,
  iur: 7.8e-6,
  rfdo: 0.004,
  rfci: 0.03,
  giabs: 1,
  kp: 0.0149,
  tauEvent: 0.28793386679266,
  tStar: 0.69104128030237,
  b: 0.05065008038978,
  fa: 1,
  organic: true,
});
const bap = modernChemical({
  id: '50-32-8',
  mutagen: true,
  sfo: 1,
  rfdo: 3e-4,
  giabs: 1,
  absd: 0.13,
});
const resident = modernResident();

describe('hand case M1 (modern resident, benzene)', () => {
  const water = mgPerLToKgPerM3(0.01);
  const air = mgPerM3ToKgPerM3(0.001);

  it('indoor air: concentration-based cancer risk and child hazard quotient', () => {
    const c = modernPathway('indoorInhalation', resident, benzene, air);
    expectPrinted(c.risk, '2.7780822e-6');
    expectPrinted(c.hq, '0.031963470');
    expect(c.hqByGroup.map((g) => g.group)).toEqual(['child', 'adult']);
  });

  it('drinking water: age-adjusted factor 327.95 L/kg, risk and child hazard quotient', () => {
    const c = modernPathway('waterIngestion', resident, benzene, water);
    expectPrinted(c.risk, '7.0595890e-6');
    expectPrinted(c.hq, '0.12465753');
    expect(c.hqByGroup[0]!.hq).toBeGreaterThan(c.hqByGroup[1]!.hq);
  });

  it('bathing: 0.6708 h time-weighted event for cancer, 0.54 h child event for the hazard quotient', () => {
    const c = modernPathway('waterDermal', resident, benzene, water);
    expectPrinted(c.risk, '1.0171390e-6');
    expectPrinted(c.hq, '0.016518954');
  });
});

describe('hand case M2 (modern resident, benzo(a)pyrene 1 mg/kg soil)', () => {
  const soil = mgPerKgToKgPerKg(1);

  it('mutagenic ingestion risk (factor 166,833.33 mg/kg) and child hazard quotient', () => {
    const c = modernPathway('soilIngestion', resident, bap, soil);
    expectPrinted(c.risk, '6.5296804e-6');
    expectPrinted(c.hq, '0.042617960');
  });

  it('mutagenic dermal risk (factor 428,260 mg/kg) and child hazard quotient', () => {
    const c = modernPathway('soilDermal', resident, bap, soil);
    expectPrinted(c.risk, '2.1790137e-6');
    expectPrinted(c.hq, '0.013147215');
  });
});
