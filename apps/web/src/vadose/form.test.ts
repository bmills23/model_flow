import { describe, expect, it } from 'vitest';
import { convert } from '@model-flow/engine';
import {
  DEFAULT_FORM,
  R7_PUBLISHED,
  addLayer,
  isR7Case,
  removeLayer,
  toScenario,
  type VadoseForm,
} from './form';

const YR = convert(1, 'yr', 's');
const DAY = 86400;

function scenario(over: Partial<VadoseForm> = {}) {
  const r = toScenario({ ...DEFAULT_FORM, ...over });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scenario;
}
function errors(over: Partial<VadoseForm>): string[] {
  const r = toScenario({ ...DEFAULT_FORM, ...over });
  if (r.ok) throw new Error('expected errors');
  return r.errors;
}

describe('vadose form: unit conversion at the boundary', () => {
  const s = scenario();

  it('converts infiltration from cm/yr to a Darcy flux in m/s', () => {
    expect(s.modern.q).toBeCloseTo(0.2 / YR, 20);
    expect(s.legacy?.q).toBeCloseTo(0.2 / YR, 20);
  });

  it('converts conductivity from m/d, bulk density from g/cm3 and thickness stays in m', () => {
    const src = s.modern.source;
    expect(src.Ks).toBeCloseTo(10 / DAY, 15);
    expect(src.rhoB).toBeCloseTo(1700, 9);
    expect(src.thickness).toBe(3);
    expect(s.modern.below[0]!.thickness).toBe(2.8);
    expect(s.modern.above.map((l) => l.thickness)).toEqual([3.8, 0.2]);
    expect(s.modern.above[1]!.Ks).toBeCloseTo(1 / DAY, 15);
  });

  it('converts concentrations from mg/kg and mg/L, molar mass from g/mol', () => {
    const src = s.modern.source;
    expect(src.F).toBeCloseTo(500e-6, 15);
    expect(src.FT).toBeCloseTo(5000e-6, 15);
    expect(src.MT).toBeCloseTo(0.1, 12);
    expect(s.modern.chemical.S).toBeCloseTo(1.75, 12);
    expect(s.modern.chemical.M).toBeCloseTo(0.078, 12);
  });

  it('converts Koc from mL/g, diffusion from cm2/s and decay from 1/d', () => {
    const c = s.modern.chemical;
    expect(c.Koc).toBeCloseTo(0.059, 12);
    expect(c.Da).toBeCloseTo(0.088e-4, 15);
    expect(c.Dw).toBeCloseTo(9.8e-6 * 1e-4, 18);
    expect(c.mu).toBeCloseTo(0.001 / DAY, 18);
    expect(s.modern.source.decayRate).toBe(0);
  });

  it('converts the run length from years', () => {
    expect(s.duration).toBeCloseTo(10 * YR, 3);
    expect(s.modern.duration).toBe(s.duration);
    expect(s.legacy?.duration).toBe(s.duration);
  });

  it('chooses profile times at 10, 25, 50 and 100 percent of the run', () => {
    expect(s.profileTimes.map((t) => t / s.duration)).toEqual([0.1, 0.25, 0.5, 1]);
    expect(s.modern.profileTimes).toEqual(s.profileTimes);
  });

  it('omits the TPH pair when it is switched off', () => {
    const t = scenario({ tphOn: false });
    expect(t.modern.source.FT).toBeUndefined();
    expect(t.modern.source.MT).toBeUndefined();
    expect(t.legacy?.source.FT).toBeUndefined();
  });
});

