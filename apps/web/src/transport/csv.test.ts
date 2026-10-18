import { describe, expect, it } from 'vitest';
import { exportCsv } from '../export/csv';
import type { ComputeResult } from './compute';
import { transportCsvTables, transportResultRows, transportSeriesRows } from './csv';

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
