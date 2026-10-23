// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { devaullRun } from '@model-flow/engine';
import { DEFAULT_FORM, toInputs, type VaporForm } from './form';
import { runVapor } from './compute';
import { DEFAULT_OUTDOOR } from './outdoor';
import { constantEpcs, vaporEpcs, type SourceSeries } from './series';
import { vaporCoefficients, type VaporCoefficient } from './coefficients';
import { profileCurves } from './chartData';
import { vaporCsvTables } from './csv';

const YR = 365.25 * 86400;
const OXY = { dvDa: '0.18', dvDw: '2.1e-5', dvH: '32' } as const;

function setup(patch: Partial<VaporForm> = {}) {
  const form: VaporForm = { ...DEFAULT_FORM, method: 'devaull', ...patch };
  const p = toInputs(form);
  if (!p.ok) throw new Error(`form: ${p.errors.join('; ')}`);
  return { form, p };
}

function quantified(c: VaporCoefficient | undefined) {
  if (!c || !c.quantified) throw new Error(`not quantified: ${c && !c.quantified ? c.reason : ''}`);
  return c;
}

describe('coefficients of the oxygen-limited method', () => {
  it('entered aerobic depth: linear, the coefficient reproduces the screen run (groundwater)', () => {
    const { form, p } = setup({ source: 'groundwater', cgw: '1', dvAerobicDepth: '1.5' });
    const ind = quantified(vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'devaull').indoor);
    expect(ind.methodId).toBe('vapor.devaull-2007');
    expect(ind.source).toBe('groundwater');
    const run = runVapor(p).devaull;
    if (!run?.ok) throw new Error('run');
    expect(ind.value * 1e-3).toBeCloseTo(run.result.concentration, 18);
  });

  it('soil source: linear below the residual-phase limit, with that limit as the largest source', () => {
    const { form, p } = setup({ source: 'soil', soilConc: '10' });
    const ind = quantified(vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'devaull').indoor);
    expect(ind.source).toBe('soil');
    expect(ind.maxSource).toBeGreaterThan(0);
    const run = runVapor(p).devaull;
    if (!run?.ok) throw new Error('run');
    expect(ind.value * 10e-6).toBeCloseTo(run.result.concentration, 15);
  });

  it('a TPH mixture soil source is not linear and says so', () => {
    const { form, p } = setup({ source: 'soil', tphOn: true });
    const c = vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'devaull').indoor;
    expect(c && !c.quantified && c.reason).toMatch(/TPH/);
    expect(c?.methodId).toBe('vapor.devaull-2007');
  });

  for (const mode of ['fastReaction', 'coupled'] as const) {
    it(`${mode} with the total hydrocarbon vapor entered: the depth does not move with the source, so linear`, () => {
      const { form, p } = setup({
        source: 'soilGas',
        soilGas: '20000',
        dvOxMode: mode,
        dvTotalHc: '50000',
        ...OXY,
      });
      const ind = quantified(vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'devaull').indoor);
      const run = runVapor(p).devaull;
      if (!run?.ok) throw new Error('run');
      expect(run.result.aerobicDepth).toBeGreaterThan(0);
      expect(ind.value * 20000e-6).toBeCloseTo(run.result.concentration, 15);
    });

    it(`${mode} with the demand taken from the source: not linear, names the option`, () => {
      const { form, p } = setup({ source: 'soilGas', soilGas: '20000', dvOxMode: mode, ...OXY });
      const c = vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'devaull').indoor;
      expect(c?.quantified).toBe(false);
      if (!c || c.quantified) return;
      expect(c.methodId).toBe('vapor.devaull-2007');
      expect(c.reason).toMatch(mode === 'fastReaction' ? /fast.reaction/i : /coupled/i);
      expect(c.reason).toMatch(/not proportional/i);
    });
  }

  it('a method that did not run is not quantified, with the reason', () => {
    const { form, p } = setup({ dvOxMode: 'coupled' });
    const c = vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'devaull').indoor;
    expect(c && !c.quantified && c.reason).toMatch(/oxygen diffusion in air/i);
  });

  it('has no outdoor coefficient (the method is indoor only)', () => {
    const { form, p } = setup();
    expect(vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'devaull').outdoor).toBeUndefined();
  });

  it('a source series gives the same coefficient as the constant source', () => {
    const { form, p } = setup({ source: 'groundwater', cgw: '1' });
    const src: SourceSeries = {
      kind: 'groundwater',
      label: 'x',
      series: { times: [0, 5 * YR], values: [2e-3, 1e-3] },
    };
    const a = quantified(vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'devaull').indoor);
    const b = quantified(vaporCoefficients(form, p, src, DEFAULT_OUTDOOR, 'devaull').indoor);
    expect(b.value).toBeCloseTo(a.value, 15);
  });
});

