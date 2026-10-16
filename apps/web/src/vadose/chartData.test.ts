import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import {
  BUDGET_ORDER,
  budgetRows,
  budgetStack,
  fluxGPerM2Day,
  layerBands,
  massRateKgPerDay,
  profileCurves,
  spreadLabels,
  waterTableSeries,
} from './chartData';
import { DEFAULT_FORM, addLayer, toScenario, type VadoseForm } from './form';

function runs(over: Partial<VadoseForm> = {}) {
  const r = toScenario({ ...DEFAULT_FORM, ...over });
  if (!r.ok) throw new Error(r.errors.join('; '));
  const out = compute({ scenario: r.scenario });
  if (!out.ok) throw new Error(out.error);
  return { scenario: r.scenario, result: out.result };
}

describe('unit helpers', () => {
  it('converts flux to g/m2/d and mass rate to kg/d', () => {
    expect(fluxGPerM2Day(1e-9)).toBeCloseTo(1e-9 * 1000 * 86400, 12);
    expect(massRateKgPerDay(2e-6)).toBeCloseTo(2e-6 * 86400, 12);
  });
});

describe('profileCurves', () => {
  const { scenario, result } = runs();
  const run = result.runs.legacy!;
  const curves = profileCurves(run);

  it('returns one labelled curve per profile time in mg/L, depth increasing', () => {
    expect(curves.depths[0]).toBe(0);
    expect(curves.depths[curves.depths.length - 1]).toBeCloseTo(scenario.waterTableDepth, 12);
    expect(curves.curves.map((c) => c.label)).toEqual(['1 yr', '2.5 yr', '5 yr', '10 yr']);
    expect(curves.curves[3]!.values[0]).toBeCloseTo(run.profiles.concentrations[3]![0]! * 1e3, 9);
  });

  it('keeps the profile from the inlet to the water table decreasing for a clean initial column', () => {
    const v = curves.curves[3]!.values;
    expect(v[0]).toBeGreaterThan(v[v.length - 1]!);
  });
});

describe('layerBands', () => {
  it('spans the water-table depth with one band per layer below the source', () => {
    const { result } = runs();
    const bands = layerBands(result.runs.legacy!);
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({ top: 0, bottom: 2.8 });
    const three = runs(addLayer(addLayer(DEFAULT_FORM, 'below'), 'below'));
    const b = layerBands(three.result.runs.modern!);
    expect(b.map((x) => x.top)).toEqual([0, 2.8, 3.8]);
    expect(b[2]!.bottom).toBeCloseTo(4.8, 12);
  });
});

describe('waterTableSeries', () => {
  const { result } = runs();

  it('gives each available method in mg/L, or g/m2/d for the flux', () => {
    const c = waterTableSeries(result.runs, 'concentration');
    expect(Object.keys(c.values).sort()).toEqual(['legacy', 'modern']);
    expect(c.timesYr[c.timesYr.length - 1]).toBeCloseTo(10, 6);
    expect(c.values.legacy![120]).toBeCloseTo(result.runs.legacy!.series.waterTable[120]! * 1e3, 9);
    const f = waterTableSeries(result.runs, 'flux');
    expect(f.values.modern![120]).toBeCloseTo(
      fluxGPerM2Day(result.runs.modern!.series.flux[120]!),
      12,
    );
  });
});

describe('budgetStack', () => {
  const { result } = runs();
  const run = result.runs.modern!;
  const stack = budgetStack(run);

  it('stacks source, volatilized, in transit and delivered, dropping the unused source decay', () => {
    expect(stack.categories.map((c) => c.key)).toEqual([
      'source',
      'volatilized',
      'transit',
      'delivered',
    ]);
    expect(BUDGET_ORDER.indexOf('transit')).toBeLessThan(BUDGET_ORDER.indexOf('delivered'));
  });

  it('adds up to the initial mass at every time', () => {
    for (let k = 0; k < stack.timesYr.length; k++) {
      const total = stack.categories.reduce((a, c) => a + c.values[k]!, 0);
      expect(total).toBeCloseTo(run.budget.initial, 6);
    }
  });

  it('builds area bands whose top edge is the running total', () => {
    const top = stack.bands[stack.bands.length - 1]!;
    expect(top.upper[5]).toBeCloseTo(run.budget.initial, 6);
    expect(stack.bands[0]!.lower.every((v) => v === 0)).toBe(true);
  });

  it('includes source decay when the source decays', () => {
    const d = runs({ srcDecay: '0.001' }).result.runs.modern!;
    expect(budgetStack(d).categories.map((c) => c.key)).toContain('sourceDecayed');
  });
});

describe('budgetRows', () => {
  it('lists parts with kg and percent of the initial mass that add up for the modern method', () => {
    const { result } = runs();
    const run = result.runs.modern!;
    const rows = budgetRows(run);
    const get = (k: string) => rows.find((r) => r.key === k)!;
    expect(get('initial').percent).toBeCloseTo(100, 9);
    const parts = ['source', 'volatilized', 'leached'].reduce((a, k) => a + get(k).percent, 0);
    expect(parts).toBeCloseTo(100, 6);
    const leaching = get('delivered').kg + get('inProfile').kg + get('transitLoss').kg;
    expect(leaching).toBeCloseTo(get('leached').kg, 6);
    expect(rows.find((r) => r.key === 'inletExcess')).toBeUndefined();
  });

  it('shows the inlet excess row for the legacy method and keeps the accounting identity', () => {
    const { result } = runs();
    const run = result.runs.legacy!;
    const rows = budgetRows(run);
    const get = (k: string) => rows.find((r) => r.key === k)!;
    expect(get('inletExcess').kg).toBeGreaterThan(0);
    expect(get('delivered').kg + get('inProfile').kg + get('transitLoss').kg).toBeCloseTo(
      get('leached').kg + get('inletExcess').kg,
      6,
    );
  });
});

describe('spreadLabels', () => {
  it('keeps labels at least a gap apart inside the bounds and in order', () => {
    const out = spreadLabels([50, 52, 54, 200], 14, 10, 300);
    for (let i = 1; i < out.length; i++)
      expect(out[i]! - out[i - 1]!).toBeGreaterThanOrEqual(14 - 1e-9);
    expect(out[0]).toBeGreaterThanOrEqual(10);
    expect(out[out.length - 1]).toBeLessThanOrEqual(300);
    expect(out[3]).toBe(200);
  });

  it('pulls a crowd at the bottom edge back inside the bounds', () => {
    const out = spreadLabels([295, 296, 297], 14, 10, 300);
    expect(out[2]).toBeLessThanOrEqual(300);
    expect(out[1]! - out[0]!).toBeGreaterThanOrEqual(14 - 1e-9);
  });
});
