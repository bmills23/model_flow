import { describe, expect, it } from 'vitest';
import {
  PARTICULATE_DEFAULTS,
  irrigationSprinklerFc,
  particulatePef1996,
  showerLittle1992,
} from '@model-flow/engine';
import { buildHouseholdFeed } from './feed';
import { computeHousehold } from './compute';
import { DEFAULT_FORM, type HouseholdForm } from './form';
import type { WellFeed } from '../transport/wellFeed';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';

// Test inputs only; none of these is a sourced default.
const FORM: HouseholdForm = {
  ...DEFAULT_FORM,
  chemicalId: '71-43-2',
  chemicalName: 'Benzene',
  waterConcentration: '0.5',
  soilConcentration: '40',
  henry: '0.2',
  molecularWeight: '100',
  householdFactor: '0.5',
  showerDropletDiameter: '1',
  showerFallTime: '2',
  showerFlow: '8',
  showerMinutes: '10',
  stallVolume: '2',
  ventilation: '0.5',
  sprayDropletDiameter: '1.5',
  sprayFallTime: '3',
  sprinklerFlow: '20',
  windSpeed: '2',
  mixingHeight: '2',
  boxLength: '10',
  boxWidth: '4',
};

const YR = 365.25 * 86400;
const WELL: WellFeed = {
  method: 'modern',
  label: 'Receptor well, modern method',
  times: [0, 10 * YR, 20 * YR, 40 * YR],
  values: [0, 1e-6, 4e-6, 2e-6],
};
const SURFACE: SurfaceWaterFeed = {
  method: 'well-mixed',
  origin: 'surfaceWater.well-mixed',
  label: 'Well-mixed surface water',
  times: [10 * YR, 20 * YR, 40 * YR],
  values: [3e-6, 1e-6, 5e-7],
};
const NONE = { well: null, surface: null };

