import { describe, expect, it } from 'vitest';
import {
  boxConcentrationFromFlux,
  qOverCToSi,
  ssgVolatilizationFactor,
  steadyDiffusionFlux,
} from '@model-flow/engine';
import { DEFAULT_FORM, toInputs } from './form';
import { runVapor } from './compute';
import { DEFAULT_OUTDOOR, runOutdoor } from './outdoor';

function setup(patch = {}) {
  const form = { ...DEFAULT_FORM, ...patch };
  const p = toInputs(form);
  if (!p.ok) throw new Error('form');
  return { form, p, out: runVapor(p) };
}

describe('outdoor air', () => {
  it('legacy: the box over the steady diffusion flux through the whole column to grade', () => {
    const { form, p, out } = setup();
    if (!out.legacy.ok) throw new Error('run');
    const r = runOutdoor(form, p, out, DEFAULT_OUTDOOR);
    expect(r.legacy.ok).toBe(true);
    if (!r.legacy.ok) return;
    // strata run from grade down: 2 m, 2.6 m, 0.2 m; the column is listed from the source up
    const layers = [
      { thickness: 0.2, porosity: 0.35, moisture: 0.15 },
      { thickness: 2.6, porosity: 0.35, moisture: 0.05 },
      { thickness: 2, porosity: 0.35, moisture: 0.05 },
    ];
    const flux = steadyDiffusionFlux(layers, p.legacy.chemical, out.legacy.result.sourceVapor);
    expect(r.legacy.flux).toBe(flux);
    const box = { length: 10, width: 10, height: 2, windSpeed: 2.25 };
    expect(r.legacy.concentration).toBe(boxConcentrationFromFlux(box, flux));
    expect(r.legacy.concentration).toBeGreaterThan(0);
  });

  it('modern: the SSG volatilization factor for a soil source', () => {
    const { form, p, out } = setup();
    const r = runOutdoor(form, p, out, DEFAULT_OUTDOOR);
    expect(r.modern.ok).toBe(true);
    if (!r.modern.ok) return;
    const s = p.modern.strata[p.modern.strata.length - 1]!;
    const vf = ssgVolatilizationFactor({
      chemical: p.legacy.chemical,
      soil: {
        porosity: s.porosity,
        moisture: s.moisture,
        bulkDensity: s.bulkDensity,
        kd: (p.modern.chemical.koc ?? 0) * s.foc,
      },
      qOverC: qOverCToSi(68.81),
    });
    expect(r.modern.vf).toBe(vf.vf);
    expect(r.modern.concentration).toBeCloseTo(1e-3 / vf.vf, 18);
  });

  it('modern: not offered for a groundwater or soil gas source', () => {
    const { form, p, out } = setup({ source: 'soilGas' });
    const r = runOutdoor(form, p, out, DEFAULT_OUTDOOR);
    expect(r.modern.ok).toBe(false);
    if (!r.modern.ok) expect(r.modern.error).toMatch(/soil source/i);
  });

  it('lists a bad box field', () => {
    const { form, p, out } = setup();
    const r = runOutdoor(form, p, out, { ...DEFAULT_OUTDOOR, windSpeed: '0' });
    expect(r.legacy.ok).toBe(false);
  });
});
