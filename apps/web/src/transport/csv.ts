import { convert } from '@model-flow/engine';
import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import type { ComputeResult, MethodKey } from './compute';

/** Registered method ids for the three transport methods. */
export const TRANSPORT_METHOD_IDS: Record<MethodKey, string> = {
  legacy: 'groundwater.at123d',
  modern: 'groundwater.wexler1992',
  domenico: 'groundwater.domenico1987',
};

const KEYS: readonly MethodKey[] = ['legacy', 'modern', 'domenico'];
/** kg/m3 to mg/L. */
const MG_PER_L = 1e3;

const RESULT_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'time', header: 'evaluation time', unit: 'yr' },
  { key: 'concentration', header: 'concentration', unit: 'mg/L' },
];

const SERIES_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'time', header: 'time', unit: 'yr' },
  { key: 'concentration', header: 'concentration', unit: 'mg/L' },
];

/** Receptor concentration at the evaluation time, one row per method shown. */
export function transportResultRows(result: ComputeResult, timeYr: number): CsvRow[] {
  return KEYS.filter((k) => result.readouts[k] !== undefined).map((k) => ({
    method: TRANSPORT_METHOD_IDS[k],
    time: timeYr,
    concentration: result.readouts[k]! * MG_PER_L,
  }));
}

/** Breakthrough curve at the receptor, long format: one row per method and time. */
export function transportSeriesRows(result: ComputeResult): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const k of KEYS) {
    const values = result.series[k];
    if (!values) continue;
    result.times.forEach((t, i) => {
      rows.push({
        method: TRANSPORT_METHOD_IDS[k],
        time: convert(t, 's', 'yr'),
        concentration: values[i]! * MG_PER_L,
      });
    });
  }
  return rows;
}

export function transportCsvTables(result: ComputeResult, timeYr: number): CsvTable[] {
  return [
    {
      name: 'transport-results',
      label: 'results',
      rows: transportResultRows(result, timeYr),
      columns: RESULT_COLUMNS,
    },
    {
      name: 'transport-breakthrough',
      label: 'breakthrough curve',
      rows: transportSeriesRows(result),
      columns: SERIES_COLUMNS,
    },
  ];
}
