import { convert } from '@model-flow/engine';
import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import type { VaporOutcome } from './compute';
import { INDOOR_ORIGIN, OUTDOOR_ORIGIN, type MethodKey, type VaporEpcs } from './series';

const MGM3 = 1e-6; // kg/m3 per mg/m3
const METHODS: readonly MethodKey[] = ['legacy', 'modern'];

const RESULT_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'indoor', header: 'indoor air concentration', unit: 'mg/m3' },
  { key: 'alpha', header: 'attenuation coefficient', unit: '-' },
  { key: 'sourceVapor', header: 'source vapor concentration', unit: 'mg/m3' },
  { key: 'LT', header: 'source to building distance', unit: 'm' },
  { key: 'DT', header: 'effective diffusion through the soil', unit: 'cm2/s' },
  { key: 'QB', header: 'building ventilation', unit: 'L/s' },
  { key: 'Qsoil', header: 'soil gas entry', unit: 'L/min' },
  { key: 'xi', header: 'Peclet number', unit: '-' },
  { key: 'entryRate', header: 'entry rate', unit: 'mg/s' },
];

const SERIES_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'medium', header: 'medium' },
  { key: 'time', header: 'time', unit: 'yr' },
  { key: 'concentration', header: 'concentration', unit: 'mg/m3' },
];

export function vaporResultRows(out: VaporOutcome): CsvRow[] {
  return METHODS.flatMap((m) => {
    const o = out[m];
    if (!o.ok) return [];
    const r = o.result;
    return [
      {
        method: INDOOR_ORIGIN[m],
        indoor: r.concentration / MGM3,
        alpha: r.alpha,
        sourceVapor: r.sourceVapor / MGM3,
        LT: r.LT,
        DT: r.DT * 1e4,
        QB: r.QB * 1e3,
        Qsoil: r.Qsoil * 6e4,
        xi: r.xi,
        entryRate: r.entryRate * 1e6,
      },
    ];
  });
}

/** Indoor and outdoor air against time for a source offered by another screen; one value gives one row each. */
export function vaporSeriesRows(epcs: VaporEpcs): CsvRow[] {
  const rows: CsvRow[] = [];
  const add = (method: string, medium: string, e: VaporEpcs['indoor'][MethodKey]): void => {
    if (!e) return;
    if (e.kind === 'constant') {
      rows.push({ method, medium, time: null, concentration: e.value / MGM3 });
      return;
    }
    e.series.times.forEach((t, i) => {
      rows.push({
        method,
        medium,
        time: convert(t, 's', 'yr'),
        concentration: e.series.values[i]! / MGM3,
      });
    });
  };
  for (const m of METHODS) add(INDOOR_ORIGIN[m], 'indoor air', epcs.indoor[m]);
  for (const m of METHODS) add(OUTDOOR_ORIGIN[m], 'outdoor air', epcs.outdoor[m]);
  return rows;
}

export function vaporCsvTables(out: VaporOutcome, epcs: VaporEpcs | null): CsvTable[] {
  const tables: CsvTable[] = [
    {
      name: 'vapor-results',
      label: 'results',
      rows: vaporResultRows(out),
      columns: RESULT_COLUMNS,
    },
  ];
  if (epcs) {
    tables.push({
      name: 'vapor-time-series',
      label: 'time series',
      rows: vaporSeriesRows(epcs),
      columns: SERIES_COLUMNS,
    });
  }
  return tables;
}