describe('buildHouseholdFeed', () => {
  it('turns entered water and soil into constant EPCs tagged with the producing method', () => {
    const r = buildHouseholdFeed(FORM, NONE);
    if (!r.ok) throw new Error(r.reasons.join('; '));
    const out = computeHousehold(FORM, NONE);
    if (!out.shower.little.ok || !out.irrigation.ok || !out.particulate.pef1996.ok) {
      throw new Error('fixture inputs should compute');
    }
    expect(r.feed.chemicalId).toBe('71-43-2');
    expect(r.feed.bathroomAir).toEqual({
      kind: 'constant',
      value: out.shower.little.concentration,
      origin: 'shower.little-1992',
    });
    expect(r.feed.outdoorSprinkler).toEqual({
      kind: 'constant',
      value: out.irrigation.sprayAir,
      origin: 'irrigation.sprinkler-fc',
    });
    expect(r.feed.outdoorParticulate).toEqual({
      kind: 'constant',
      value: out.particulate.pef1996.concentration,
      origin: 'particulate.ssg-pef-1996',
    });
    expect(r.feed.coefficients.bathroomAir).toBe(out.shower.little.coefficient);
    expect(r.feed.coefficients.sprayAir).toBe(out.irrigation.sprayCoefficient);
    expect(r.feed.coefficients.particulateAir).toBe(out.particulate.pef1996.coefficient);
  });

  it('sends the RSL whole-house term as indoor air (24 h/day), not shower air, and names the method', () => {
    const form = { ...FORM, showerMethod: 'rsl' as const, volatileOverride: 'volatile' as const };
    const r = buildHouseholdFeed(form, NONE);
    if (!r.ok) throw new Error(r.reasons.join('; '));
    const out = computeHousehold(form, NONE);
    if (!out.shower.rsl.ok) throw new Error('fixture inputs should compute');
    expect(r.feed.bathroomAir).toBeUndefined();
    expect(r.feed.indoorAir).toEqual({
      kind: 'constant',
      value: out.shower.rsl.concentration,
      origin: 'shower.rsl-household',
    });
    expect(r.feed.coefficients.bathroomAir).toBeUndefined();
    expect(r.feed.coefficients.householdAir).toBe(out.shower.rsl.coefficient);
    expect(r.feed.methods).toMatchObject({
      householdAir: 'shower.rsl-household',
      sprayAir: 'irrigation.sprinkler-fc',
      particulateAir: 'particulate.ssg-pef-1996',
    });
  });

  it('names the shower method behind the stall coefficient', () => {
    const r = buildHouseholdFeed(FORM, NONE);
    if (!r.ok) throw new Error(r.reasons.join('; '));
    expect(r.feed.methods.bathroomAir).toBe('shower.little-1992');
    expect(r.feed.indoorAir).toBeUndefined();
  });

  it('gives a series EPC for a well series, equal to the engine at each sample', () => {
    const form = { ...FORM, showerWaterSource: 'well' as const };
    const r = buildHouseholdFeed(form, { well: WELL, surface: null });
    if (!r.ok) throw new Error(r.reasons.join('; '));
    const epc = r.feed.bathroomAir!;
    expect(epc.kind).toBe('series');
    if (epc.kind !== 'series') return;
    expect(epc.origin).toBe('shower.little-1992');
    expect([...epc.series.times]).toEqual(WELL.times);
    const base = {
      henry: 0.2,
      molecularWeight: 100,
      dropletDiameter: 1e-3,
      fallTime: 2,
      waterFlow: 8 / 60000,
      showerTime: 600,
      stallVolume: 2,
      gasFlow: 0.5 / 60,
    };
    WELL.values.forEach((cw, i) => {
      const expected = showerLittle1992.run({ ...base, waterConcentration: cw }).concentration;
      expect(epc.series.values[i]!).toBeCloseTo(expected, 20);
      expect(Math.abs(epc.series.values[i]! - expected)).toBeLessThanOrEqual(
        1e-12 * Math.max(expected, 1e-30),
      );
    });
    // irrigation stays on the entered concentration, so its EPC is a constant
    expect(r.feed.outdoorSprinkler!.kind).toBe('constant');
  });

  it('gives a sprinkler series from the surface water result', () => {
    const form = { ...FORM, irrigationWaterSource: 'surface' as const };
    const r = buildHouseholdFeed(form, { well: null, surface: SURFACE });
    if (!r.ok) throw new Error(r.reasons.join('; '));
    const epc = r.feed.outdoorSprinkler!;
    if (epc.kind !== 'series') throw new Error('expected a series');
    expect(epc.origin).toBe('irrigation.sprinkler-fc');
    expect([...epc.series.times]).toEqual(SURFACE.times);
    const spray = {
      henry: 0.2,
      molecularWeight: 100,
      dropletDiameter: 1.5e-3,
      fallTime: 3,
      sprinklerFlow: 20 / 60000,
    };
    const box = { height: 2, windSpeed: 2, length: 10, width: 4 };
    SURFACE.values.forEach((cw, i) => {
      const expected = irrigationSprinklerFc.run({
        waterConcentration: cw,
        sprinkler: spray,
        box,
      }).concentration;
      expect(Math.abs(epc.series.values[i]! - expected)).toBeLessThanOrEqual(1e-12 * expected);
    });
  });

  it('keeps soil constant and uses the chosen particulate method', () => {
    const form = { ...FORM, particulateMethod: 'pef1996' as const };
    const r = buildHouseholdFeed(form, NONE);
    if (!r.ok) throw new Error(r.reasons.join('; '));
    const direct = particulatePef1996({
      soilConcentration: 40e-6,
      wind: {
        vegetativeCover: PARTICULATE_DEFAULTS.vegetativeCover,
        meanWind: PARTICULATE_DEFAULTS.meanWind,
        thresholdWind: PARTICULATE_DEFAULTS.thresholdWind,
        fx: PARTICULATE_DEFAULTS.fx,
      },
      volatile: false,
    });
    expect(r.feed.outdoorParticulate).toMatchObject({
      kind: 'constant',
      origin: 'particulate.ssg-pef-1996',
    });
    const v = (r.feed.outdoorParticulate as { value: number }).value;
    expect(Math.abs(v - direct.concentration)).toBeLessThanOrEqual(1e-12 * direct.concentration);
  });

  it('refuses without a chemical id, naming what is missing', () => {
    const r = buildHouseholdFeed({ ...FORM, chemicalId: '' }, NONE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(' ')).toMatch(/chemical id/i);
  });

  it('refuses when a chosen series source is not held', () => {
    const r = buildHouseholdFeed({ ...FORM, showerWaterSource: 'well' }, NONE);
    // irrigation and soil still compute, so the feed is offered without a shower term
    if (!r.ok) throw new Error(r.reasons.join('; '));
    expect(r.feed.bathroomAir).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/shower/i);
  });

  it('refuses when nothing computes', () => {
    const r = buildHouseholdFeed({ ...DEFAULT_FORM, chemicalId: '71-43-2' }, NONE);
    expect(r.ok).toBe(false);
  });
});

describe('computeHousehold with a held series', () => {
  it('evaluates the shower at the peak of the well series', () => {
    const form = { ...FORM, showerWaterSource: 'well' as const };
    const withWell = computeHousehold(form, { well: WELL, surface: null });
    const entered = computeHousehold({ ...FORM, waterConcentration: String(4e-6 * 1000) }, NONE);
    if (!withWell.shower.little.ok || !entered.shower.little.ok) throw new Error('should compute');
    expect(withWell.shower.little.concentration).toBeCloseTo(
      entered.shower.little.concentration,
      15,
    );
  });

  it('reports a missing held source instead of computing', () => {
    const out = computeHousehold({ ...FORM, irrigationWaterSource: 'surface' }, NONE);
    expect(out.irrigation.ok).toBe(false);
    if (!out.irrigation.ok) expect(out.irrigation.errors.join(' ')).toMatch(/surface water/i);
  });
});
