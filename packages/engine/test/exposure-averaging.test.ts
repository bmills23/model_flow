import { describe, expect, it } from 'vitest';
import {
  maximizeWindows,
  seriesValue,
  validateSeries,
  windowAverage,
  windowIntegral,
} from '../src/processes/exposure/averaging.js';
import { YEAR_S } from '../src/processes/exposure/units.js';

const Y = YEAR_S;
const tri = {
  // rises 0 to 10 over 10 yr, falls to 0 at 30 yr, then 0 to 40 yr
  times: [0, 10 * Y, 30 * Y, 40 * Y],
  values: [0, 10, 0, 0],
};

describe('series validation', () => {
  it('rejects short, unordered, negative or non-finite series', () => {
    expect(() => validateSeries({ times: [0], values: [1] }, 's')).toThrow(RangeError);
    expect(() => validateSeries({ times: [0, 1], values: [1] }, 's')).toThrow(RangeError);
    expect(() => validateSeries({ times: [1, 1], values: [1, 1] }, 's')).toThrow(RangeError);
    expect(() => validateSeries({ times: [2, 1], values: [1, 1] }, 's')).toThrow(RangeError);
    expect(() => validateSeries({ times: [-1, 1], values: [1, 1] }, 's')).toThrow(RangeError);
    expect(() => validateSeries({ times: [0, 1], values: [1, -1] }, 's')).toThrow(RangeError);
    expect(() => validateSeries({ times: [0, Infinity], values: [1, 1] }, 's')).toThrow(RangeError);
    expect(() => validateSeries({ times: [0, 1], values: [1, NaN] }, 's')).toThrow(RangeError);
    expect(() => validateSeries({ times: [0, 1], values: [1, 2] }, 's')).not.toThrow();
  });
});

describe('piecewise-linear integrals', () => {
  it('interpolates linearly and is zero outside the samples', () => {
    expect(seriesValue(tri, 5 * Y)).toBeCloseTo(5, 12);
    expect(seriesValue(tri, 20 * Y)).toBeCloseTo(5, 12);
    expect(seriesValue(tri, 50 * Y)).toBe(0);
  });

  it('integrates exactly (trapezoids)', () => {
    expect(windowIntegral(tri, 0, 10 * Y) / Y).toBeCloseTo(50, 10);
    expect(windowIntegral(tri, 0, 30 * Y) / Y).toBeCloseTo(150, 10);
    expect(windowIntegral(tri, 5 * Y, 15 * Y) / Y).toBeCloseTo(
      ((5 + 10) / 2) * 5 + ((10 + 7.5) / 2) * 5,
      10,
    );
  });

  it('averages over the covered span and reports the coverage', () => {
    const full = windowAverage(tri, 0, 10 * Y);
    expect(full.average).toBeCloseTo(5, 12);
    expect(full.complete).toBe(true);
    const part = windowAverage(tri, 35 * Y, 50 * Y);
    expect(part.complete).toBe(false);
    expect(part.average).toBe(0);
    const rising = { times: [0, 10 * Y], values: [0, 10] };
    const p2 = windowAverage(rising, 5 * Y, 20 * Y);
    expect(p2.complete).toBe(false);
    expect(p2.average).toBeCloseTo(7.5, 12);
    expect(windowAverage(rising, 20 * Y, 30 * Y).average).toBe(0);
  });
});

describe('maximizing over the start time', () => {
  it('finds an interior stationary point of the moving average (hump)', () => {
    // 10 yr window on the triangle: the best start has c(s) = c(s + 10 yr), s = 20/3 yr, average 25/3
    const r = maximizeWindows([
      { series: tri, windows: [{ offset: 0, length: 10 * Y, weight: 1 }] },
    ]);
    expect(r.start / Y).toBeCloseTo(20 / 3, 9);
    expect(r.value).toBeCloseTo(25 / 3, 10);
    expect(r.shorter).toBe(false);
  });

  it('beats a fine grid of start times', () => {
    const terms = [
      {
        series: tri,
        windows: [
          { offset: 0, length: 6 * Y, weight: 3 },
          { offset: 6 * Y, length: 20 * Y, weight: 1 },
        ],
      },
    ];
    const r = maximizeWindows(terms);
    let best = -Infinity;
    for (let s = 0; s <= 14 * Y; s += Y / 50) {
      const v =
        3 * windowAverage(tri, s, s + 6 * Y).average +
        windowAverage(tri, s + 6 * Y, s + 26 * Y).average;
      best = Math.max(best, v);
    }
    expect(r.value).toBeGreaterThanOrEqual(best * (1 - 1e-12));
  });

  it('a constant series gives the constant for any window', () => {
    const c = { times: [0, 50 * Y], values: [2, 2] };
    const r = maximizeWindows([{ series: c, windows: [{ offset: 0, length: 7 * Y, weight: 1 }] }]);
    expect(r.value).toBeCloseTo(2, 12);
  });

  it('a window longer than the series averages the span and says so', () => {
    const r = maximizeWindows([
      { series: tri, windows: [{ offset: 0, length: 60 * Y, weight: 1 }] },
    ]);
    expect(r.shorter).toBe(true);
    expect(r.start).toBe(0);
    expect(r.value).toBeCloseTo(150 / 40, 10);
  });

  it('can be pinned to a start time', () => {
    const r = maximizeWindows(
      [{ series: tri, windows: [{ offset: 0, length: 10 * Y, weight: 1 }] }],
      { start: 20 * Y },
    );
    expect(r.start).toBe(20 * Y);
    expect(r.value).toBeCloseTo(windowIntegral(tri, 20 * Y, 30 * Y) / (10 * Y), 12);
  });
});
