// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SOIL_TEXTURES, henryAtTemperature, jeEpaIndoor, jeLegacyIndoor } from '@model-flow/engine';
import { DEFAULT_FORM, applyTexture, toInputs, type VaporForm } from './form';
import { DEFAULT_OUTDOOR } from './outdoor';
import { vaporEpcs, type SourceSeries } from './series';

const YR = 365.25 * 86400;
const code = Object.keys(SOIL_TEXTURES)[0] as keyof typeof SOIL_TEXTURES;

function gwForm(): VaporForm {
  return {
    ...DEFAULT_FORM,
    source: 'groundwater',
    cgw: '1',
    layers: DEFAULT_FORM.layers.map((l) => applyTexture(l, code)),
  };
}

function parse(form: VaporForm) {
  const p = toInputs(form);
  if (!p.ok) throw new Error(p.errors.join(';'));
  return p;
}

const waterTable: SourceSeries = {
  kind: 'groundwater',
  label: 'Water table under the building',
  series: {
    times: [0, 5 * YR, 10 * YR, 20 * YR],
    values: [2e-3, 1.5e-3, 5e-4, 1e-4],
  },
};

describe('vaporEpcs with a groundwater series', () => {
  it('gives a series EPC per method whose values are the engine runs at each time', () => {
    const form = gwForm();
    const p = parse(form);
    const r = vaporEpcs(form, p, waterTable, DEFAULT_OUTDOOR);
    expect(r.indoor.legacy?.kind).toBe('series');
    expect(r.indoor.legacy?.origin).toBe('vapor.je-1991');
    expect(r.indoor.modern?.origin).toBe('vapor.je-epa');
    const leg = r.indoor.legacy!;
    if (leg.kind !== 'series') throw new Error('series');
    expect(leg.series.times).toEqual(waterTable.series.times);
    waterTable.series.values.forEach((c, i) => {
      const src = p.legacy.source;
      if (src.kind !== 'groundwater') throw new Error('source');
      const direct = jeLegacyIndoor({ ...p.legacy, source: { ...src, cgw: c } });
      expect(leg.series.values[i]).toBe(Math.max(0, direct.concentration));
    });
    const mod = r.indoor.modern!;
    if (mod.kind !== 'series') throw new Error('series');
    const dm = jeEpaIndoor({ ...p.modern, source: { kind: 'groundwater', cgw: 5e-4 } });
    expect(mod.series.values[2]).toBe(Math.max(0, dm.concentration));
  });

  it('feeds the legacy outdoor box as a series with the box method as its origin', () => {
    const form = gwForm();
    const r = vaporEpcs(form, parse(form), waterTable, DEFAULT_OUTDOOR);
    expect(r.outdoor.legacy?.kind).toBe('series');
    expect(r.outdoor.legacy?.origin).toBe('outdoorAir.box');
    expect(r.outdoor.modern).toBeUndefined();
  });

  it('warns that the steady method is applied to a source that changes within the establishment time', () => {
    const form = gwForm();
    const fast: SourceSeries = {
      ...waterTable,
      series: { times: [0, 3600, 7200], values: [2e-3, 1e-3, 1e-4] },
    };
    const r = vaporEpcs(form, parse(form), fast, DEFAULT_OUTDOOR);
    expect(r.warnings.map((w) => w.code)).toContain('vapor.quasi-steady');
    const slow = vaporEpcs(
      form,
      parse(form),
      { ...waterTable, series: { times: [0, 1e12], values: [1e-3, 1e-3] } },
      DEFAULT_OUTDOOR,
    );
    expect(slow.warnings.map((w) => w.code)).not.toContain('vapor.quasi-steady');
  });

  it('reports a method the engine refuses without losing the other', () => {
    const form = { ...gwForm(), layers: DEFAULT_FORM.layers };
    const r = vaporEpcs(form, parse(form), waterTable, DEFAULT_OUTDOOR);
    expect(r.indoor.legacy).toBeDefined();
    expect(r.indoor.modern).toBeUndefined();
    expect(r.errors.modern).toMatch(/capillary/i);
  });
});

describe('vaporEpcs with a pore water source', () => {
  it('uses H times the pore water as the soil gas source, series or constant', () => {
    const form = DEFAULT_FORM;
    const p = parse(form);
    const H = 0.228;
    const series: SourceSeries = {
      kind: 'poreWater',
      label: 'Vadose source pore water',
      series: { times: [0, YR, 2 * YR], values: [1e-3, 5e-4, 1e-4] },
    };
    const r = vaporEpcs(form, p, series, DEFAULT_OUTDOOR);
    const leg = r.indoor.legacy!;
    if (leg.kind !== 'series') throw new Error('series');
    const direct = jeLegacyIndoor({ ...p.legacy, source: { kind: 'soilGas', csg: H * 5e-4 } });
    expect(leg.series.values[1]).toBe(direct.concentration);

    const c = vaporEpcs(
      form,
      p,
      { kind: 'poreWater', label: 'Saturated region 1', constant: 2e-4 },
      DEFAULT_OUTDOOR,
    );
    expect(c.indoor.legacy?.kind).toBe('constant');
    const dc = jeLegacyIndoor({ ...p.legacy, source: { kind: 'soilGas', csg: H * 2e-4 } });
    const ci = c.indoor.legacy!;
    if (ci.kind !== 'constant') throw new Error('constant');
    expect(ci.value).toBe(dc.concentration);
    expect(c.outdoor.legacy?.kind).toBe('constant');
  });
});

describe('vaporEpcs establishment time and temperature', () => {
  it('uses the gas-referenced capacity in the establishment time (finding 4)', () => {
    const form = DEFAULT_FORM;
    const p = parse(form);
    const probe = jeEpaIndoor({ ...p.modern, source: { kind: 'soilGas', csg: 1e-3 } });
    expect(probe.capacityRg).toBeGreaterThan(2);
    const tauDT = (probe.LT * probe.LT) / probe.DT;
    const tauTrue = tauDT * probe.capacityRg;
    // A source halving over a time between the bare diffusion time and the true time.
    const t = Math.sqrt(tauDT * tauTrue);
    const src: SourceSeries = {
      kind: 'poreWater',
      label: 'Vadose source pore water',
      series: { times: [0, t, 2 * t], values: [1e-3, 5e-4, 2.5e-4] },
    };
    const r = vaporEpcs(form, p, src, DEFAULT_OUTDOOR);
    expect(r.warnings.map((w) => w.code)).toContain('vapor.quasi-steady');
  });

  it('sources the modern pore water vapor with the temperature-corrected H prime (finding 7)', () => {
    const form: VaporForm = {
      ...DEFAULT_FORM,
      temperature: '10',
      TB: '353.24',
      TC: '562.16',
      dHvb: '7342',
    };
    const p = parse(form);
    const c = 5e-4;
    const hp = henryAtTemperature({
      HR: p.modern.chemical.henryAtm,
      dHvb: 7342,
      TB: 353.24,
      TC: 562.16,
      TS: p.modern.temperature,
    }).Hprime;
    expect(hp).not.toBeCloseTo(0.228, 2);
    const r = vaporEpcs(
      form,
      p,
      { kind: 'poreWater', label: 'Saturated region 1', constant: c },
      DEFAULT_OUTDOOR,
    );
    const direct = jeEpaIndoor({ ...p.modern, source: { kind: 'soilGas', csg: hp * c } });
    const mi = r.indoor.modern!;
    if (mi.kind !== 'constant') throw new Error('constant');
    expect(mi.value).toBe(Math.max(0, direct.concentration));
  });
});
