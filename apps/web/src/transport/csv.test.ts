import { describe, expect, it } from 'vitest';
import { exportCsv } from '../export/csv';
import type { ComputeResult } from './compute';
import { plumeCsvTable, transportCsvTables, transportResultRows, transportSeriesRows } from './csv';

const YR = 365.25 * 86400;
const result: ComputeResult = {
  xs: [],
  ys: [],
  grid: [],
  times: [0, YR, 2 * YR],
  series: { legacy: [0, 0.001, 0.002], modern: [0, 0.0011, 0.0021] },
  readouts: { legacy: 0.002, modern: 0.0021 },
  warnings: [],
};

describe('transport CSV', () => {
  it('writes one results row per method in mg/L with the method id', () => {
    const rows = transportResultRows(result, 2);
    expect(rows).toEqual([
      { method: 'groundwater.at123d', time: 2, concentration: 0.002 * 1e3 },
      { method: 'groundwater.wexler1992', time: 2, concentration: 0.0021 * 1e3 },
    ]);
  });
  it('writes the breakthrough curve in years and mg/L, skipping absent methods', () => {
    const rows = transportSeriesRows(result);
    expect(rows).toHaveLength(6);
    expect(rows[1]).toEqual({ method: 'groundwater.at123d', time: 1, concentration: 0.001 * 1e3 });
    expect(rows.some((r) => r.method === 'groundwater.domenico1987')).toBe(false);
  });
  it('includes Domenico when present and puts units in the header', () => {
    const withD = { ...result, readouts: { ...result.readouts, domenico: 0.003 } };
    const [res] = transportCsvTables(withD, 2);
    const csv = exportCsv(res!.rows, res!.columns);
    expect(csv.split('\r\n')[0]).toBe('method,evaluation time (yr),concentration (mg/L)');
    expect(res!.rows).toHaveLength(3);
  });
});

describe('plume CSV', () => {
  const plume = {
    ...result,
    xs: [0, 10, 20],
    ys: [-5, 0, 5, 10],
    grid: [
      [0, 0.001, 0.002, 0],
      [0.003, 0.004, 0.005, 0],
      [0, 0.006, 0, 0.007],
    ],
  } as ComputeResult;
  it('writes one long-format row per grid cell in mg/L with the time in the header', () => {
    const t = plumeCsvTable(plume, 'modern', 12.5);
    expect(t.rows).toHaveLength(3 * 4);
    const csv = exportCsv(t.rows, t.columns);
    expect(csv.split('\r\n')[0]).toBe(
      'method,x downgradient (m),y (m),concentration at 12.5 yr (mg/L)',
    );
    expect(t.rows[0]).toEqual({
      method: 'groundwater.wexler1992',
      x: 0,
      y: -5,
      concentration: 0,
    });
    expect(t.rows[5]).toMatchObject({ x: 10, y: 0, concentration: 0.004 * 1e3 });
    expect(t.rows[11]).toMatchObject({ x: 20, y: 10, concentration: 0.007 * 1e3 });
  });
  it('is a separate table named for the plume and leaves the existing tables alone', () => {
    expect(plumeCsvTable(plume, 'legacy', 1).name).toBe('transport-plume');
    expect(transportCsvTables(plume, 1).map((t) => t.name)).toEqual([
      'transport-results',
      'transport-breakthrough',
    ]);
  });
});
