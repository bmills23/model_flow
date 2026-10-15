import { describe, expect, it } from 'vitest';
import { patchiConcentration } from '@model-flow/engine';
import { compute, receptorConcentration } from './compute';
import { DEFAULT_FORM, toScenario, type TransportForm } from './form';

function scenario(over: Partial<TransportForm> = {}) {
  const r = toScenario({ ...DEFAULT_FORM, ...over });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scenario;
}

describe('receptorConcentration', () => {
  it('matches the engine PATCHI value for a continuous point receptor', () => {
    const s = scenario({ rx: '60', ry: '2', rDepth: '1', timeYr: '8' });
    const direct = patchiConcentration(
      {
        velocity: s.velocity,
        retardation: s.retardation,
        decayRate: s.decayRate,
        dx: s.dx,
        dy: s.dy,
        dz: s.dz,
        c0: s.c0,
        patch: { y1: s.source.y1, y2: s.source.y2, z1: s.source.z1, z2: s.source.z2 },
      },
      { x: 60, y: 2, z: s.zOf(1) },
      s.time,
    );
    expect(receptorConcentration(s, 'modern', s.time)).toBeCloseTo(direct, 14);
    expect(direct).toBeGreaterThan(0);
  });

  it('gives a pulse a lower late-time value than continuous loading', () => {
    const cont = receptorConcentration(
      scenario({ timeYr: '30' }),
      'modern',
      scenario({ timeYr: '30' }).time,
    );
    const pulseS = scenario({ timeYr: '30', loading: 'pulse', pulseYr: '3' });
    const pulse = receptorConcentration(pulseS, 'modern', pulseS.time);
    expect(pulse).toBeLessThan(cont);
    expect(pulse).toBeGreaterThanOrEqual(0);
  });
});

describe('compute', () => {
  it('returns the map grid, both curves, readouts and warnings, with Domenico only on request', () => {
    const s = scenario();
    const out = compute({
      scenario: s,
      mapMethod: 'legacy',
      domenico: false,
      nx: 20,
      ny: 12,
      nCurve: 6,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.result;
    expect(r.grid.length).toBe(20);
    expect(r.grid[0]!.length).toBe(12);
    expect(r.times.length).toBe(7);
    expect(r.series.legacy.length).toBe(7);
    expect(r.series.modern.length).toBe(7);
    expect(r.series.domenico).toBeUndefined();
    expect(r.readouts.domenico).toBeUndefined();
    expect(r.readouts.legacy).toBeGreaterThan(0);
    expect(r.readouts.modern).toBeGreaterThan(0);
    expect(r.series.legacy[0]).toBe(0);
    expect(r.warnings.some((w) => w.code === 'ui.source-basis')).toBe(true);
  });

  it('adds the Domenico series, readout and its validity warnings when enabled', () => {
    const out = compute({
      scenario: scenario(),
      mapMethod: 'modern',
      domenico: true,
      nx: 12,
      ny: 8,
      nCurve: 4,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.series.domenico?.length).toBe(5);
    expect(out.result.readouts.domenico).toBeGreaterThanOrEqual(0);
    expect(out.result.warnings.some((w) => w.code.startsWith('domenico.'))).toBe(true);
  });

  it('uses PATCHF for a finite aquifer with a width and warns when the width is missing', () => {
    const finite = compute({
      scenario: scenario({ thicknessMode: 'finite', thickness: '10', width: '200' }),
      mapMethod: 'modern',
      domenico: false,
      nx: 10,
      ny: 8,
      nCurve: 3,
    });
    expect(finite.ok).toBe(true);
    const noWidth = compute({
      scenario: scenario({ thicknessMode: 'finite', thickness: '10', width: '' }),
      mapMethod: 'modern',
      domenico: false,
      nx: 10,
      ny: 8,
      nCurve: 3,
    });
    expect(
      noWidth.ok && noWidth.result.warnings.some((w) => w.code === 'ui.wexler-infinite-width'),
    ).toBe(true);
  });
});

describe('engine input errors', () => {
  const small = { nx: 8, ny: 6, nCurve: 3 };

  it('reports porosity 0 as an input error instead of throwing or returning zeros', () => {
    const s = { ...scenario(), porosity: 0 };
    const out = compute({ scenario: s, mapMethod: 'legacy', domenico: false, ...small });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/porosity/i);
  });

  it('reports a grid above the Peclet limit with the engine message', () => {
    const out = compute({
      scenario: scenario({
        alphaLOverride: '0.0001',
        alphaTOverride: '0.0001',
        alphaVOverride: '0.0001',
        xMax: '5000',
      }),
      mapMethod: 'modern',
      domenico: false,
      ...small,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/peclet/i);
  });

  it('reports overlapping loading steps as an input error', () => {
    const out = compute({
      scenario: scenario({
        loading: 'steps',
        steps: [
          { start: '0', end: '5', factor: '1' },
          { start: '3', end: '8', factor: '1' },
        ],
      }),
      mapMethod: 'modern',
      domenico: true,
      ...small,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/overlap/i);
  });

  it('no longer emits the ui.superposition note for pulse loading', () => {
    const out = compute({
      scenario: scenario({ loading: 'pulse', pulseYr: '3' }),
      mapMethod: 'modern',
      domenico: false,
      ...small,
    });
    expect(out.ok && out.result.warnings.some((w) => w.code === 'ui.superposition')).toBe(false);
  });
});
