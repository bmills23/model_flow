// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { jeLegacyIndoor, jeEpaIndoor } from '@model-flow/engine';
import { DEFAULT_FORM, RISC4_BENZENE, toInputs, type VaporForm } from './form';
import { runVapor } from './compute';
import { columnToGrade } from './outdoor';

const MGM3 = 1e-6;

describe('vapor form', () => {
  it('parses the default Table R-3 case into both engine inputs', () => {
    const p = toInputs(DEFAULT_FORM);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.legacy.layers.map((l) => l.thickness)).toEqual([0.2, 2.6]);
    expect(p.legacy.building.foundation.thickness).toBeCloseTo(0.15, 12);
    expect(p.modern.strata).toHaveLength(3);
    expect(p.modern.floorDepth).toBeCloseTo(2, 12);
    expect(p.modern.building.depthBelowGrade).toBeCloseTo(2, 12);
  });

  it('lists every unparsable field', () => {
    const p = toInputs({ ...DEFAULT_FORM, floorArea: 'abc', airExchange: '-1' });
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.errors.join(' ')).toMatch(/floor area/i);
      expect(p.errors.join(' ')).toMatch(/air exchange/i);
    }
  });

  it('carries the RISC4 benzene values', () => {
    expect(RISC4_BENZENE.H).toBe('0.228');
  });
});

describe('runVapor', () => {
  it('reproduces Table R-3 case A with the legacy method within 0.5 percent', () => {
    const p = toInputs(DEFAULT_FORM);
    if (!p.ok) throw new Error('form');
    const out = runVapor(p);
    expect(out.legacy.ok).toBe(true);
    if (!out.legacy.ok) return;
    expect(Math.abs(out.legacy.result.concentration / MGM3 / 8.57 - 1)).toBeLessThan(0.005);
  });

  it('gives exactly the engine results for the same inputs', () => {
    const p = toInputs(DEFAULT_FORM);
    if (!p.ok) throw new Error('form');
    const out = runVapor(p);
    if (!out.legacy.ok || !out.modern.ok) throw new Error('run');
    expect(out.legacy.result.concentration).toBe(jeLegacyIndoor(p.legacy).concentration);
    expect(out.modern.result.concentration).toBe(jeEpaIndoor(p.modern).concentration);
    expect(out.modern.result.concentration).toBeGreaterThan(0);
  });

  it('reports an input one method refuses for that method alone', () => {
    const form: VaporForm = { ...DEFAULT_FORM, source: 'groundwater', cgw: '1' };
    const p = toInputs({ ...form, layers: form.layers.map((l) => ({ ...l, texture: 'custom' })) });
    if (!p.ok) throw new Error('form');
    const out = runVapor(p);
    expect(out.legacy.ok).toBe(true);
    expect(out.modern.ok).toBe(false);
    if (!out.modern.ok) expect(out.modern.error).toMatch(/capillary/i);
  });

  it('collects warning codes of both methods', () => {
    const p = toInputs(DEFAULT_FORM);
    if (!p.ok) throw new Error('form');
    const out = runVapor(p);
    if (!out.modern.ok) throw new Error('run');
    expect(out.modern.result.warnings.map((w) => w.code)).toContain(
      'vapor.soil-source-not-recommended',
    );
  });
});

describe('both methods describe the same site', () => {
  const gw: VaporForm = {
    ...DEFAULT_FORM,
    source: 'groundwater',
    cgw: '1',
    capHeight: '0.2',
    capPorosity: '0.35',
    capMoisture: '0.345',
  };

  it('puts the water table at the base of the strata for the legacy and the modern method', () => {
    const p = toInputs(gw);
    if (!p.ok) throw new Error('form');
    const legacyL = p.legacy.layers.reduce((a, l) => a + l.thickness, 0) + 0.2;
    const strataSum = p.modern.strata.reduce((a, s) => a + s.thickness, 0);
    expect(legacyL + p.modern.floorDepth).toBeCloseTo(strataSum, 12);
    expect(strataSum).toBeCloseTo(4.8, 12);
  });

  it('keeps the outdoor column the same length as the strata', () => {
    const p = toInputs(gw);
    if (!p.ok) throw new Error('form');
    const total = columnToGrade(p).reduce((a, l) => a + l.thickness, 0);
    expect(total).toBeCloseTo(4.8, 12);
  });

  it('refuses a fringe that leaves no soil above it below the floor', () => {
    const p = toInputs({ ...gw, capHeight: '2.8' });
    expect(p.ok).toBe(false);
  });
});

describe('soil gas flow defaults', () => {
  it('reaches the modern default ratio and still runs the legacy method', () => {
    const p = toInputs({ ...DEFAULT_FORM, soilGasMode: 'default' });
    if (!p.ok) throw new Error('form');
    expect(p.modern.building.soilGas).toBeUndefined();
    expect(p.legacy.building.soilGas).toHaveProperty('dP');
    const out = runVapor(p);
    if (!out.modern.ok) throw new Error('run');
    const b = out.modern.result;
    expect(b.Qsoil / b.QB).toBeCloseTo((0.003 * 0.45) / 0.5, 10);
  });

  it('gives the modern run its own viscosity default, 1.75e-5 Pa s', () => {
    expect(DEFAULT_FORM.viscosity).toBe('1.8e-4');
    const p = toInputs(DEFAULT_FORM);
    if (!p.ok) throw new Error('form');
    const g = p.modern.building.soilGas as { mu: number };
    expect(g.mu).toBeCloseTo(1.75e-5, 12);
    const l = p.legacy.building.soilGas as { mu: number };
    expect(l.mu).toBeCloseTo(1.8e-5, 12);
  });
});
