// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { jeEpaIndoor, jeLegacyIndoor } from '@model-flow/engine';
import { DEFAULT_FORM, toInputs, type VaporForm } from './form';
import { runVapor } from './compute';
import { DEFAULT_OUTDOOR, runOutdoor } from './outdoor';
import { constantEpcs, INDOOR_ORIGIN, OUTDOOR_ORIGIN, vaporEpcs } from './series';
import { vaporCoefficients, type VaporCoefficient } from './coefficients';

const GW: Partial<VaporForm> = {
  source: 'groundwater',
  cgw: '1',
  capHeight: '0.2',
  capPorosity: '0.35',
  capMoisture: '0.345',
};

function setup(patch: Partial<VaporForm> = {}) {
  const form = { ...DEFAULT_FORM, ...patch };
  const p = toInputs(form);
  if (!p.ok) throw new Error(`form: ${p.errors.join('; ')}`);
  return { form, p };
}

function quantified(c: VaporCoefficient | undefined) {
  expect(c).toBeDefined();
  if (!c || !c.quantified) throw new Error(`not quantified: ${c && !c.quantified ? c.reason : ''}`);
  return c;
}

describe('vapor air-over-source coefficients', () => {
  it('groundwater source: the indoor coefficient reproduces the screen run and doubles with the source', () => {
    const { form, p } = setup(GW);
    for (const method of ['legacy', 'modern'] as const) {
      const c = vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, method);
      const ind = quantified(c.indoor);
      expect(ind.source).toBe('groundwater');
      expect(ind.methodId).toBe(method === 'legacy' ? 'vapor.je-1991' : 'vapor.je-epa');
      const run = (cgw: number) =>
        method === 'legacy'
          ? jeLegacyIndoor({ ...p.legacy, source: { ...p.legacy.source, cgw } as never })
              .concentration
          : jeEpaIndoor({ ...p.modern, source: { kind: 'groundwater', cgw } }).concentration;
      expect(ind.value * 1e-3).toBeCloseTo(run(1e-3), 18);
      expect(run(2e-3) / run(1e-3)).toBeCloseTo(2, 12);
      // the screen's own air at its entered source is the coefficient times that source
      const screen = runVapor(p)[method];
      if (!screen.ok) throw new Error('run');
      expect(ind.value * 1e-3).toBeCloseTo(screen.result.concentration, 18);
    }
  });

  it('soil gas source: coefficient is the attenuation coefficient', () => {
    const { form, p } = setup({ source: 'soilGas', soilGas: '100' });
    const c = vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'modern');
    const ind = quantified(c.indoor);
    expect(ind.source).toBe('soilGas');
    const r = runVapor(p).modern;
    if (!r.ok) throw new Error('run');
    expect(ind.value).toBeCloseTo(r.result.alpha, 15);
  });

  it('soil source: linear below the residual-phase limit, which is recorded as the largest source', () => {
    const { form, p } = setup({ source: 'soil', soilConc: '10' });
    for (const method of ['legacy', 'modern'] as const) {
      const ind = quantified(vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, method).indoor);
      expect(ind.source).toBe('soil');
      expect(ind.maxSource).toBeGreaterThan(0);
      const screen = runVapor(p)[method];
      if (!screen.ok) throw new Error('run');
      expect(ind.value * 10e-6).toBeCloseTo(screen.result.concentration, 15);
      // a source twice as large (still below the limit) gives twice the air
      const f2 = { ...form, soilConc: '20' };
      const p2 = toInputs(f2);
      if (!p2.ok) throw new Error('form');
      const s2 = runVapor(p2)[method];
      if (!s2.ok) throw new Error('run');
      expect(s2.result.concentration / screen.result.concentration).toBeCloseTo(2, 10);
      // above the limit the vapor no longer rises: the screen's air is below coefficient x source
      const over = toInputs({ ...form, soilConc: String(ind.maxSource! * 10 * 1e6) });
      if (!over.ok) throw new Error('form');
      const so = runVapor(over)[method];
      if (!so.ok) throw new Error('run');
      expect(so.result.concentration).toBeLessThan(ind.value * ind.maxSource! * 10 * 0.999);
    }
  });

  it('soil source with a TPH mixture is not quantified, with the reason', () => {
    const { form, p } = setup({ source: 'soil', tphOn: true, tph: '5000', tphMolarMass: '100' });
    const ind = vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'legacy').indoor;
    expect(ind?.quantified).toBe(false);
    if (ind && !ind.quantified) {
      expect(ind.reason).toMatch(/TPH/);
      // the forward model rides along, so the cleanup screen can solve the level
      expect(ind.nonlinear).toBe(true);
      expect(ind.solve?.sourceKind).toBe('soil');
      expect(ind.solve?.cap?.label).toMatch(/pure-substance/);
    }
    const out = vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'legacy').outdoor;
    expect(out && !out.quantified && out.solve?.forward.kind).toBe('box');
  });

  it('a soil coefficient carries the forward model with the residual-phase limit as its ceiling', () => {
    const { form, p } = setup({ source: 'soil', soilConc: '10' });
    for (const method of ['legacy', 'modern'] as const) {
      const ind = quantified(vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, method).indoor);
      expect(ind.solve?.cap).toEqual({ value: ind.maxSource, label: 'residual-phase limit' });
    }
  });

  it('a groundwater coefficient is linear and carries no forward model', () => {
    const { form, p } = setup(GW);
    expect(
      quantified(vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'legacy').indoor).solve,
    ).toBe(undefined);
  });

  it('outdoor legacy box: linear in the source vapor; modern SSG factor is 1 over the volatilization factor', () => {
    const { form, p } = setup({ source: 'soil', soilConc: '10' });
    const legacy = vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'legacy');
    const out = quantified(legacy.outdoor);
    expect(out.methodId).toBe('outdoorAir.box');
    const outcome = runVapor(p);
    const od = runOutdoor(form, p, outcome, DEFAULT_OUTDOOR);
    if (!od.legacy.ok) throw new Error('outdoor');
    expect(out.value * 10e-6).toBeCloseTo(od.legacy.concentration, 18);

    const modern = quantified(vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'modern').outdoor);
    expect(modern.methodId).toBe('outdoorAir.ssg-vf-1996');
    expect(modern.source).toBe('soil');
    if (!od.modern.ok) throw new Error('outdoor');
    expect(modern.value).toBeCloseTo(1 / od.modern.vf, 12);
    expect(modern.value * 10e-6).toBeCloseTo(od.modern.concentration, 18);
  });

  it('the SSG factor is not offered for a groundwater source', () => {
    const { form, p } = setup(GW);
    const out = vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'modern').outdoor;
    expect(out?.quantified).toBe(false);
    if (out && !out.quantified) expect(out.reason).toMatch(/soil source/i);
  });

  it('a source series: the coefficient is air over source at every time (linear and time invariant)', () => {
    const { form, p } = setup(GW);
    const YR = 365.25 * 86400;
    const src = {
      kind: 'groundwater' as const,
      label: 'plume',
      series: { times: [0, 5 * YR, 10 * YR], values: [2e-3, 7e-4, 1e-4] },
    };
    for (const method of ['legacy', 'modern'] as const) {
      const c = vaporCoefficients(form, p, src, DEFAULT_OUTDOOR, method);
      const ind = quantified(c.indoor);
      expect(ind.source).toBe('groundwater');
      const epcs = vaporEpcs(form, p, src, DEFAULT_OUTDOOR);
      const spec = epcs.indoor[method]!;
      expect(spec.kind).toBe('series');
      if (spec.kind !== 'series') return;
      spec.series.values.forEach((v: number, i: number) => {
        expect(v / src.series.values[i]!).toBeCloseTo(ind.value, 12);
      });
    }
    const out = quantified(vaporCoefficients(form, p, src, DEFAULT_OUTDOOR, 'legacy').outdoor);
    const epcs = vaporEpcs(form, p, src, DEFAULT_OUTDOOR);
    const spec = epcs.outdoor.legacy!;
    if (spec.kind !== 'series') throw new Error('series');
    spec.series.values.forEach((v: number, i: number) => {
      expect(v / src.series.values[i]!).toBeCloseTo(out.value, 12);
    });
  });

  it('a pore water series uses the Henry constant of each method', () => {
    const { form, p } = setup({ source: 'soil' });
    const src = { kind: 'poreWater' as const, label: 'vadose', constant: 1e-3 };
    for (const method of ['legacy', 'modern'] as const) {
      const ind = quantified(vaporCoefficients(form, p, src, DEFAULT_OUTDOOR, method).indoor);
      expect(ind.source).toBe('poreWater');
      const epc = vaporEpcs(form, p, src, DEFAULT_OUTDOOR).indoor[method]!;
      if (epc.kind !== 'constant') throw new Error('constant');
      expect(ind.value * 1e-3).toBeCloseTo(epc.value, 18);
    }
  });

  it('constant EPCs agree with the coefficient times the entered source', () => {
    const { form, p } = setup({ source: 'soilGas', soilGas: '50' });
    const outcome = runVapor(p);
    const epcs = constantEpcs(form, p, outcome, DEFAULT_OUTDOOR, 'legacy');
    const c = vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'legacy');
    const ind = quantified(c.indoor);
    const spec = epcs.indoor.legacy!;
    if (spec.kind !== 'constant') throw new Error('constant');
    expect(ind.value * 50e-6).toBeCloseTo(spec.value, 18);
  });
});

describe('the risk feed reaches only the Johnson and Ettinger and DeVaull indoor and box or SSG outdoor methods', () => {
  // DECISIONS K1 ruling 2: jury-bam and attenuation-factor-2015 are linear but no feed carries them,
  // so the cleanup screen never quantifies them. A new origin here must be added to that ruling too
  // (the DeVaull indoor method was, in wave V slice V1).
  it('maps each risk method to its origin ids and nothing else', () => {
    expect(INDOOR_ORIGIN).toEqual({
      legacy: 'vapor.je-1991',
      modern: 'vapor.je-epa',
      devaull: 'vapor.devaull-2007',
    });
    expect(OUTDOOR_ORIGIN).toEqual({ legacy: 'outdoorAir.box', modern: 'outdoorAir.ssg-vf-1996' });
  });
});
