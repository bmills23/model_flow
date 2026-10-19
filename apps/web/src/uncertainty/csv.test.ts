import { describe, expect, it } from 'vitest';
import { exportCsv } from '../export/csv';
import {
  cleanupLevelRows,
  cleanupUncertaintyTables,
  exposureUncertaintyTables,
  SUMMARY_COLUMNS,
  sampleRows,
  sensitivityRows,
  summaryCsvRows,
} from './csv';

const summary = {
  n: 4,
  min: 1,
  p5: 1.1,
  p25: 2,
  p50: 3,
  p75: 4,
  p90: 4.5,
  p95: 4.8,
  max: 5,
  mean: 3.1,
  sd: 1.2,
} as never;

describe('uncertainty CSV', () => {
  it('writes the summary statistics with the method id and the output unit', () => {
    const rows = summaryCsvRows('uncertainty.lhs-ic', 'Hazard index', '1', summary);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual({
      method: 'uncertainty.lhs-ic',
      output: 'Hazard index',
      statistic: 'Minimum',
      value: 1,
      unit: '1',
    });
    const text = exportCsv(rows, SUMMARY_COLUMNS);
    expect(text.split('\r\n')[0]).toBe('method,output,statistic,value,unit');
    expect(text).toContain('uncertainty.lhs-ic,Hazard index,Median,3,1');
  });

  it('lists tornado, rank correlation and Sobol rows in one long table', () => {
    const rows = sensitivityRows({
      method: 'uncertainty.srs-exposure',
      tornado: [{ label: 'Body weight', low: 1, high: 2, lowInput: 50, highInput: 90, ok: true }],
      spearman: [{ label: 'Body weight', rho: -0.7 }],
      sobol: [
        {
          label: 'Body weight',
          first: 0.5,
          firstRaw: 0.52,
          firstInterval: [0.4, 0.6],
          total: 0.6,
          totalInterval: [0.5, 0.7],
          converged: true,
        },
      ],
    });
    const measures = rows.map((r) => r.measure);
    expect(measures).toEqual([
      'one-at-a-time low',
      'one-at-a-time high',
      'Spearman rank correlation',
      'Sobol first order',
      'Sobol total',
    ]);
    expect(rows.find((r) => r.measure === 'Sobol total')).toMatchObject({
      method: 'uncertainty.sobol-saltelli',
      value: 0.6,
      lower: 0.5,
      upper: 0.7,
    });
    expect(rows[0]).toMatchObject({ input: 'Body weight', inputValue: 50, value: 1 });
  });

  it('writes every iteration of the sample, numbered from 1, at full precision', () => {
    const rows = sampleRows('uncertainty.srs-exposure', 'Cancer risk', '1', [0.1 + 0.2, 4e-7]);
    expect(rows.map((r) => r.iteration)).toEqual([1, 2]);
    expect(rows[0]?.value).toBe(0.30000000000000004);
  });

  it('builds the exposure tables only for what the run has', () => {
    const t = exposureUncertaintyTables({
      method: 'uncertainty.srs-exposure',
      outputLabel: 'Cancer risk',
      unit: '1',
      summary: null,
      values: [],
      tornado: [],
      spearman: [],
      sobol: null,
    });
    expect(t.map((x) => x.name)).toEqual([]);
    const full = exposureUncertaintyTables(
      {
        method: 'uncertainty.srs-exposure',
        outputLabel: 'Cancer risk',
        unit: '1',
        summary,
        values: [1, 2],
        tornado: [],
        spearman: [{ label: 'x', rho: 0.1 }],
        sobol: null,
      },
      ['rsl'],
    );
    expect(full.map((x) => x.name)).toEqual([
      'uncertainty-summary',
      'uncertainty-sample',
      'uncertainty-sensitivity',
    ]);
    expect(full.every((x) => x.editions?.includes('rsl'))).toBe(true);
  });

  it('states the cleanup levels in the screen unit with a protected percentage', () => {
    const rows = cleanupLevelRows(
      [
        { p: 0.5, level: 2e-3 },
        { p: 0.95, level: null },
      ],
      0.95,
      'mg/L',
      1000,
    );
    expect(rows).toEqual([
      {
        method: 'uncertainty.cleanup-probabilistic',
        protected: 50,
        chosen: false,
        level: 2,
        unit: 'mg/L',
      },
      {
        method: 'uncertainty.cleanup-probabilistic',
        protected: 95,
        chosen: true,
        level: null,
        unit: 'mg/L',
      },
    ]);
  });

  it('builds the cleanup tables with the sample of solved levels', () => {
    const t = cleanupUncertaintyTables({
      label: 'Benzene in groundwater',
      unit: 'mg/L',
      fromSi: 1000,
      levels: [{ p: 0.95, level: 1e-3 }],
      chosen: 0.95,
      iterationLevels: [1e-3, Number.NaN, 5],
      censored: [2],
      spearman: [{ label: 'Body weight', rho: 0.2 }],
    });
    expect(t.map((x) => x.name)).toEqual([
      'cleanup-uncertainty-levels',
      'cleanup-uncertainty-sample',
      'cleanup-uncertainty-sensitivity',
    ]);
    const sample = t[1]!;
    expect(sample.rows.map((r) => r.level)).toEqual([1, null, 5000]);
    expect(sample.rows.map((r) => r.status)).toEqual(['solved', 'failed', 'censored at the cap']);
    expect(t.every((x) => x.editions?.includes('rsl'))).toBe(true);
  });
});
