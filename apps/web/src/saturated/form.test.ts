import { describe, expect, it } from 'vitest';
import { SOIL_TEXTURES, convert, runTwoRegion } from '@model-flow/engine';
import { DEFAULT_FORM, applyTexture, isCaseA, toScenario, type SaturatedForm } from './form';

const YR = convert(1, 'yr', 's');
const DAY = 86400;

function scenario(over: Partial<SaturatedForm> = {}) {
  const r = toScenario({ ...DEFAULT_FORM, ...over });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scenario;
}
function errors(over: Partial<SaturatedForm>): string[] {
  const r = toScenario({ ...DEFAULT_FORM, ...over });
  if (r.ok) throw new Error('expected errors');
  return r.errors;
}

describe('saturated form: unit conversion at the boundary', () => {
  const s = scenario();
  const i = s.input;

  it('converts conductivity from m/d, infiltration from cm/yr and density from g/cm3', () => {
    expect(i.aquifer.conductivity).toBeCloseTo(5 / DAY, 15);
    expect(i.aquifer.gradient).toBe(0.01);
    expect(i.infiltration).toBeCloseTo(0.2 / YR, 20);
    expect(i.soil.rhoB).toBeCloseTo(1700, 9);
  });

  it('converts the chemical to kg/kg, kg/mol, kg/m3 and m3/kg', () => {
    expect(i.chemical.F).toBeCloseTo(50e-6, 15);
    expect(i.chemical.M).toBeCloseTo(0.078, 12);
    expect(i.chemical.S).toBeCloseTo(1.75, 12);
    expect(i.chemical.koc).toBeCloseTo(59e-3, 12);
    expect(i.chemical.FT).toBeCloseTo(5000e-6, 15);
    expect(i.chemical.MT).toBeCloseTo(0.1, 12);
  });

  it('keeps the geometry in metres and converts the horizon to seconds', () => {
    expect(i.source).toMatchObject({
      length: 10,
      width: 10,
      thickness: 2,
      minSaturatedThickness: 0.5,
      fluctuation: 1,
      fractionHigh: 0.25,
      schedule: 'annual-mean',
    });
    expect(i.tEnd).toBeCloseTo(10 * YR, 3);
  });

  it('omits the TPH fields when the mixture box is off and carries the schedule choice', () => {
    const t = scenario({ tphOn: false, schedule: 'seasonal' }).input;
    expect(t.chemical.FT).toBeUndefined();
    expect(t.chemical.MT).toBeUndefined();
    expect(t.source.schedule).toBe('seasonal');
  });

  it('converts the source decay rate from 1/d and leaves it off at zero', () => {
    expect(s.input.sourceDecayRate).toBeUndefined();
    expect(scenario({ srcDecay: '0.001' }).input.sourceDecayRate).toBeCloseTo(0.001 / DAY, 15);
  });

  it('uses the method default hydraulic model unless one is chosen', () => {
    expect(s.input.soil.hydraulicModel).toBeUndefined();
    expect(scenario({ hydraulicModel: 'vanGenuchten1980' }).input.soil.hydraulicModel).toBe(
      'vanGenuchten1980',
    );
  });
});

describe('saturated form: validation', () => {
  it('names a bad field with its unit', () => {
    expect(errors({ infiltration: '-1' }).join(' ')).toMatch(/infiltration/i);
    expect(errors({ porosity: '0' }).join(' ')).toMatch(/porosity/i);
    expect(errors({ fractionHigh: '1.5' }).join(' ')).toMatch(/fraction/i);
    expect(errors({ horizonYr: 'abc' }).join(' ')).toMatch(/horizon/i);
  });

  it('rejects a minimum saturated thickness above the source thickness', () => {
    expect(errors({ hMin: '3' }).join(' ')).toMatch(/minimum saturated thickness/i);
  });

  it('rejects the chemical exceeding the TPH', () => {
    expect(errors({ F: '9000' }).join(' ')).toMatch(/cannot exceed the TPH/i);
  });
});

describe('saturated form: hand case A detection', () => {
  it('is hand case A for the defaults and loses that status when the hydraulic model changes the numbers', () => {
    expect(isCaseA(DEFAULT_FORM)).toBe(true);
    const a = scenario();
    const b = scenario({ hydraulicModel: 'vanGenuchten1980' });
    const regionC = (s: typeof a) => JSON.stringify(runTwoRegion(s.input).regions);
    expect(regionC(b)).not.toBe(regionC(a));
    expect(isCaseA({ ...DEFAULT_FORM, hydraulicModel: 'vanGenuchten1980' })).toBe(false);
  });
});

describe('saturated form: soil texture presets', () => {
  it('fills porosity, bulk density, residual water and n from SOIL_TEXTURES', () => {
    for (const t of Object.values(SOIL_TEXTURES)) {
      const f = applyTexture(DEFAULT_FORM, t.code);
      expect(f.texture).toBe(t.code);
      expect(Number(f.porosity)).toBeCloseTo(t.porosity, 5);
      expect(Number(f.thetaR)).toBeCloseTo(t.residualMoisture, 5);
      expect(Number(f.n)).toBeCloseTo(t.N, 5);
      expect(Number(f.rhoB)).toBeCloseTo(t.bulkDensity / 1000, 5);
      expect(f.foc).toBe(DEFAULT_FORM.foc);
      expect(f.K).toBe(DEFAULT_FORM.K);
      expect(toScenario(f).ok, t.code).toBe(true);
    }
  });

  it('keeps the values on Custom and keeps case A recognised with the default texture', () => {
    const sand = applyTexture(DEFAULT_FORM, 'S');
    expect(applyTexture(sand, 'custom')).toEqual({ ...sand, texture: 'custom' });
    expect(DEFAULT_FORM.texture).toBe('custom');
    expect(isCaseA(DEFAULT_FORM)).toBe(true);
  });
});
