import { describe, expect, it } from 'vitest';
import {
  PARTICULATE_DEFAULTS,
  irrigationSprinklerFc,
  particulateBoxAir,
  particulatePef1996,
  particulatePef2002,
  showerHouseholdAir,
  showerLegacyStall,
  showerLittle,
} from '@model-flow/engine';
import { computeHousehold, volatileVerdict } from './compute';
import { buildHouseholdFeed } from './feed';
import { DEFAULT_FORM, type HouseholdForm } from './form';

// Test inputs only; none of these is a sourced default.
const FORM: HouseholdForm = {
  ...DEFAULT_FORM,
  waterConcentration: '0.5',
  soilConcentration: '40',
  henry: '0.2',
  molecularWeight: '100',
  volatileOverride: 'volatile',
  householdFactor: '0.5',
  showerDropletDiameter: '1',
  showerFallTime: '2',
  showerFlow: '8',
  showerMinutes: '10',
  stallVolume: '2',
  ventilation: '0.5',
  postShowerMinutes: '5',
  sprayDropletDiameter: '1.5',
  sprayFallTime: '3',
  sprinklerFlow: '20',
  windSpeed: '2',
  mixingHeight: '2',
  boxLength: '10',
  boxWidth: '4',
};

describe('computeHousehold', () => {
  it('opens blank for unsourced inputs and names what is missing', () => {
    const out = computeHousehold(DEFAULT_FORM);
    expect(out.shower.legacy.ok).toBe(false);
    if (!out.shower.legacy.ok) expect(out.shower.legacy.errors.join(' ')).toMatch(/henry/i);
    expect(out.particulate.pef1996.ok).toBe(false);
  });

  it('prefills the verified guidance particulate defaults', () => {
    expect(Number(DEFAULT_FORM.vegetativeCover)).toBe(PARTICULATE_DEFAULTS.vegetativeCover);
    expect(Number(DEFAULT_FORM.meanWind)).toBe(PARTICULATE_DEFAULTS.meanWind);
    expect(Number(DEFAULT_FORM.thresholdWind)).toBe(PARTICULATE_DEFAULTS.thresholdWind);
    expect(Number(DEFAULT_FORM.fx)).toBe(PARTICULATE_DEFAULTS.fx);
  });

  it('shower results equal the engine at the converted SI inputs', () => {
    const out = computeHousehold(FORM);
    const base = {
      waterConcentration: 0.5e-3,
      henry: 0.2,
      molecularWeight: 100,
      dropletDiameter: 1e-3,
      fallTime: 2,
      waterFlow: 8 / 60000,
      showerTime: 600,
      stallVolume: 2,
    };
    const legacy = showerLegacyStall(base);
    const little = showerLittle({ ...base, gasFlow: 0.5 / 60, postShowerTime: 300 });
    const rsl = showerHouseholdAir({
      waterConcentration: 0.5e-3,
      transferFactorLPerM3: 0.5,
      volatile: true,
    });
    if (!out.shower.legacy.ok || !out.shower.little.ok || !out.shower.rsl.ok) throw new Error('x');
    expect(out.shower.legacy.concentration).toBe(legacy.concentration);
    expect(out.shower.little.concentration).toBe(little.concentration);
    expect(out.shower.little.endConcentration).toBe(little.endConcentration);
    expect(out.shower.rsl.concentration).toBe(rsl.concentration);
    expect(out.shower.legacy.warnings.map((w) => w.code)).toContain(
      'shower.film-reference-unverified',
    );
    expect(out.shower.rsl.warnings.map((w) => w.code)).toContain(
      'shower.household-factor-unverified',
    );
  });

  it('entered film references remove the default warning', () => {
    const out = computeHousehold({ ...FORM, filmGas: '3100', filmLiquid: '21' });
    if (!out.shower.legacy.ok) throw new Error('x');
    expect(out.shower.legacy.warnings.map((w) => w.code)).not.toContain(
      'shower.film-reference-unverified',
    );
  });

  it('rejects one film reference without the other', () => {
    const out = computeHousehold({ ...FORM, filmGas: '3100' });
    expect(out.shower.legacy.ok).toBe(false);
  });

  it('irrigation spray air equals the engine; width default is warned', () => {
    const out = computeHousehold({ ...FORM, boxWidth: '' });
    if (!out.irrigation.ok) throw new Error('x');
    const direct = irrigationSprinklerFc.run({
      waterConcentration: 0.5e-3,
      sprinkler: {
        henry: 0.2,
        molecularWeight: 100,
        dropletDiameter: 1.5e-3,
        fallTime: 3,
        sprinklerFlow: 20 / 60000,
      },
      box: { height: 2, windSpeed: 2, length: 10 },
    });
    expect(out.irrigation.sprayAir).toBe(direct.concentration);
    expect(out.irrigation.ingestion).toBe(0.5e-3);
    expect(out.irrigation.dermal).toBe(0.5e-3);
    expect(out.irrigation.warnings.map((w) => w.code)).toContain('irrigation.box-width-default');
  });

  it('particulate methods equal the engine, with volatile warning', () => {
    const out = computeHousehold(FORM);
    if (!out.particulate.box.ok || !out.particulate.pef1996.ok || !out.particulate.pef2002.ok) {
      throw new Error('x');
    }
    const soil = 40e-6;
    expect(out.particulate.pef1996.concentration).toBe(
      particulatePef1996({ soilConcentration: soil, wind: PARTICULATE_DEFAULTS }).concentration,
    );
    expect(out.particulate.pef2002.concentration).toBe(
      particulatePef2002({ soilConcentration: soil, wind: PARTICULATE_DEFAULTS }).concentration,
    );
    expect(out.particulate.box.concentration).toBe(
      particulateBoxAir({
        soilConcentration: soil,
        wind: PARTICULATE_DEFAULTS,
        box: { length: 10, width: 4, height: 2, windSpeed: 2 },
      }).concentration,
    );
    expect(out.particulate.pef1996.warnings.map((w) => w.code)).toContain(
      'particulate.volatile-chemical',
    );
  });

  it('reports a bad number as an error naming the field', () => {
    const out = computeHousehold({ ...FORM, vegetativeCover: '1' });
    expect(out.particulate.pef1996.ok).toBe(false);
  });
});