describe('exposure point concentrations of the oxygen-limited method', () => {
  it('a constant source is a constant EPC tagged with the method id, and no outdoor air', () => {
    const { form, p } = setup();
    const out = runVapor(p);
    const r = constantEpcs(form, p, out, DEFAULT_OUTDOOR, 'devaull');
    const run = out.devaull;
    if (!run?.ok) throw new Error('run');
    expect(r.indoor.devaull).toEqual({
      kind: 'constant',
      value: run.result.concentration,
      origin: 'vapor.devaull-2007',
    });
    expect(r.outdoor).toEqual({});
  });

  it('a source series gives a series EPC whose values are the engine runs at each time', () => {
    const { form, p } = setup({ source: 'groundwater', cgw: '1' });
    const src: SourceSeries = {
      kind: 'groundwater',
      label: 'Water table',
      series: { times: [0, 5 * YR, 10 * YR], values: [2e-3, 1e-3, 1e-4] },
    };
    const r = vaporEpcs(form, p, src, DEFAULT_OUTDOOR);
    const e = r.indoor.devaull;
    if (!e || e.kind !== 'series' || !p.devaull?.ok) throw new Error('series');
    expect(e.origin).toBe('vapor.devaull-2007');
    expect(e.series.times).toEqual(src.series.times);
    const base = p.devaull.input;
    const gw = base.source;
    if (gw.kind !== 'groundwater') throw new Error('source');
    src.series.values.forEach((c, i) => {
      const direct = devaullRun({ ...base, source: { ...gw, cgw: c } });
      expect(e.series.values[i]).toBe(Math.max(0, direct.concentration));
    });
  });

  it('records why the method has no series when its inputs fail', () => {
    const { form, p } = setup({ dvOxMode: 'coupled' });
    const src: SourceSeries = { kind: 'poreWater', label: 'x', constant: 1e-3 };
    const r = vaporEpcs(form, p, src, DEFAULT_OUTDOOR);
    expect(r.indoor.devaull).toBeUndefined();
    expect(r.errors.devaull).toMatch(/oxygen diffusion in air/i);
  });
});

describe('profile and CSV of the oxygen-limited method', () => {
  it('draws the engine profile in mg/m3 beside the other methods', () => {
    const { p } = setup();
    const out = runVapor(p);
    const curves = profileCurves(out);
    expect(curves.map((c) => c.method)).toEqual(['legacy', 'modern', 'devaull']);
    const d = curves.find((c) => c.method === 'devaull')!;
    const run = out.devaull;
    if (!run?.ok) throw new Error('run');
    expect(d.heights).toEqual(run.result.profile.map((x) => x.height));
    expect(d.values[0]).toBeCloseTo(run.result.sourceVapor / 1e-6, 9);
  });

  it('writes a results row and an oxygen detail row', () => {
    const { p } = setup();
    const out = runVapor(p);
    const tables = vaporCsvTables(out, null);
    const results = tables.find((t) => t.name === 'vapor-results')!;
    expect(results.rows.map((r) => r['method'])).toEqual([
      'vapor.je-1991',
      'vapor.je-epa',
      'vapor.devaull-2007',
    ]);
    const detail = tables.find((t) => t.name === 'vapor-oxygen-limited')!;
    expect(detail.rows).toHaveLength(1);
    const run = out.devaull;
    if (!run?.ok) throw new Error('run');
    expect(detail.rows[0]!['aerobicDepth']).toBe(run.result.aerobicDepth);
    expect(detail.rows[0]!['oxygenOption']).toBe('Aerobic depth entered');
  });

  it('writes no oxygen table when the method is not chosen', () => {
    const p = toInputs(DEFAULT_FORM);
    if (!p.ok) throw new Error('form');
    const tables = vaporCsvTables(runVapor(p), null);
    expect(tables.map((t) => t.name)).toEqual(['vapor-results']);
  });

  it('adds the series rows with the method id', () => {
    const { form, p } = setup({ source: 'groundwater', cgw: '1' });
    const src: SourceSeries = {
      kind: 'groundwater',
      label: 'Water table',
      series: { times: [0, 5 * YR], values: [2e-3, 1e-3] },
    };
    const epcs = vaporEpcs(form, p, src, DEFAULT_OUTDOOR);
    const t = vaporCsvTables(runVapor(p), epcs).find((x) => x.name === 'vapor-time-series')!;
    expect(t.rows.some((r) => r['method'] === 'vapor.devaull-2007')).toBe(true);
  });
});
