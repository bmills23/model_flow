import { describe, expect, it } from 'vitest';
import { chartModel, curveDomain, logGrid } from './chartData';

describe('logGrid', () => {
  it('is geometric, includes both ends and is increasing', () => {
    const g = logGrid(1e-3, 1e3, 7);
    expect(g).toHaveLength(7);
    expect(g[0]).toBeCloseTo(1e-3, 15);
    expect(g[6]).toBeCloseTo(1e3, 9);
    expect(g[3]).toBeCloseTo(1, 12);
  });
  it('rejects a bad range', () => {
    expect(() => logGrid(0, 1, 5)).toThrow(RangeError);
    expect(() => logGrid(2, 1, 5)).toThrow(RangeError);
  });
});

describe('curveDomain', () => {
  it('centres on the level with two decades each way', () => {
    const [lo, hi] = curveDomain(10, 1, undefined);
    expect(lo).toBeCloseTo(0.1, 12);
    expect(hi).toBeCloseTo(1000, 9);
  });
  it('does not pass the cap', () => {
    const [, hi] = curveDomain(10, 1, 50);
    expect(hi).toBe(50);
  });
  it('without a level spans three decades each way around the start, up to the cap', () => {
    const [lo, hi] = curveDomain(null, 1, 100);
    expect(lo).toBeCloseTo(1e-3, 12);
    expect(hi).toBe(100);
  });
});

describe('chartModel', () => {
  const conc = [1, 10, 100, 1000];
  it('keeps positive points, puts the target and the solution on the chart', () => {
    const m = chartModel({ conc, metric: [0, 0.5, 5, 50], target: 1, level: 20 });
    expect(m.points.map((p) => p.x)).toEqual([10, 100, 1000]);
    expect(m.target).toBe(1);
    expect(m.solution).toEqual({ x: 20, y: 1 });
    expect(m.yDomain[0]).toBeLessThan(0.5);
    expect(m.yDomain[1]).toBeGreaterThan(50);
  });
  it('has no solution marker when the target is not reachable', () => {
    const m = chartModel({ conc, metric: [0.1, 0.2, 0.3, 0.4], target: 1, level: null });
    expect(m.solution).toBeNull();
    expect(m.yDomain[1]).toBeGreaterThan(1);
  });
  it('is empty when the metric is zero everywhere', () => {
    const m = chartModel({ conc, metric: [0, 0, 0, 0], target: 1, level: null });
    expect(m.points).toEqual([]);
  });
});