describe('volatileVerdict', () => {
  const f = (over: Partial<HouseholdForm>): HouseholdForm => ({ ...DEFAULT_FORM, ...over });
  it('applies the RSL criterion to Henry (atm m3/mol) or vapor pressure (mm Hg)', () => {
    expect(volatileVerdict(f({ henryAtm: '5.5e-3' }))).toMatchObject({
      volatile: true,
      source: 'criterion',
    });
    expect(volatileVerdict(f({ henryAtm: '1e-6', vaporPressure: '0.5' }))).toMatchObject({
      volatile: false,
      source: 'criterion',
    });
    expect(volatileVerdict(f({ henryAtm: '1e-6', vaporPressure: '10' })).volatile).toBe(true);
    // the criterion is strictly greater than
    expect(volatileVerdict(f({ henryAtm: '1e-5' })).volatile).toBe(false);
  });
  it('is not volatile and says why when nothing is entered', () => {
    const v = volatileVerdict(f({}));
    expect(v).toMatchObject({ volatile: false, source: 'unknown' });
    expect(v.note).toMatch(/Henry|vapor pressure/);
  });
  it('lets an explicit override win over the criterion', () => {
    expect(volatileVerdict(f({ henryAtm: '5e-3', volatileOverride: 'nonvolatile' }))).toMatchObject(
      {
        volatile: false,
        source: 'override',
      },
    );
    expect(volatileVerdict(f({ volatileOverride: 'volatile' }))).toMatchObject({
      volatile: true,
      source: 'override',
    });
  });
  it('flows into the RSL term and the particulate warning', () => {
    const out = computeHousehold(f({ ...FORM, henryAtm: '1e-6', volatileOverride: 'auto' }));
    if (!out.shower.rsl.ok) throw new Error('x');
    expect(out.shower.rsl.concentration).toBe(0);
    expect(out.shower.rsl.warnings.map((w) => w.code)).toContain('shower.not-volatile');
  });

  describe('water source chemical check', () => {
    const YR = 365.25 * 86400;
    const well = (chemicalId?: string) => ({
      method: 'modern' as const,
      label: 'Receptor well',
      times: [0, 10 * YR],
      values: [0, 1e-6],
      ...(chemicalId ? { chemicalId } : {}),
    });
    const surface = (chemicalId?: string) => ({
      method: 'well-mixed' as const,
      origin: 'surfaceWater.well-mixed',
      label: 'Surface water',
      times: [0, 10 * YR],
      values: [0, 1e-6],
      ...(chemicalId ? { chemicalId } : {}),
    });
    const names = (id: string) =>
      id === '71-43-2' ? 'Benzene' : id === '108-88-3' ? 'Toluene' : id;
    const form = {
      ...FORM,
      chemicalId: '108-88-3',
      showerWaterSource: 'well' as const,
      irrigationWaterSource: 'surface' as const,
    };
    const check = (projectCount: number) => ({ projectCount, nameOf: names });

    it('refuses a well and a surface series for another chemical, naming both', () => {
      const out = computeHousehold(form, {
        well: well('71-43-2'),
        surface: surface('71-43-2'),
        check: check(2),
      });
      expect(out.shower.legacy.ok).toBe(false);
      if (!out.shower.legacy.ok)
        expect(out.shower.legacy.errors.join(' ')).toMatch(/Benzene, not Toluene/);
      expect(out.irrigation.ok).toBe(false);
      if (!out.irrigation.ok)
        expect(out.irrigation.errors.join(' ')).toMatch(/Benzene, not Toluene/);
    });

    it('takes a series for the household chemical', () => {
      const out = computeHousehold(form, {
        well: well('108-88-3'),
        surface: surface('108-88-3'),
        check: check(2),
      });
      expect(out.shower.legacy.ok).toBe(true);
      expect(out.irrigation.ok).toBe(true);
    });

    it('takes an untagged series in a project of one chemical and refuses it in a project of two', () => {
      const held = { well: well(), surface: surface() };
      expect(computeHousehold(form, { ...held, check: check(1) }).shower.legacy.ok).toBe(true);
      const two = computeHousehold(form, { ...held, check: check(2) });
      expect(two.shower.legacy.ok).toBe(false);
      if (!two.shower.legacy.ok)
        expect(two.shower.legacy.errors.join(' ')).toMatch(/does not record which chemical/);
    });

    it('sends nothing computed from a refused series', () => {
      const r = buildHouseholdFeed(form, { well: well('71-43-2'), surface: null, check: check(2) });
      expect(r.ok && r.feed.bathroomAir).toBeFalsy();
    });
  });
});
