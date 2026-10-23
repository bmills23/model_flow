// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  boxConcentrationFromFlux,
  devaullRun,
  jeEpaIndoor,
  jeLegacyIndoor,
  sourceVapor,
  steadyDiffusionFlux,
} from '@model-flow/engine';
import { DEFAULT_FORM, toInputs, type VaporForm } from './form';
import { DEFAULT_OUTDOOR } from './outdoor';
import { vaporCoefficients } from './coefficients';
import { decodeSi, encodeSi, forwardAir, type VaporSolveSpec } from './forward';

const OXY = { dvDa: '0.18', dvDw: '2.1e-5', dvH: '32' } as const;

function setup(patch: Partial<VaporForm> = {}) {
  const form: VaporForm = { ...DEFAULT_FORM, ...patch };
  const p = toInputs(form);
  if (!p.ok) throw new Error(`form: ${p.errors.join('; ')}`);
  return { form, p };
}

function specOf(c: { quantified: boolean; solve?: VaporSolveSpec } | undefined): VaporSolveSpec {
  if (!c?.solve) throw new Error('no solve state');
  return c.solve;
}

describe('JSON-safe SI state', () => {
  it('carries Infinity and NaN through a JSON round trip and drops undefined', () => {
    const x = { h: Infinity, a: [1, -Infinity, { n: NaN }], u: undefined, ok: 2, s: 'soil' };
    const wire = JSON.parse(JSON.stringify(encodeSi(x)));
    const back = decodeSi(wire) as typeof x;
    expect(back.h).toBe(Infinity);
    expect(back.a[1]).toBe(-Infinity);
    expect(Number.isNaN((back.a[2] as { n: number }).n)).toBe(true);
    expect(back.ok).toBe(2);
    expect(back.s).toBe('soil');
    expect('u' in back).toBe(false);
  });
});

describe('forwardAir reproduces the engine run of each forward model', () => {
  it('TPH soil, legacy and modern: the state survives JSON and gives the screen run', () => {
    const { form, p } = setup({
      source: 'soil',
      soilConc: '20',
      tphOn: true,
      tph: '5000',
      tphMolarMass: '100',
    });
    for (const method of ['legacy', 'modern'] as const) {
      const spec = specOf(
        vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, method).indoor as never,
      );
      const wired: VaporSolveSpec = JSON.parse(JSON.stringify(spec));
      const direct =
        method === 'legacy'
          ? jeLegacyIndoor(p.legacy).concentration
          : jeEpaIndoor(p.modern).concentration;
      expect(forwardAir(wired, 20e-6)).toBeCloseTo(direct, 18);
      expect(forwardAir(wired, 20e-6)).toBe(forwardAir(spec, 20e-6));
    }
  });

  it('outdoor box for a TPH soil source: the engine flux through the column to the box', () => {
    const { form, p } = setup({
      source: 'soil',
      soilConc: '20',
      tphOn: true,
      tph: '5000',
      tphMolarMass: '100',
    });
    const c = vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'legacy').outdoor;
    const spec = specOf(c as never);
    const vapor = sourceVapor(p.legacy.source).cvs;
    const column = (() => {
      const s = JSON.parse(JSON.stringify(spec.forward)) as { column: never[] };
      return decodeSi(s.column) as Parameters<typeof steadyDiffusionFlux>[0];
    })();
    const flux = steadyDiffusionFlux(column, p.legacy.chemical, vapor);
    const box = { length: 10, width: 10, height: 2, windSpeed: 2.25 };
    expect(forwardAir(spec, 20e-6)).toBeCloseTo(boxConcentrationFromFlux(box, flux), 20);
  });

  it('oxygen-limited coupled mode: the engine run, with a dirt floor (infinite h) through JSON', () => {
    const { form, p } = setup({
      method: 'devaull',
      foundation: 'basementDirt',
      source: 'soilGas',
      soilGas: '20000',
      dvOxMode: 'coupled',
      ...OXY,
    });
    const spec = specOf(
      vaporCoefficients(form, p, null, DEFAULT_OUTDOOR, 'devaull').indoor as never,
    );
    const wired: VaporSolveSpec = JSON.parse(JSON.stringify(spec));
    if (!p.devaull?.ok) throw new Error('devaull parse');
    const direct = devaullRun(p.devaull.input).concentration;
    expect(forwardAir(wired, 20000e-6)).toBeCloseTo(direct, 18);
  });
});