describe('vadose form: layers to the two methods', () => {
  it('maps the Table R-7 layers to the legacy soil, lens and below layer', () => {
    const s = scenario();
    const l = s.legacy!;
    expect(l.depthToSource).toBeCloseTo(4, 12);
    expect(l.lens?.thickness).toBe(0.2);
    expect(l.above.thetaR).toBe(0.05);
    expect(l.lens?.thetaR).toBe(0.15);
    expect(l.below.thickness).toBe(2.8);
    expect(s.legacyReason).toBeNull();
  });

  it('keeps the legacy method out when the profile needs more than it can describe', () => {
    const f = addLayer(DEFAULT_FORM, 'below');
    const s = scenario(f);
    expect(s.legacy).toBeNull();
    expect(s.legacyReason).toMatch(/one layer below/i);
    expect(s.modern.below).toHaveLength(2);
    const g = addLayer(DEFAULT_FORM, 'above');
    expect(scenario(g).legacy).toBeNull();
    expect(scenario(g).legacyReason).toMatch(/two layers above/i);
  });

  it('accepts no layers above the source for both methods', () => {
    let f = DEFAULT_FORM;
    f = removeLayer(f, 'above', 1);
    f = removeLayer(f, 'above', 0);
    const s = scenario(f);
    expect(s.modern.above).toHaveLength(0);
    expect(s.legacy?.depthToSource).toBe(0);
  });

  it('does not remove the last layer below the source', () => {
    expect(removeLayer(DEFAULT_FORM, 'below', 0).below).toHaveLength(1);
  });

  it('uses the method default moisture model unless one is chosen', () => {
    expect(scenario().modern.hydraulicModel).toBeUndefined();
    expect(scenario().legacy?.hydraulicModel).toBeUndefined();
    const s = scenario({ hydraulicModel: 'brooksCorey1964' });
    expect(s.modern.hydraulicModel).toBe('brooksCorey1964');
    expect(s.legacy?.hydraulicModel).toBe('brooksCorey1964');
  });

  it('passes a dispersivity override to both methods and leaves it unset when blank', () => {
    expect(scenario().modern.alphaL).toBeUndefined();
    const s = scenario({ alphaL: '0.25' });
    expect(s.modern.alphaL).toBe(0.25);
    expect(s.legacy?.alphaL).toBe(0.25);
  });
});

describe('vadose form: validation', () => {
  it('names the field and unit for a blank or non-numeric entry', () => {
    expect(errors({ infiltration: '' })[0]).toMatch(/infiltration.*cm\/yr/i);
    expect(errors({ Koc: 'abc' })[0]).toMatch(/koc/i);
  });

  it('rejects a residual water content that is not below the porosity', () => {
    const f = structuredClone(DEFAULT_FORM);
    f.source.thetaR = '0.4';
    expect(errors(f).join(' ')).toMatch(/source.*residual/i);
  });

  it('rejects n of 1 or less and a non-positive conductivity in a layer', () => {
    const f = structuredClone(DEFAULT_FORM);
    f.below[0]!.n = '1';
    f.above[0]!.Ks = '0';
    const e = errors(f).join(' ');
    expect(e).toMatch(/layer 1 below the source: van genuchten n/i);
    expect(e).toMatch(/layer 1 above the source: saturated conductivity/i);
  });

  it('rejects a chemical fraction above the TPH fraction', () => {
    expect(errors({ srcF: '6000' }).join(' ')).toMatch(/cannot exceed the TPH/i);
  });

  it('rejects a run length that is not positive', () => {
    expect(errors({ durationYr: '0' })[0]).toMatch(/run length/i);
  });
});

describe('vadose form: the Table R-7 case', () => {
  it('is the default form and is recognised until it is edited', () => {
    expect(isR7Case(DEFAULT_FORM)).toBe(true);
    expect(isR7Case({ ...DEFAULT_FORM, Koc: '60' })).toBe(false);
    expect(isR7Case({ ...DEFAULT_FORM, method: 'legacy', scale: 'log' })).toBe(true);
  });

  it('records the published targets', () => {
    expect(R7_PUBLISHED.sourceMgPerL).toBe(224);
    expect(R7_PUBLISHED.yearTenMgPerL).toBe(10.8);
    expect(R7_PUBLISHED.citations).toEqual(['arcadis2001', 'spence2001']);
  });
});
