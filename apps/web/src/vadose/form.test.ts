// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SOIL_TEXTURES, convert } from '@model-flow/engine';
import {
  DEFAULT_FORM as FRESH_FORM,
  R7_FORM,
  R7_PUBLISHED,
  addLayer,
  applyTexture,
  isR7Case,
  removeLayer,
  toScenario,
  type VadoseForm,
} from './form';

// The tests that are not about the dispersivity choice run on the Table R-7 case, which uses the
// RISC5 regression on purpose.
const DEFAULT_FORM = R7_FORM;

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
    const s = scenario({ dispersivityBasis: 'entered', alphaL: '0.25' });
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

describe('vadose form: soil texture presets', () => {
  const layer = DEFAULT_FORM.above[0]!;

  it('fills porosity, residual water, n, conductivity and bulk density from SOIL_TEXTURES', () => {
    for (const t of Object.values(SOIL_TEXTURES)) {
      const f = applyTexture(layer, t.code);
      expect(f.texture).toBe(t.code);
      expect(Number(f.thetaS)).toBeCloseTo(t.porosity, 5);
      expect(Number(f.thetaR)).toBeCloseTo(t.residualMoisture, 5);
      expect(Number(f.n)).toBeCloseTo(t.N, 5);
      expect(Number(f.Ks)).toBeCloseTo(t.saturatedConductivity * 86400, 4);
      expect(Number(f.rhoB)).toBeCloseTo(t.bulkDensity / 1000, 5);
      expect(f.thickness).toBe(layer.thickness);
      expect(f.foc).toBe(layer.foc);
    }
  });

  it('keeps every value when Custom is chosen and every filled value stays editable', () => {
    const sand = applyTexture(layer, 'S');
    expect(applyTexture(sand, 'custom')).toEqual({ ...sand, texture: 'custom' });
    const edited = { ...sand, thetaS: '0.4' };
    const r = toScenario({ ...DEFAULT_FORM, above: [edited, edited] });
    expect(r.ok).toBe(true);
  });

  it('gives a runnable scenario for every texture and leaves the validation case Custom', () => {
    for (const t of Object.values(SOIL_TEXTURES)) {
      const l = applyTexture(layer, t.code);
      const r = toScenario({ ...DEFAULT_FORM, above: [l], source: l, below: [l] });
      expect(r.ok, t.code).toBe(true);
    }
    expect(DEFAULT_FORM.source.texture).toBe('custom');
    expect(isR7Case(DEFAULT_FORM)).toBe(true);
  });
});

describe('vadose project: files written before texture presets', () => {
  it('loads layers without a texture as hand entered', async () => {
    const { fromProject } = await import('./project');
    const { texture: _t, ...bare } = DEFAULT_FORM.source;
    void _t;
    const state = fromProject({ form: { source: bare, above: [bare], below: [bare] } });
    expect(state.form.source.texture).toBe('custom');
    expect(state.form.above[0]!.texture).toBe('custom');
    expect(state.form.below[0]!.texture).toBe('custom');
  });
});

describe('vadose form: dispersivity is a required entry', () => {
  it('starts a new project on an entered value with no number', () => {
    expect(FRESH_FORM.dispersivityBasis).toBe('entered');
    expect(FRESH_FORM.alphaL).toBe('');
  });

  it('blocks a blank entered value with a clear message', () => {
    const r = toScenario(FRESH_FORM);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /Longitudinal dispersivity is required/.test(e))).toBe(true);
    expect(r.errors.join(' ')).toMatch(/RISC5 regression/);
  });

  it('takes an entered value for every depth and both methods', () => {
    const r = toScenario({ ...FRESH_FORM, alphaL: '0.4' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenario.alphaL).toBe(0.4);
    expect(r.scenario.legacy?.alphaL).toBe(0.4);
    expect(r.scenario.modern.alphaL).toBe(0.4);
  });

  it('still rejects a non-positive entry', () => {
    expect(toScenario({ ...FRESH_FORM, alphaL: '0' }).ok).toBe(false);
    expect(toScenario({ ...FRESH_FORM, alphaL: '-1' }).ok).toBe(false);
  });

  it('uses the regression only when it is chosen, and then ignores any typed value', () => {
    const r = toScenario({ ...FRESH_FORM, dispersivityBasis: 'regression', alphaL: '0.4' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenario.alphaL).toBeUndefined();
    expect(r.scenario.legacy?.alphaL).toBeUndefined();
    expect(r.scenario.modern.alphaL).toBeUndefined();
  });

  it('keeps the Table R-7 case on the regression and tells it apart from a new project', () => {
    expect(R7_FORM.dispersivityBasis).toBe('regression');
    expect(R7_FORM.alphaL).toBe('');
    expect(isR7Case(R7_FORM)).toBe(true);
    expect(isR7Case(FRESH_FORM)).toBe(false);
    expect({ ...R7_FORM, dispersivityBasis: undefined }).toEqual({
      ...FRESH_FORM,
      dispersivityBasis: undefined,
    });
  });
});

describe('vadose project: files written before the dispersivity choice', () => {
  it('opens a saved blank as the regression, chosen explicitly', async () => {
    const { fromProject } = await import('./project');
    const { dispersivityBasis: _b, ...old } = R7_FORM;
    void _b;
    expect(old.alphaL).toBe('');
    const state = fromProject({ form: old });
    expect(state.form.dispersivityBasis).toBe('regression');
    const r = toScenario(state.form);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scenario.alphaL).toBeUndefined();
  });

  it('opens a saved typed value as an entered value with the same number', async () => {
    const { fromProject } = await import('./project');
    const { dispersivityBasis: _b, ...old } = R7_FORM;
    void _b;
    const state = fromProject({ form: { ...old, alphaL: '0.35' } });
    expect(state.form.dispersivityBasis).toBe('entered');
    const r = toScenario(state.form);
    expect(r.ok && r.scenario.alphaL).toBe(0.35);
  });

  it('keeps a saved choice, and a file with no vadose form is a new project', async () => {
    const { fromProject, toProject } = await import('./project');
    const kept = fromProject(
      toProject({ form: { ...FRESH_FORM, dispersivityBasis: 'regression' } }),
    );
    expect(kept.form.dispersivityBasis).toBe('regression');
    expect(fromProject(undefined).form.dispersivityBasis).toBe('entered');
    const entered = fromProject(toProject({ form: { ...FRESH_FORM, alphaL: '' } }));
    expect(entered.form.dispersivityBasis).toBe('entered');
  });
});
