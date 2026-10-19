import { describe, expect, it } from 'vitest';
import { saturatedSeries, saturatedVlines, SATURATED_METHODS } from './timeSeries';
import type { SaturatedComputeResult, RunSummary } from './compute';

const result = {
  curves: {
    timesYr: [0, 1],
    rate: { legacy: [1, 1], modern: [2, 1] },
    remaining: { legacy: [5, 4], modern: [5, 3] },
  },
} as unknown as SaturatedComputeResult;

describe('saturated time series helpers', () => {
  it('builds one series per shown method from the chosen curve', () => {
    const s = saturatedSeries(result, ['legacy', 'modern'], 'remaining');
    expect(s.map((x) => x.key)).toEqual(['legacy', 'modern']);
    expect(s[1]!.values).toEqual([5, 3]);
    expect(s[0]!.label).toBe(SATURATED_METHODS.legacy.label);
  });

  it('marks a depletion time only when it falls inside the horizon', () => {
    const YR = 365.25 * 86400;
    const runs = [
      { method: 'legacy', depletionTime: 2 * YR },
      { method: 'modern', depletionTime: Infinity },
    ] as unknown as RunSummary[];
    expect(saturatedVlines(runs, 5)).toHaveLength(1);
    expect(saturatedVlines(runs, 1)).toHaveLength(0);
  });
});
