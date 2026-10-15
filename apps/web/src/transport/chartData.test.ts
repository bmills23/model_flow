import { describe, expect, it } from 'vitest';
import {
  colourFraction,
  contourBands,
  contourLevels,
  flattenGrid,
  formatConcentration,
  linePath,
} from './chartData';

describe('flattenGrid', () => {
  it('turns c[ix][iy] in kg/m3 into row-major mg/L with x fastest', () => {
    const c = [
      [0.001, 0.002],
      [0.003, 0.004],
    ];
    const flat = flattenGrid(c);
    expect(flat.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 3, 2, 4]);
  });
});

describe('contourLevels', () => {
  it('uses equal steps below the maximum on a linear scale', () => {
    const l = contourLevels(9.3, 'linear');
    expect(l[0]).toBeGreaterThan(0);
    expect(l.every((v) => v < 9.3)).toBe(true);
    expect(l.length).toBeGreaterThanOrEqual(4);
    expect(l.length).toBeLessThanOrEqual(10);
    const step = l[0]!;
    expect(l.every((v, i) => Math.abs(v - step * (i + 1)) < 1e-9)).toBe(true);
  });

  it('uses 1-2-5 decades on a log scale, ascending, no more than eight levels', () => {
    const l = contourLevels(37, 'log');
    expect(l.length).toBeLessThanOrEqual(8);
    expect(l).toEqual([...l].sort((a, b) => a - b));
    expect(l[l.length - 1]).toBe(20);
    expect(l).toContain(10);
    expect(l).toContain(5);
  });

  it('returns no levels for an empty plume', () => {
    expect(contourLevels(0, 'linear')).toEqual([]);
    expect(contourLevels(0, 'log')).toEqual([]);
  });
});

describe('colourFraction', () => {
  it('runs from a pale to a full ramp position as the level rises', () => {
    const levels = [1, 2, 5, 10];
    for (const scale of ['linear', 'log'] as const) {
      const f = levels.map((v) => colourFraction(v, levels, scale));
      expect(f[0]).toBeGreaterThan(0);
      expect(f[3]).toBeCloseTo(1, 12);
      expect(f).toEqual([...f].sort((a, b) => a - b));
    }
  });
});

describe('contourBands', () => {
  it('produces one filled region per level that the data reaches', () => {
    const nx = 21;
    const ny = 11;
    const values: number[] = [];
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) values.push(10 * Math.exp(-((i - 5) ** 2 + (j - 5) ** 2) / 20));
    const bands = contourBands(values, nx, ny, [1, 5, 10.5], 'linear', (cx) => cx * 10, (cy) => cy * 10);
    expect(bands.map((b) => b.level)).toEqual([1, 5]);
    expect(bands[0]!.d).toMatch(/^M[\d.-]/);
  });

  it('maps grid vertices to the supplied coordinates (cell centres at index + 0.5)', () => {
    const values = [0, 0, 0, 0, 5, 0, 0, 0, 0];
    const [band] = contourBands(values, 3, 3, [1], 'linear', (cx) => cx, (cy) => cy);
    expect(band!.d).toContain('1.5');
  });
});

describe('linePath', () => {
  it('draws a polyline and lifts the pen over gaps', () => {
    expect(
      linePath([
        [0, 0],
        [1, 2],
        [2, NaN],
        [3, 4],
      ]),
    ).toBe('M0,0L1,2M3,4');
  });
});

describe('formatConcentration', () => {
  it('keeps three significant figures and switches to exponent form for small values', () => {
    expect(formatConcentration(12.3456)).toBe('12.3');
    expect(formatConcentration(0)).toBe('0');
    expect(formatConcentration(0.000123)).toBe('1.23e-4');
  });
});
