// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compute, lastYearMean, vadoseFluxSeries, type VadoseComputeResult } from './compute';
import {
  R7_FORM as DEFAULT_FORM,
  R7_PUBLISHED,
  addLayer,
  toScenario,
  type VadoseForm,
} from './form';

function run(over: Partial<VadoseForm> = {}): VadoseComputeResult {
  const r = toScenario({ ...DEFAULT_FORM, ...over });
  if (!r.ok) throw new Error(r.errors.join('; '));
  const out = compute({ scenario: r.scenario });
  if (!out.ok) throw new Error(out.error);
  return out.result;
}

const mgL = (kgm3: number) => kgm3 * 1e3;

describe('vadose compute: the Table R-7 case', () => {
  const res = run();
  const legacy = res.runs.legacy!;
  const modern = res.runs.modern!;

  it('runs both methods and uses the closed form and the analytic C14 solution', () => {
    expect(legacy.evaluation).toBe('closed-form');
    expect(modern.evaluation).toBe('analytic-c14');
    expect(res.unavailable).toEqual({});
  });

  it('puts the source pore water at the published value within 1 percent', () => {
    const cs0 = mgL(legacy.series.sourcePoreWater[0]!);
    expect(Math.abs(cs0 - R7_PUBLISHED.sourceMgPerL) / R7_PUBLISHED.sourceMgPerL).toBeLessThan(
      R7_PUBLISHED.sourceTolerance,
    );
    expect(legacy.partition.residual).toBe(true);
  });

  it('puts the mean of the last twelve month-ends of the legacy run within 3 percent of 10.8 mg/L', () => {
    const mean = mgL(lastYearMean(legacy.series.waterTable)!);
    expect(Math.abs(mean - R7_PUBLISHED.yearTenMgPerL) / R7_PUBLISHED.yearTenMgPerL).toBeLessThan(
      R7_PUBLISHED.yearTenTolerance,
    );
  });

  it('closes the source mass budget', () => {
    for (const r of [legacy, modern]) {
      const b = r.budget;
      expect(b.source + b.volatilized + b.sourceDecayed + b.leached).toBeCloseTo(b.initial, 9);
      expect(b.closure).toBeLessThan(1e-9);
      expect(b.delivered).toBeGreaterThan(0);
      expect(b.delivered).toBeLessThan(b.leached);
    }
  });

  it('returns profiles at the four profile times and a monthly series', () => {
    expect(legacy.profiles.times).toHaveLength(4);
    expect(legacy.profiles.depths).toHaveLength(61);
    expect(legacy.profiles.concentrations[3]).toHaveLength(61);
    expect(legacy.series.times).toHaveLength(121);
    expect(modern.series.times).toHaveLength(121);
  });

  it('lists the layers with moisture content and the transport parameters below the source', () => {
    expect(legacy.layers.map((l) => l.name)).toEqual([
      'Layer 1 above the source',
      'Layer 2 above the source',
      'Source',
      'Layer 1 below the source',
    ]);
    const below = legacy.layers[3]!;
    expect(below.theta).toBeCloseTo(0.0885, 4);
    expect(below.retardation).toBeGreaterThan(1);
  });

  it('tags each warning with its method', () => {
    const codes = res.warnings.map((w) => `${w.method}:${w.code}`);
    expect(codes).toContain('legacy:vadose.residual-phase');
    expect(codes).toContain('modern:vadose.residual-phase');
  });

  it('runs in well under a second', () => {
    const t0 = performance.now();
    run();
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('vadose compute: profiles that the legacy method cannot describe', () => {
  it('reports why the legacy method is unavailable and still runs the modern one', () => {
    const f = addLayer(DEFAULT_FORM, 'below');
    const res = run(f);
    expect(res.runs.legacy).toBeUndefined();
    expect(res.unavailable.legacy).toMatch(/one layer below/i);
    expect(res.runs.modern?.evaluation).toBe('finite-volume');
    expect(res.runs.modern?.budget.closure).toBeLessThan(1e-8);
  });
});

describe('vadose compute: engine errors', () => {
  it('returns an input error when a method rejects the inputs', () => {
    // infiltration above every Ks: the modern method refuses it and the legacy clamps it
    const r = toScenario({ ...DEFAULT_FORM, infiltration: '100000' });
    if (!r.ok) throw new Error('scenario');
    const out = compute({ scenario: r.scenario });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.runs.legacy?.clamped).toBe(true);
    expect(out.result.unavailable.modern).toMatch(/saturated conductivity/i);
    expect(out.result.warnings.map((w) => w.code)).toContain('vadose.infiltration-clamped');
  });

  it('fails only when no method ran', () => {
    const f = addLayer(DEFAULT_FORM, 'below');
    const r = toScenario({ ...f, infiltration: '100000' });
    if (!r.ok) throw new Error('scenario');
    const out = compute({ scenario: r.scenario });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/saturated conductivity/i);
  });
});

describe('vadose compute: the flux series for the groundwater coupling', () => {
  const r = toScenario(DEFAULT_FORM);
  if (!r.ok) throw new Error('scenario');

  it('returns the water-table flux series of either method over the requested time', () => {
    const t = r.scenario.duration * 1.5;
    for (const method of ['legacy', 'modern'] as const) {
      const s = vadoseFluxSeries(r.scenario, method, t);
      expect(s.times[0]).toBe(0);
      expect(s.times[s.times.length - 1]).toBeCloseTo(t, 3);
      expect(s.flux).toHaveLength(s.times.length);
      expect(Math.max(...s.flux)).toBeGreaterThan(0);
    }
  });

  it('agrees with the full run at the same duration', () => {
    const res = compute({ scenario: r.scenario });
    if (!res.ok) throw new Error('compute');
    const s = vadoseFluxSeries(r.scenario, 'modern', r.scenario.duration);
    const full = res.result.runs.modern!.series.flux;
    expect(s.flux[s.flux.length - 1]).toBeCloseTo(full[full.length - 1]!, 18);
  });
});
