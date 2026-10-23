// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { devaullRun, jeLegacyIndoor } from '@model-flow/engine';
import { DEFAULT_FORM, toInputs, type VaporForm } from './form';
import { runVapor } from './compute';
import { oxygenKgPerM3 } from './oxygenLimited';

// Oxygen properties used as test inputs only; the screen ships none (they are required inputs).
const OXY = { dvDa: '0.18', dvDw: '2.1e-5', dvH: '32' } as const;

const devaullForm = (over: Partial<VaporForm> = {}): VaporForm => ({
  ...DEFAULT_FORM,
  method: 'devaull',
  ...over,
});

describe('oxygen concentration', () => {
  it('converts percent by volume to kg/m3 with the ideal gas law at 1 atm', () => {
    // 0.21 x 101325 Pa x 0.031998 kg/mol / (8.314462618 x 298.15 K)
    expect(oxygenKgPerM3(21, 25)).toBeCloseTo(0.27465, 4);
    expect(oxygenKgPerM3(0, 25)).toBe(0);
  });
});

describe('DeVaull input from the form', () => {
  it('is not built unless the method is chosen', () => {
    const p = toInputs(DEFAULT_FORM);
    expect(p.ok && p.devaull).toBeFalsy();
  });

  it('builds one homogeneous column from the strata below the floor', () => {
    const p = toInputs(devaullForm());
    if (!p.ok || !p.devaull) throw new Error('form');
    expect(p.devaull.ok).toBe(true);
    if (!p.devaull.ok) return;
    const i = p.devaull.input;
    // 0.2 m lens (moisture 0.15) under 2.6 m of vadose zone (moisture 0.05), floor at 2 m
    expect(i.layer.thickness).toBeCloseTo(2.8, 12);
    expect(i.layer.porosity).toBeCloseTo(0.35, 12);
    expect(i.layer.moisture).toBeCloseTo((0.2 * 0.15 + 2.6 * 0.05) / 2.8, 12);
    expect(i.degradationRate).toBeCloseTo(0.73 / 3600, 15);
    expect(i.building.mixingHeight).toBeCloseTo(400 / 150, 12);
    expect(i.building.airExchangeRate).toBeCloseTo(0.5 / 3600, 15);
    expect(i.oxygen).toEqual({ mode: 'entered', aerobicDepth: 1 });
    expect(i.source).toEqual(p.legacy.source);
  });

  it('leaves the rate out when the chemical has no class rate', () => {
    const p = toInputs(devaullForm({ dvKw: '' }));
    if (!p.ok || !p.devaull || !p.devaull.ok) throw new Error('form');
    expect(p.devaull.input.degradationRate).toBeUndefined();
    const out = runVapor(p);
    if (!out.devaull?.ok) throw new Error('run');
    expect(out.devaull.result.warnings.map((w) => w.code)).toContain('vapor.no-degradation-rate');
  });

  it('turns the foundation into a mass transfer coefficient and the soil gas flow into a velocity', () => {
    const p = toInputs(devaullForm());
    if (!p.ok || !p.devaull || !p.devaull.ok) throw new Error('form');
    const f = p.devaull.input.foundation;
    // crack: D_crack eta / L with the foundation as a soil-like layer, as the legacy method has it
    expect(f.h).toBeGreaterThan(0);
    expect(f.h).toBeLessThan(1);
    const legacy = jeLegacyIndoor(p.legacy);
    expect(f.soilGasVelocity).toBeCloseTo(legacy.Qsoil / 150, 15);
  });

  it('uses an infinite coefficient for a dirt floor', () => {
    const p = toInputs(devaullForm({ foundation: 'basementDirt' }));
    if (!p.ok || !p.devaull || !p.devaull.ok) throw new Error('form');
    expect(p.devaull.input.foundation.h).toBe(Infinity);
  });

  it('requires the oxygen properties for the two oxygen options and names each', () => {
    const p = toInputs(devaullForm({ dvOxMode: 'coupled' }));
    if (!p.ok || !p.devaull) throw new Error('form');
    expect(p.devaull.ok).toBe(false);
    if (p.devaull.ok) return;
    const text = p.devaull.errors.join(' ');
    expect(text).toMatch(/oxygen diffusion in air/i);
    expect(text).toMatch(/oxygen diffusion in water/i);
    expect(text).toMatch(/oxygen henry/i);
    // the other methods are unaffected
    const out = runVapor(p);
    expect(out.legacy.ok).toBe(true);
    expect(out.devaull?.ok).toBe(false);
  });

  it('refuses an aerobic depth outside the column', () => {
    const p = toInputs(devaullForm({ dvAerobicDepth: '5' }));
    if (!p.ok || !p.devaull) throw new Error('form');
    expect(p.devaull.ok).toBe(false);
  });

  it('builds the fast-reaction and coupled options with respiration from the strata', () => {
    for (const mode of ['fastReaction', 'coupled'] as const) {
      const p = toInputs(devaullForm({ dvOxMode: mode, ...OXY, dvTotalHc: '50000' }));
      if (!p.ok || !p.devaull || !p.devaull.ok) throw new Error('form');
      const ox = p.devaull.input.oxygen;
      if (ox.mode === 'entered') throw new Error('mode');
      expect(ox.mode).toBe(mode);
      expect(ox.Da).toBeCloseTo(0.18e-4, 15);
      expect(ox.Dw).toBeCloseTo(2.1e-9, 18);
      expect(ox.H).toBe(32);
      expect(ox.massRatio).toBeCloseTo(3.072, 3);
      expect(ox.atmosphericConcentration).toBeCloseTo(oxygenKgPerM3(20.9, 25), 12);
      expect(ox.totalHydrocarbonVapor).toBeCloseTo(50000e-6, 12);
      // 1.69 mg/(g d) x foc 0.01 x 1700 kg/m3, weighted over the strata below the floor
      expect(ox.respiration).toBeCloseTo((1.69e-3 / 86400) * 0.01 * 1700, 15);
      const out = runVapor(p);
      if (!out.devaull?.ok) throw new Error('run');
      expect(out.devaull.result.aerobicDepth).toBeGreaterThan(0);
      expect(out.devaull.result.aerobicDepth).toBeLessThanOrEqual(2.8);
    }
  });

  it('drops respiration when it is switched off', () => {
    const p = toInputs(
      devaullForm({ dvOxMode: 'fastReaction', ...OXY, dvRespiration: false, dvTotalHc: '50000' }),
    );
    if (!p.ok || !p.devaull || !p.devaull.ok) throw new Error('form');
    const ox = p.devaull.input.oxygen;
    if (ox.mode === 'entered') throw new Error('mode');
    expect(ox.respiration).toBeUndefined();
  });

  it('leaves the total hydrocarbon vapor out when blank, so the engine warns', () => {
    const p = toInputs(devaullForm({ dvOxMode: 'fastReaction', ...OXY }));
    if (!p.ok || !p.devaull || !p.devaull.ok) throw new Error('form');
    const out = runVapor(p);
    if (!out.devaull?.ok) throw new Error('run');
    expect(out.devaull.result.warnings.map((w) => w.code)).toContain(
      'vapor.oxygen-demand-incomplete',
    );
  });
});

