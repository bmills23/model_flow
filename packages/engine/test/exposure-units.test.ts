import { describe, expect, it } from 'vitest';
import {
  DAY_S,
  YEAR_S,
  cm2ToM2,
  cmPerHourToMPerS,
  doseFromMgPerKgDay,
  doseToMgPerKgDay,
  hoursPerDayToFraction,
  iurFromPerUgM3,
  lPerDayToM3PerS,
  mgPerCm2ToKgPerM2,
  mgPerDayToKgPerS,
  mgPerKgToKgPerKg,
  mgPerLToKgPerM3,
  mgPerM3ToKgPerM3,
  mlPerHourToM3PerS,
  rfcFromMgPerM3,
  rfdFromMgPerKgDay,
  rfdiFromRfc,
  sfFromPerMgKgDay,
  sfToPerMgKgDay,
  sfiFromIur,
  yearsToSeconds,
  daysPerYearToFraction,
  STANDARD_ADULT_BW,
  STANDARD_ADULT_INHALATION,
} from '../src/processes/exposure/units.js';

describe('exposure unit conversions', () => {
  it('uses a 365 day year for exposure durations', () => {
    expect(YEAR_S).toBe(365 * 86400);
    expect(yearsToSeconds(30)).toBe(30 * 365 * DAY_S);
    expect(daysPerYearToFraction(350)).toBeCloseTo(350 / 365, 15);
  });

  it('converts concentrations to kg/kg and kg/m3', () => {
    expect(mgPerKgToKgPerKg(5)).toBeCloseTo(5e-6, 18);
    expect(mgPerLToKgPerM3(2)).toBeCloseTo(2e-3, 15);
    expect(mgPerM3ToKgPerM3(1)).toBeCloseTo(1e-6, 18);
  });

  it('converts contact rates and areas', () => {
    expect(lPerDayToM3PerS(2)).toBeCloseTo(2e-3 / 86400, 20);
    expect(mgPerDayToKgPerS(100)).toBeCloseTo(1e-4 / 86400, 20);
    expect(mlPerHourToM3PerS(50)).toBeCloseTo(50e-6 / 3600, 20);
    expect(cm2ToM2(23000)).toBeCloseTo(2.3, 12);
    expect(mgPerCm2ToKgPerM2(1)).toBeCloseTo(1e-2, 15);
    expect(cmPerHourToMPerS(3600)).toBeCloseTo(0.01, 15);
    expect(hoursPerDayToFraction(6)).toBeCloseTo(0.25, 15);
  });

  it('round-trips doses and slope factors', () => {
    expect(doseToMgPerKgDay(doseFromMgPerKgDay(0.013))).toBeCloseTo(0.013, 15);
    expect(sfToPerMgKgDay(sfFromPerMgKgDay(1.5))).toBeCloseTo(1.5, 12);
    // risk is invariant: SF x dose in either unit system
    const risk = sfFromPerMgKgDay(0.055) * doseFromMgPerKgDay(2e-4);
    expect(risk).toBeCloseTo(0.055 * 2e-4, 18);
    expect(rfdFromMgPerKgDay(0.004)).toBeCloseTo(0.004 * doseFromMgPerKgDay(1), 25);
    expect(rfcFromMgPerM3(0.03)).toBeCloseTo(0.03e-6, 18);
    expect(iurFromPerUgM3(7.8e-6)).toBeCloseTo(7.8e-6 * 1e9, 6);
  });

  it('converts IUR and RfC to SFi and RfDi at 20 m3/d and 70 kg', () => {
    expect(STANDARD_ADULT_BW).toBe(70);
    expect(STANDARD_ADULT_INHALATION).toBeCloseTo(20 / 86400, 15);
    const sfi = sfiFromIur(iurFromPerUgM3(7.8e-6), STANDARD_ADULT_INHALATION, STANDARD_ADULT_BW);
    expect(sfToPerMgKgDay(sfi)).toBeCloseTo(0.0273, 12);
    const rfdi = rfdiFromRfc(rfcFromMgPerM3(0.03), STANDARD_ADULT_INHALATION, STANDARD_ADULT_BW);
    expect(rfdi / doseFromMgPerKgDay(1)).toBeCloseTo((0.03 * 20) / 70, 12);
  });
});
