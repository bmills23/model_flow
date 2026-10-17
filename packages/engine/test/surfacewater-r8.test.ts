import { describe, expect, it } from 'vitest';
import r8 from './fixtures/surfaceWater/r8.json' with { type: 'json' };
import manual from './fixtures/surfaceWater/manual-l4.json' with { type: 'json' };
import { darcyDischarge, legacyBox, riverVolume } from '../src/processes/surfaceWater/legacy.js';
import { sedimentConcentration } from '../src/processes/surfaceWater/sediment.js';
import {
  DAY_S,
  kgPerKgToMgPerKg,
  kgPerM3ToMgPerL,
  kgPerSToMgPerDay,
  lPerKgToM3PerKg,
  mgPerLToKgPerM3,
} from '../src/processes/surfaceWater/units.js';

const d = (x: number): number => x / DAY_S;

describe('fixture 1: Table R-8', () => {
  const c = r8.common;
  const qgw = darcyDischarge({
    bedConductivity: d(c.bedConductivityMPerDay),
    thickness: c.thicknessM,
    reachLength: c.reachLengthM,
    gradient: c.gradient,
  });
  const cgw = mgPerLToKgPerM3(c.groundwaterMgPerL);

  it('groundwater flow and mass flux', () => {
    expect(qgw * DAY_S).toBeCloseTo(r8.expected.groundwaterFlowM3PerDay, 9);
    expect(kgPerSToMgPerDay(qgw * cgw)).toBeCloseTo(r8.expected.massFluxMgPerDay, 3);
  });

  it.each(r8.cases)('$name surface water concentration', (k) => {
    const volume =
      'crossSectionM2' in k
        ? riverVolume(k.crossSectionM2, c.reachLengthM)
        : (k.volumeM3 as number);
    const r = legacyBox({
      upstreamFlow: d(c.upstreamFlowM3PerDay),
      background: mgPerLToKgPerM3(c.backgroundMgPerL),
      mixingFraction: k.mixingFraction,
      groundwaterFlow: qgw,
      groundwaterConcentration: cgw,
      decay: d(k.decayPerDay),
      bodyVolume: volume,
    });
    const mgL = kgPerM3ToMgPerL(r.concentration);
    expect(Math.abs(mgL - k.printedMgPerL)).toBeLessThanOrEqual(r8.tolerance.concentrationMgPerL);
    expect(mgL).toBeCloseTo(k.engineMgPerL, 5);
  });

  it('sediment', () => {
    const s = sedimentConcentration({
      poreWaterConcentration: cgw,
      fractionOrganicCarbon: c.fractionOrganicCarbon,
      koc: lPerKgToM3PerKg(c.kocMlPerG),
    });
    const mgKg = kgPerKgToMgPerKg(s.concentration as number);
    expect(Math.abs(mgKg - r8.expected.sedimentMgPerKg)).toBeLessThanOrEqual(
      r8.tolerance.sedimentMgPerKg,
    );
    expect(mgKg).toBeCloseTo(2.95, 9);
  });
});

describe('fixture 2: Appendix L examples', () => {
  it.each(manual.cases)('$name', (k) => {
    const volume =
      'crossSectionM2' in k
        ? riverVolume(k.crossSectionM2, k.reachLengthM as number)
        : (k.volumeM3 as number);
    const r = legacyBox({
      upstreamFlow: d(k.upstreamFlowM3PerDay),
      background: 0,
      mixingFraction: k.mixingFraction,
      groundwaterFlow: d(k.groundwaterFlowM3PerDay),
      groundwaterConcentration: mgPerLToKgPerM3(k.groundwaterMgPerL),
      decay: d(k.decayPerDay),
      bodyVolume: volume,
    });
    const mgL = kgPerM3ToMgPerL(r.concentration);
    expect(Math.abs(mgL - k.printedMgPerL)).toBeLessThanOrEqual(
      manual.tolerance.concentrationMgPerL,
    );
    expect(mgL).toBeCloseTo(k.engineMgPerL, 3);
  });
});