describe('runVapor with DeVaull', () => {
  it('gives exactly the engine result for the same input', () => {
    const p = toInputs(devaullForm());
    if (!p.ok || !p.devaull || !p.devaull.ok) throw new Error('form');
    const out = runVapor(p);
    if (!out.devaull?.ok) throw new Error('run');
    expect(out.devaull.result.concentration).toBe(devaullRun(p.devaull.input).concentration);
  });

  it('with no aerobic layer equals the legacy method on a single stratum', () => {
    const one: Partial<VaporForm> = {
      layers: [{ ...DEFAULT_FORM.layers[1]!, name: 'Soil', thickness: '4.8' }],
      dvAerobicDepth: '0',
    };
    const p = toInputs(devaullForm(one));
    if (!p.ok || !p.devaull || !p.devaull.ok) throw new Error('form');
    const out = runVapor(p);
    if (!out.devaull?.ok || !out.legacy.ok) throw new Error('run');
    const rel = Math.abs(out.devaull.result.concentration / out.legacy.result.concentration - 1);
    expect(rel).toBeLessThan(1e-9);
  });

  it('is absent when the method is not chosen', () => {
    const p = toInputs(DEFAULT_FORM);
    if (!p.ok) throw new Error('form');
    expect(runVapor(p).devaull).toBeUndefined();
  });
});
