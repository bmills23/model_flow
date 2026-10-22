import { describe, expect, it } from 'vitest';
import {
  at123dConcentration,
  patchiConcentration,
  patchiGrid,
  type WexlerInput,
} from '@model-flow/engine';
import { compute, plumeGrid, receptorConcentration } from './compute';
import { toScenario, type TransportForm } from './form';
import { REGRESSION_FORM as DEFAULT_FORM } from './regression.testkit';

function scenario(over: Partial<TransportForm> = {}) {
  const r = toScenario({ ...DEFAULT_FORM, ...over });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scenario;
}

/** The Wexler parameters of a scenario with its source patch replaced. */
function wexlerParams(s: ReturnType<typeof scenario>, z1: number, z2: number): WexlerInput {
  return {
    velocity: s.velocity,
    retardation: s.retardation,
    decayRate: s.decayRate,
    dx: s.dx,
    dy: s.dy,
    dz: s.dz,
    c0: s.c0,
    patch: { y1: s.source.y1, y2: s.source.y2, z1, z2 },
  };
}

describe('receptorConcentration', () => {
  it('matches the no-flux image patch of the engine PATCHI value for a continuous point receptor', () => {
    const s = scenario({ rx: '60', ry: '2', rDepth: '1', timeYr: '8' });
    // the water table at z = 0 is no-flux, so the held patch [-T, 0] is mirrored to [-T, T]
    const direct = patchiConcentration(
      wexlerParams(s, s.source.z1, -s.source.z1),
      {
        x: 60,
        y: 2,
        z: s.zOf(1),
      },
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

describe('the infinitely deep legacy aquifer has a no-flux water table', () => {
  it('puts the water table at z = 0, the source box below it and the receptors at z = -depth', () => {
    const s = scenario({ srcDepth: '3' });
    expect(s.zOf(0)).toBeCloseTo(0, 12);
    expect(s.zOf(2.5)).toBe(-2.5);
    expect(s.source.z2).toBeCloseTo(0, 12);
    expect(s.source.z1).toBe(-3);
    expect(s.top).toBe('no-flux');
  });

  it('leaves a finite aquifer without a top flag and measures z from its base', () => {
    const s = scenario({ thicknessMode: 'finite', thickness: '10', srcDepth: '3' });
    expect(s.top).toBeUndefined();
    expect(s.zOf(0)).toBe(10);
    expect(s.source.z2).toBe(10);
  });

  it('runs a typed (not vadose-fed) source through the no-flux kernel, above the whole-space value', () => {
    const s = scenario({ rx: '60', ry: '0', rDepth: '0.5', timeYr: '8' });
    const input = (top: 'no-flux' | 'unbounded') => ({
      aquifer: {
        velocity: s.velocity,
        porosity: s.porosity,
        retardation: s.retardation,
        decayRate: s.decayRate,
        dx: s.dx,
        dy: s.dy,
        dz: s.dz,
        top,
      },
      source: s.source,
      loading: s.terms.map((t) => ({ start: t.start, end: t.end, rate: s.massRate * t.factor })),
      time: s.time,
    });
    const p = { x: 60, y: 0, z: s.zOf(0.5) };
    const want = at123dConcentration(input('no-flux'), p);
    const whole = at123dConcentration(input('unbounded'), p);
    const got = receptorConcentration(s, 'legacy', s.time);
    expect(got).toBeCloseTo(want, 14);
    expect(got).toBeGreaterThan(whole);
  });
});

describe('the modern method honours the no-flux water table of an infinitely deep aquifer', () => {
  const depths = [0, 1.5, 3, 6];

  it('reads the no-flux value at every depth, not the leaky whole-space value', () => {
    for (const d of depths) {
      const s = scenario({
        srcWidth: '5',
        srcDepth: '3',
        rx: '60',
        ry: '0',
        rDepth: String(d),
        timeYr: '20',
      });
      const noFlux = patchiConcentration(wexlerParams(s, -3, 3), { x: 60, y: 0, z: -d }, s.time);
      const leaky = patchiConcentration(wexlerParams(s, -3, 0), { x: 60, y: 0, z: -d }, s.time);
      const got = receptorConcentration(s, 'modern', s.time);
      expect(Math.abs(got - noFlux)).toBeLessThanOrEqual(1e-9 * noFlux);
      if (d === 0) expect(leaky / noFlux).toBeLessThan(0.6);
    }
  });

  it('gives the plan-view grid the no-flux values too', () => {
    const s = scenario({ srcWidth: '5', srcDepth: '3', rDepth: '1.5', timeYr: '20' });
    const xs = [10, 40, 90];
    const ys = [-4, 0, 4];
    const got = plumeGrid(s, 'modern', xs, ys);
    const want = patchiGrid(wexlerParams(s, -3, 3), xs, ys, -1.5, s.time);
    xs.forEach((_, i) =>
      ys.forEach((__, j) => {
        expect(Math.abs(got[i]![j]! - want[i]![j]!)).toBeLessThanOrEqual(1e-9 * want[i]![j]!);
      }),
    );
  });

  it('applies the no-flux water table to pulse loading and a screened receptor', () => {
    const s = scenario({
      srcWidth: '5',
      srcDepth: '3',
      loading: 'pulse',
      pulseYr: '3',
      timeYr: '10',
      screen: true,
      screenTop: '0',
      screenBottom: '2',
    });
    const { top: _top, ...open } = s;
    void _top;
    const leaky = receptorConcentration(open, 'modern', s.time);
    expect(receptorConcentration(s, 'modern', s.time)).toBeGreaterThan(leaky);
  });

  it('keeps the modern and legacy depth profiles in the same shape near the water table', () => {
    // the two methods differ in source basis, so compare the depth profile of their ratio: with both
    // honouring the no-flux water table it is flat to a few percent (whole-space Wexler fell to half)
    const ratio = (d: number): number => {
      const s = scenario({
        srcWidth: '5',
        srcDepth: '3',
        rx: '60',
        ry: '0',
        rDepth: String(d),
        timeYr: '20',
      });
      return (
        receptorConcentration(s, 'modern', s.time) / receptorConcentration(s, 'legacy', s.time)
      );
    };
    const r0 = ratio(0);
    for (const d of [1.5, 3]) expect(Math.abs(ratio(d) / r0 - 1)).toBeLessThan(0.05);
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

  it('describes the finite-thickness, blank-width fallback as a layer with infinite width', () => {
    const out = compute({
      scenario: scenario({ thicknessMode: 'finite', thickness: '10', width: '' }),
      mapMethod: 'modern',
      domenico: false,
      nx: 6,
      ny: 4,
      nCurve: 2,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const w = out.result.warnings.find((x) => x.code === 'ui.wexler-infinite-width');
    expect(w?.message).not.toMatch(/infinite width and depth/);
    expect(w?.message).toMatch(/no-flux top and bottom/);
  });
});

describe('a finite-thickness aquifer without a width keeps both no-flux boundaries', () => {
  const H = 10;
  const s = scenario({
    thicknessMode: 'finite',
    thickness: String(H),
    width: '',
    srcWidth: '5',
    srcDepth: '3',
    rx: '60',
    ry: '0',
    timeYr: '20',
  });

  // whole-space solution summed over the images of the patch about z = 0 and z = H
  const images = (z: number): number => {
    let sum = 0;
    const { z1, z2 } = s.source;
    for (let n = -10; n <= 10; n++) {
      for (const [a, b] of [
        [z1 + 2 * n * H, z2 + 2 * n * H],
        [-z2 + 2 * n * H, -z1 + 2 * n * H],
      ] as const) {
        sum += patchiConcentration(wexlerParams(s, a, b), { x: 60, y: 0, z }, s.time);
      }
    }
    return sum;
  };

  it('matches the image sum at the water table, mid-depth and the aquifer base', () => {
    for (const d of [0, 1.5, 5, 10]) {
      const sd = { ...s, receptorDepths: { top: d, bottom: d } };
      const want = images(s.zOf(d));
      const got = receptorConcentration(sd, 'modern', s.time);
      expect(want).toBeGreaterThan(0);
      expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-6 * want);
    }
  });

  it('exceeds the whole-space value, which ignores both boundaries', () => {
    const open = patchiConcentration(
      wexlerParams(s, s.source.z1, s.source.z2),
      { x: 60, y: 0, z: H },
      s.time,
    );
    expect(images(H)).toBeGreaterThan(open * 1.2);
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
