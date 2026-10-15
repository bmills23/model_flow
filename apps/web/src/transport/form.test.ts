import { describe, expect, it } from 'vitest';
import { gelhar1985Longitudinal, xuEckstein1995Longitudinal } from '@model-flow/engine';
import { DEFAULT_FORM, toScenario, type TransportForm } from './form';

const YR = 365.25 * 86400;

function ok(form: TransportForm) {
  const r = toScenario(form);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scenario;
}

describe('toScenario: unit conversion at the boundary', () => {
  it('maps the defaults to a valid SI scenario', () => {
    const s = ok(DEFAULT_FORM);
    expect(s.porosity).toBeCloseTo(0.25, 12);
    expect(s.time).toBeCloseTo(15 * YR, 3);
  });

  it('computes seepage velocity from K, gradient and porosity in m/s', () => {
    const s = ok({
      ...DEFAULT_FORM,
      aquiferMode: 'darcy',
      K: '8.64',
      gradient: '0.003',
      porosity: '0.25',
    });
    expect(s.velocity).toBeCloseTo(((8.64 / 86400) * 0.003) / 0.25, 12);
  });

  it('takes seepage velocity directly in m/yr', () => {
    const s = ok({ ...DEFAULT_FORM, aquiferMode: 'velocity', velocityYr: '36.525' });
    expect(s.velocity).toBeCloseTo(36.525 / YR, 12);
  });

  it('converts mg/L to kg/m3 and builds the mass rate from the Darcy flux and source area', () => {
    const s = ok({ ...DEFAULT_FORM, c0: '10', srcWidth: '20', srcDepth: '3' });
    expect(s.c0).toBeCloseTo(0.01, 12);
    expect(s.massRate).toBeCloseTo(0.01 * s.velocity * s.porosity * 20 * 3, 15);
  });

  it('derives the held concentration from a mass rate in g/d', () => {
    const s = ok({ ...DEFAULT_FORM, sourceMode: 'massRate', massRate: '86.4' });
    expect(s.massRate).toBeCloseTo(86.4e-3 / 86400, 15);
    expect(s.c0).toBeCloseTo(s.massRate / (s.velocity * s.porosity * 20 * 3), 12);
  });

  it('converts half-life in years to a first-order rate per second, zero meaning no decay', () => {
    expect(ok({ ...DEFAULT_FORM, halfLifeYr: '10' }).decayRate).toBeCloseTo(
      Math.LN2 / (10 * YR),
      18,
    );
    expect(ok({ ...DEFAULT_FORM, halfLifeYr: '0' }).decayRate).toBe(0);
    expect(ok({ ...DEFAULT_FORM, halfLifeYr: '' }).decayRate).toBe(0);
  });

  it('computes retardation from Kd, bulk density and porosity', () => {
    const s = ok({
      ...DEFAULT_FORM,
      retardMode: 'kd',
      kd: '0.5',
      bulkDensity: '1.7',
      porosity: '0.25',
    });
    expect(s.retardation).toBeCloseTo(1 + (1.7 * 0.5) / 0.25, 12);
  });

  it('applies the legacy or modern dispersivity law at the receptor distance, with overrides', () => {
    const legacy = ok({ ...DEFAULT_FORM, dispLaw: 'legacy', rx: '80' });
    expect(legacy.alphaL).toBeCloseTo(gelhar1985Longitudinal(80), 12);
    expect(legacy.alphaT).toBeCloseTo(legacy.alphaL / 3, 12);
    const modern = ok({ ...DEFAULT_FORM, dispLaw: 'modern', rx: '80' });
    expect(modern.alphaL).toBeCloseTo(xuEckstein1995Longitudinal(80), 12);
    expect(modern.alphaT).toBeCloseTo(modern.alphaL / 10, 12);
    const over = ok({
      ...DEFAULT_FORM,
      alphaLOverride: '5',
      alphaTOverride: '1',
      alphaVOverride: '0.05',
    });
    expect([over.alphaL, over.alphaT, over.alphaV]).toEqual([5, 1, 0.05]);
    expect(over.dx).toBeCloseTo(5 * over.velocity, 15);
  });

  it('puts the source upgradient of x = 0 and measures depth down from the water table', () => {
    const inf = ok({
      ...DEFAULT_FORM,
      thicknessMode: 'infinite',
      srcLength: '15',
      srcWidth: '20',
      srcDepth: '3',
    });
    expect(inf.source).toMatchObject({ x1: -15, x2: 0, y1: -10, y2: 10 });
    expect(inf.zOf(0)).toBeCloseTo(0, 12);
    expect(inf.zOf(3)).toBe(-3);
    const fin = ok({ ...DEFAULT_FORM, thicknessMode: 'finite', thickness: '10', srcDepth: '3' });
    expect(fin.thickness).toBe(10);
    expect(fin.zOf(3)).toBe(7);
    expect(fin.source.z1).toBe(7);
    expect(fin.source.z2).toBe(10);
  });

  it('builds loading terms for continuous, pulse and stepped release', () => {
    expect(ok({ ...DEFAULT_FORM, loading: 'continuous' }).terms).toEqual([
      { start: 0, end: Infinity, factor: 1 },
    ]);
    const pulse = ok({ ...DEFAULT_FORM, loading: 'pulse', pulseYr: '2' });
    expect(pulse.terms).toEqual([{ start: 0, end: 2 * YR, factor: 1 }]);
    const steps = ok({
      ...DEFAULT_FORM,
      loading: 'steps',
      steps: [
        { start: '0', end: '3', factor: '1' },
        { start: '5', end: '8', factor: '0.5' },
      ],
    });
    expect(steps.terms[1]).toEqual({ start: 5 * YR, end: 8 * YR, factor: 0.5 });
  });

  it('converts the receptor screen interval and keeps a point receptor otherwise', () => {
    const p = ok({ ...DEFAULT_FORM, screen: false, rDepth: '1.5' });
    expect(p.receptorDepths).toEqual({ top: 1.5, bottom: 1.5 });
    const w = ok({ ...DEFAULT_FORM, screen: true, screenTop: '1', screenBottom: '2.5' });
    expect(w.receptorDepths).toEqual({ top: 1, bottom: 2.5 });
  });
});

describe('toScenario: validation', () => {
  it('reports blank and out-of-range inputs without throwing', () => {
    const r = toScenario({ ...DEFAULT_FORM, porosity: '1.4', K: '', srcWidth: '-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(' ')).toMatch(/porosity/i);
      expect(r.errors.join(' ')).toMatch(/conductivity/i);
      expect(r.errors.join(' ')).toMatch(/source width/i);
    }
  });

  it('rejects a source deeper than a finite aquifer and a screen with bottom above top', () => {
    const a = toScenario({
      ...DEFAULT_FORM,
      thicknessMode: 'finite',
      thickness: '2',
      srcDepth: '3',
    });
    expect(a.ok).toBe(false);
    const b = toScenario({ ...DEFAULT_FORM, screen: true, screenTop: '3', screenBottom: '1' });
    expect(b.ok).toBe(false);
  });

  it('rejects reversed loading steps', () => {
    const r = toScenario({
      ...DEFAULT_FORM,
      loading: 'steps',
      steps: [{ start: '4', end: '2', factor: '1' }],
    });
    expect(r.ok).toBe(false);
  });
});
