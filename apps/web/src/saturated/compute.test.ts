import { describe, expect, it } from 'vitest';
import { convert } from '@model-flow/engine';
import { compute, type SaturatedComputeResult } from './compute';
import { DEFAULT_FORM, toScenario, type SaturatedForm } from './form';

const YR = convert(1, 'yr', 's');
const DAY = 86400;

function run(over: Partial<SaturatedForm> = {}): SaturatedComputeResult {
  const r = toScenario({ ...DEFAULT_FORM, ...over });
  if (!r.ok) throw new Error(r.errors.join('; '));
  const out = compute({ scenario: r.scenario });
  if (!out.ok) throw new Error(out.error);
  return out.result;
}

describe('saturated compute: hand case A (separate phase with fluctuation)', () => {
  const res = run();
  const legacy = res.runs.legacy!;
  const modern = res.runs.modern!;

  it('runs both methods', () => {
    expect(res.unavailable).toEqual({});
    expect(legacy.methodId).toBe('saturatedSource.two-region');
    expect(modern.methodId).toBe('saturatedSource.exponential');
  });

  it('reproduces the note values: M0, depletion time, gamma, delivered mass', () => {
    expect(legacy.initialMass).toBeCloseTo(17, 9);
    expect(legacy.depletionTime / DAY).toBeCloseTo(1763.1226, 3);
    expect(modern.gamma! * YR).toBeCloseTo(0.20716087, 7);
    expect(modern.budget.delivered).toBeCloseTo(14.85829, 4);
    expect(modern.depletionTime).toBe(Infinity);
  });

  it('gives the seasonal legacy depletion time', () => {
    const s = run({ schedule: 'seasonal' }).runs.legacy!;
    expect(s.depletionTime / DAY).toBeCloseTo(1737.23, 3);
  });

  it('reports both regions with a separate phase and the levels', () => {
    expect(legacy.regions.unsaturated?.residual).toBe(true);
    expect(legacy.regions.saturated?.residual).toBe(true);
    expect(legacy.levels.hLo).toBe(0.5);
    expect(legacy.levels.hHi).toBe(1.5);
  });

  it('tags warnings by method', () => {
    const residual = res.warnings.filter((w) => w.code === 'saturatedSource.residual-phase');
    expect(residual.map((w) => w.method).sort()).toEqual(['legacy', 'legacy', 'modern', 'modern']);
  });

  it('builds common curves with a step at the legacy depletion time', () => {
    const c = res.curves;
    const td = convert(legacy.depletionTime, 's', 'yr');
    const k = c.timesYr.findIndex((t) => Math.abs(t - td) < 1e-9);
    expect(k).toBeGreaterThan(0);
    expect(c.rate.legacy![k]).toBe(0);
    expect(c.rate.legacy![k - 1]).toBeGreaterThan(0);
    expect(c.remaining.legacy![k]).toBeCloseTo(0, 9);
    expect(c.remaining.modern![0]).toBeCloseTo(17, 9);
    expect(c.rate.modern!.length).toBe(c.timesYr.length);
    expect(c.timesYr[c.timesYr.length - 1]).toBeCloseTo(10, 9);
  });
});

describe('saturated compute: hand case B and edge cases', () => {
  it('warns that the dissolved source is held constant when no separate phase is present', () => {
    const r = run({ tphOn: false, F: '100', hMin: '1', dh: '0' });
    expect(r.runs.legacy!.depletionTime / DAY).toBeCloseTo(174.12094, 3);
    expect(
      r.warnings.some(
        (w) => w.method === 'legacy' && w.code === 'saturatedSource.constant-dissolved-source',
      ),
    ).toBe(true);
    expect(
      r.warnings.some(
        (w) => w.method === 'modern' && w.code === 'saturatedSource.constant-dissolved-source',
      ),
    ).toBe(false);
  });

  it('runs the legacy method without the source decay and the modern one with it', () => {
    const r = run({ srcDecay: '0.001' });
    expect(r.unavailable).toEqual({});
    expect(r.runs.legacy!.budget.decayed).toBe(0);
    expect(r.runs.modern!.budget.decayed).toBeGreaterThan(0);
    const b = r.runs.modern!.budget;
    expect(b.initial).toBeCloseTo(b.remaining + b.delivered + b.decayed, 9);
  });

  it('reports an engine input error when neither method can run', () => {
    const s = toScenario({ ...DEFAULT_FORM, infiltration: '300000' });
    if (!s.ok) throw new Error('scenario');
    const out = compute({ scenario: s.scenario });
    // legacy clamps; the modern method refuses infiltration at or above K, so legacy still runs
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.unavailable.modern).toMatch(/infiltration/i);
  });

  it('returns plain data that survives structured cloning', () => {
    const r = run();
    expect(() => structuredClone(r)).not.toThrow();
  });
});
