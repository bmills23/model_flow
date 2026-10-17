import { describe, expect, it } from 'vitest';
import { legacyPathway } from '../src/processes/exposure/legacy.js';
import { legacyReceptor } from '../src/processes/exposure/receptorsLegacy.js';
import {
  doseToMgPerKgDay,
  iurFromPerUgM3,
  mgPerLToKgPerM3,
  mgPerM3ToKgPerM3,
  rfcFromMgPerM3,
  rfdFromMgPerKgDay,
  sfFromPerMgKgDay,
  sfToPerMgKgDay,
} from '../src/processes/exposure/units.js';

// Hand case L1 of docs/methods/exposure-and-risk.md: legacy adult resident, benzene,
// November 2024 RSL toxicity values.
const receptor = legacyReceptor({
  bwKg: 70,
  edYr: 30,
  efDaysPerYr: 350,
  waterIngestionLPerDay: 2,
  inhalationM3PerHour: 20 / 24,
  etHoursPerDay: { indoorInhalation: 24 },
});
const benzene = {
  sfo: sfFromPerMgKgDay(0.055),
  rfdo: rfdFromMgPerKgDay(0.004),
  iur: iurFromPerUgM3(7.8e-6),
  rfc: rfcFromMgPerM3(0.03),
};

describe('hand case L1 (legacy, benzene)', () => {
  const water = mgPerLToKgPerM3(0.01);
  const air = mgPerM3ToKgPerM3(0.001);
  const w = legacyPathway('waterIngestion', { cancer: water, noncancer: water }, receptor, benzene);
  const a = legacyPathway('indoorInhalation', { cancer: air, noncancer: air }, receptor, benzene);

  it('drinking water doses, risk and hazard quotient', () => {
    expect(doseToMgPerKgDay(w.cadd!)).toBeCloseTo(2.739726e-4, 10);
    expect(doseToMgPerKgDay(w.cadd!) / 2.739726027e-4).toBeCloseTo(1, 9);
    expect(doseToMgPerKgDay(w.ladd!) / 1.1741683e-4).toBeCloseTo(1, 7);
    expect(w.risk! / 6.4579256e-6).toBeCloseTo(1, 7);
    expect(w.hq! / 0.068493151).toBeCloseTo(1, 8);
  });

  it('inhalation dose equals the water dose, with SFi and RfDi from the IUR and RfC', () => {
    expect(a.cadd! / w.cadd!).toBeCloseTo(1, 12);
    expect(a.ladd! / w.ladd!).toBeCloseTo(1, 12);
    expect(a.risk! / 3.2054795e-6).toBeCloseTo(1, 7);
    expect(a.hq! / 0.03196347).toBeCloseTo(1, 7);
    expect(sfToPerMgKgDay(a.risk! / a.ladd!)).toBeCloseTo(0.0273, 10);
    expect(doseToMgPerKgDay(a.cadd!) / a.hq! / 0.0085714286).toBeCloseTo(1, 7);
  });
});
