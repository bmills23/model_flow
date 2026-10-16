import { describe, expect, it } from 'vitest';
import { convert } from '@model-flow/engine';
import { DEFAULT_FORM, toScenario, type SaturatedForm } from './form';

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
