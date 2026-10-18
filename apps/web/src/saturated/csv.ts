import { convert } from '@model-flow/engine';
import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import type { SaturatedComputeResult } from './compute';
import type { SaturatedMethod } from './feed';

const METHODS: readonly SaturatedMethod[] = ['legacy', 'modern'];
const DAY = 86400;

const RESULT_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'schedule', header: 'schedule' },
  { key: 'initialMass', header: 'initial mass', unit: 'kg' },
  { key: 'lowQ1', header: 'region 1 rate at low water', unit: 'kg/d' },
  { key: 'lowQ2', header: 'region 2 rate at low water', unit: 'kg/d' },
  { key: 'highQ1', header: 'region 1 rate at high water', unit: 'kg/d' },
  { key: 'highQ2', header: 'region 2 rate at high water', unit: 'kg/d' },
  { key: 'meanRate', header: 'annual mean rate', unit: 'kg/d' },
  { key: 'depletion', header: 'source exhausted at', unit: 'yr' },
  { key: 'gamma', header: 'decline constant', unit: '1/yr' },
  { key: 'delivered', header: 'delivered by the horizon', unit: 'kg' },
  { key: 'remaining', header: 'left in the source at the horizon', unit: 'kg' },
  { key: 'decayed', header: 'lost to source decay', unit: 'kg' },
];

const SERIES_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'time', header: 'time', unit: 'yr' },
  { key: 'rate', header: 'release rate', unit: 'kg/d' },
  { key: 'remaining', header: 'mass left in the source', unit: 'kg' },
];

export function saturatedResultRows(result: SaturatedComputeResult): CsvRow[] {
  return METHODS.flatMap((m) => {
    const r = result.runs[m];
    if (!r) return [];
    const yr = convert(1, 'yr', 's');
    return [
      {
        method: r.methodId,
        schedule: r.seasonal ? 'seasonal' : 'annual mean',
        initialMass: r.initialMass,
        lowQ1: r.rates.low.q1 * DAY,
        lowQ2: r.rates.low.q2 * DAY,
        highQ1: r.rates.high.q1 * DAY,
        highQ2: r.rates.high.q2 * DAY,
        meanRate: r.rates.mean * DAY,
        depletion: Number.isFinite(r.depletionTime) ? r.depletionTime / yr : null,
        gamma: r.gamma === undefined ? null : r.gamma * yr,
        delivered: r.budget.delivered,
        remaining: r.budget.remaining,
        decayed: r.budget.decayed,
      },
    ];
  });
}

export function saturatedSeriesRows(result: SaturatedComputeResult): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const m of METHODS) {
    const run = result.runs[m];
    const rate = result.curves.rate[m];
    const remaining = result.curves.remaining[m];
    if (!run || !rate || !remaining) continue;
    result.curves.timesYr.forEach((t, i) => {
      rows.push({ method: run.methodId, time: t, rate: rate[i], remaining: remaining[i] });
    });
  }
  return rows;
}

export function saturatedCsvTables(result: SaturatedComputeResult): CsvTable[] {
  return [
    {
      name: 'saturated-results',
      label: 'results',
      rows: saturatedResultRows(result),
      columns: RESULT_COLUMNS,
    },
    {
      name: 'saturated-time-series',
      label: 'time series',
      rows: saturatedSeriesRows(result),
      columns: SERIES_COLUMNS,
    },
  ];
}
