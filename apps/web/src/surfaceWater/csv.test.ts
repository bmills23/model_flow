import { describe, expect, it } from 'vitest';
import { exportCsv } from '../export/csv';
import type { SwResult } from './compute';
import { surfaceWaterCsvTables, surfaceWaterResultRows, surfaceWaterSeriesRows } from './csv';

const YR = 365.25 * 86400;
const result: SwResult = {
  times: [YR, 2 * YR],
  linked: false,
  reachLength: 100,
  legacy: {
    groundwaterConcentrations: [0.005, 0.005],
    surfaceWater: [0.001, 0.0029],
    groundwaterFlow: 0.5,
    sediment: { quantified: true, concentrations: [1e-6, 2.95e-6], poreWater: 'x' },
    warnings: [],
  },
  modern: {
    surfaceWater: [0.002, 0.0031],
    fluxAveraged: [0.004, 0.004],
    groundwaterFlow: 0.5,
    residenceTime: 86400,
    downstream: [0.0005, 0.0006],
    sediment: { quantified: false, poreWater: 'y' },
    warnings: [],
  },
};

describe('surface water CSV', () => {
  it('writes the end of run per method in mg/L, mg/kg and days', () => {
    const [l, m] = surfaceWaterResultRows(result);
    expect(l!.method).toBe('surfaceWater.well-mixed');
    expect(l!.time).toBe(2);
    expect(l!.surfaceWater).toBe(0.0029 * 1e3);
    expect(l!.sediment).toBe(2.95e-6 * 1e6);
    expect(l!.groundwaterFlow).toBe(0.5 * 86400);
    expect(m!.method).toBe('surfaceWater.mass-discharge');
    expect(m!.residence).toBe(1);
    expect(m!.downstream).toBe(0.0006 * 1e3);
    expect(m!.sediment).toBeNull();
  });
  it('writes every time for both methods, leaving unquantified cells empty', () => {
    const rows = surfaceWaterSeriesRows(result);
    expect(rows).toHaveLength(4);
    expect(rows[2]!.method).toBe('surfaceWater.mass-discharge');
    const t = surfaceWaterCsvTables(result)[1]!;
    const lines = exportCsv(t.rows, t.columns).trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'method,time (yr),groundwater concentration (mg/L),surface water concentration (mg/L),downstream concentration (mg/L),sediment concentration (mg/kg),sediment organic carbon normalized (mg/kg)',
    );
    expect(lines[3]).toBe('surfaceWater.mass-discharge,1,4,2,0.5,,');
  });
});

describe('surface water CSV: the criteria comparison', () => {
  const rows = [
    {
      chemicalId: '71-43-2',
      chemical: 'Benzene',
      method: 'surfaceWater.well-mixed',
      medium: 'surface water',
      set: 'Canada (CCME)',
      basis: 'long-term exposure guideline',
      waterType: 'freshwater',
      criterion: 'ccme-fresh-long-term',
      source: 'CCME summary table, aquatic life columns',
      status: 'compared',
      criterionValue: 370,
      peak: 2907,
      unit: 'ug/L',
      ratio: 7.86,
      exceeds: true,
      note: '',
    },
  ];

  it('is a table of its own, only once a comparison has been made', () => {
    expect(surfaceWaterCsvTables(result).map((t) => t.name)).toEqual([
      'surface-water-results',
      'surface-water-time-series',
    ]);
    expect(surfaceWaterCsvTables(result, { set: 'ccme', rows: [] })).toHaveLength(2);
    const t = surfaceWaterCsvTables(result, { set: 'ccme', rows })[2]!;
    expect(t.name).toBe('surface-water-criteria-ccme');
    expect(t.editions).toEqual(['criteria']);
  });

  it('carries the set, basis, medium, water type and source of each criterion', () => {
    const t = surfaceWaterCsvTables(result, { set: 'ccme', rows })[2]!;
    const lines = exportCsv(t.rows, t.columns).trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'chemical id,chemical,method,medium,criteria set,basis,water type,criterion,source table,status,criterion value,peak concentration,concentration unit,ratio of peak to criterion,exceeds,condition or note',
    );
    expect(lines[1]).toBe(
      '71-43-2,Benzene,surfaceWater.well-mixed,surface water,Canada (CCME),long-term exposure guideline,freshwater,ccme-fresh-long-term,"CCME summary table, aquatic life columns",compared,370,2907,ug/L,7.86,true,',
    );
  });

  it('names the editions of the data it reads: the US pair, the international sets, or both', () => {
    const edition = (set: 'us' | 'all' | 'uk') =>
      surfaceWaterCsvTables(result, { set, rows })[2]!.editions;
    expect(edition('us')).toEqual(['nrwqc', 'sediment']);
    expect(edition('uk')).toEqual(['criteria']);
    expect(edition('all')).toEqual(['nrwqc', 'sediment', 'criteria']);
  });
});
