import { describe, expect, it } from 'vitest';
import {
  empiricalCdf,
  fanBands,
  histogram,
  sobolRows,
  summaryRows,
  tornadoRows,
  FAN_PROBABILITIES,
} from './resultsData';

describe('histogram', () => {
  it('uses linear bins when the output spans two decades or fewer', () => {
    const h = histogram([1, 2, 3, 4, 5, 50, 100], 5);
    expect(h.log).toBe(false);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(7);
    expect(h.edges.length).toBe(h.counts.length + 1);
    expect(h.edges[0]).toBe(1);
    expect(h.edges[h.edges.length - 1]).toBe(100);
  });
  it('uses log10 bins when positive values span more than two decades', () => {
    const h = histogram([1, 10, 100, 1000, 5000], 4);
    expect(h.log).toBe(true);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(5);
    const r = h.edges.map((e, i) => (i === 0 ? 1 : e / (h.edges[i - 1] as number)));
    expect(r[1]).toBeCloseTo(r[2] as number, 9);
  });
  it('falls back to linear when a value is not positive, and keeps the maximum in the last bin', () => {
    const h = histogram([0, 1e-9, 1e9], 3);
    expect(h.log).toBe(false);
    expect(h.counts[h.counts.length - 1]).toBeGreaterThanOrEqual(1);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(3);
  });
  it('handles a constant sample with one bin', () => {
    const h = histogram([2, 2, 2]);
    expect(h.counts).toEqual([3]);
  });
});

describe('empiricalCdf', () => {
  it('sorts and steps by 1/n, ignoring non-finite values', () => {
    const c = empiricalCdf([3, 1, Number.NaN, 2]);
    expect(c).toEqual([
      { x: 1, p: 1 / 3 },
      { x: 2, p: 2 / 3 },
      { x: 3, p: 1 },
    ]);
  });
});

describe('fanBands', () => {
  it('takes the 5, 25, 50, 75 and 95th percentiles per time point over the finite curves', () => {
    const curves = [0, 1, 2, 3, 4].map((k) => [k, 10 * k]);
    curves.push([Number.NaN, Number.NaN]);
    const f = fanBands([1, 2], curves);
    expect(FAN_PROBABILITIES).toEqual([0.05, 0.25, 0.5, 0.75, 0.95]);
    expect(f.used).toBe(5);
    expect(f.times).toEqual([1, 2]);
    expect(f.bands[2]).toEqual([2, 20]);
    expect(f.bands[0]?.[0]).toBeCloseTo(0.2, 12);
    expect(f.bands[4]?.[1]).toBeCloseTo(38, 12);
  });
  it('refuses curves of the wrong length', () => {
    expect(() => fanBands([1, 2], [[1]])).toThrow(/length/);
  });
});

describe('tornadoRows', () => {
  it('keeps the engine order, drops failed entries to the end and names the inputs', () => {
    const rows = tornadoRows(
      {
        baseOutput: 5,
        runs: 5,
        entries: [
          { id: 'a', lowInput: 1, highInput: 2, low: 1, high: 9, swing: 8 },
          { id: 'b', lowInput: 1, highInput: 2, low: Number.NaN, high: 3, swing: Number.NaN },
        ],
      },
      { a: 'Body weight' },
    );
    expect(rows[0]).toMatchObject({ label: 'Body weight', low: 1, high: 9, ok: true });
    expect(rows[1]).toMatchObject({ label: 'b', ok: false });
  });
});

describe('sobolRows', () => {
  it('pairs each index with its interval and flags a half-width above 0.05', () => {
    const rows = sobolRows(
      {
        ids: ['a', 'b'],
        first: [0.5, 0],
        firstRaw: [0.5, -0.01],
        total: [0.6, 0.1],
        firstInterval: [
          [0.45, 0.55],
          [-0.05, 0.05],
        ],
        totalInterval: [
          [0.5, 0.7],
          [0.05, 0.15],
        ],
        firstHalfWidth: [0.05, 0.05],
        totalHalfWidth: [0.1, 0.05],
      },
      { b: 'Intake' },
    );
    expect(rows[0]).toMatchObject({ label: 'a', first: 0.5, total: 0.6, converged: false });
    expect(rows[1]).toMatchObject({ label: 'Intake', firstRaw: -0.01, converged: true });
  });
});

describe('summaryRows', () => {
  it('lists the statistics in a fixed order', () => {
    const r = summaryRows({
      n: 3,
      min: 1,
      p5: 1.1,
      p25: 1.5,
      p50: 2,
      p75: 2.5,
      p90: 2.8,
      p95: 2.9,
      max: 3,
      mean: 2,
      sd: 1,
    });
    expect(r.map((x) => x.label)).toEqual([
      'Minimum',
      '5th percentile',
      '25th percentile',
      'Median',
      '75th percentile',
      '90th percentile',
      '95th percentile',
      'Maximum',
      'Mean',
      'Standard deviation',
    ]);
    expect(r[3]?.value).toBe(2);
  });
});
