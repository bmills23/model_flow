import { convert } from '@model-flow/engine';
import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import type { SwResult } from './compute';

export const LEGACY_ID = 'surfaceWater.well-mixed';
export const MODERN_ID = 'surfaceWater.mass-discharge';

const MG_PER_L = 1e3;
const MG_PER_KG = 1e6;
const DAY = 86400;

const RESULT_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'time', header: 'end of run', unit: 'yr' },
  { key: 'surfaceWater', header: 'surface water concentration', unit: 'mg/L' },
  { key: 'downstream', header: 'downstream concentration', unit: 'mg/L' },
  { key: 'sediment', header: 'sediment concentration', unit: 'mg/kg' },
  { key: 'sedimentOc', header: 'sediment organic carbon normalized', unit: 'mg/kg' },
  { key: 'groundwater', header: 'groundwater concentration', unit: 'mg/L' },
  { key: 'groundwaterFlow', header: 'groundwater flow', unit: 'm3/d' },
  { key: 'reach', header: 'reach length', unit: 'm' },
  { key: 'residence', header: 'residence time of the mixing zone', unit: 'd' },
  { key: 'linked', header: 'groundwater linked from the transport run' },
];

const SERIES_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'time', header: 'time', unit: 'yr' },
  { key: 'groundwater', header: 'groundwater concentration', unit: 'mg/L' },
  { key: 'surfaceWater', header: 'surface water concentration', unit: 'mg/L' },
  { key: 'downstream', header: 'downstream concentration', unit: 'mg/L' },
  { key: 'sediment', header: 'sediment concentration', unit: 'mg/kg' },
  { key: 'sedimentOc', header: 'sediment organic carbon normalized', unit: 'mg/kg' },
];

const scale = (v: readonly number[] | undefined, f: number, i: number): number | null =>
  v ? v[i]! * f : null;

export function surfaceWaterResultRows(r: SwResult): CsvRow[] {
  const i = r.times.length - 1;
  if (i < 0) return [];
  const time = convert(r.times[i]!, 's', 'yr');
  return [
    {
      method: LEGACY_ID,
      time,
      surfaceWater: r.legacy.surfaceWater[i]! * MG_PER_L,
      downstream: null,
      sediment: scale(r.legacy.sediment.concentrations, MG_PER_KG, i),
      sedimentOc: scale(r.legacy.sediment.organicCarbonNormalized, MG_PER_KG, i),
      groundwater: r.legacy.groundwaterConcentrations[i]! * MG_PER_L,
      groundwaterFlow: r.legacy.groundwaterFlow * DAY,
      reach: r.reachLength,
      residence: null,
      linked: r.linked,
    },
    {
      method: MODERN_ID,
      time,
      surfaceWater: r.modern.surfaceWater[i]! * MG_PER_L,
      downstream: scale(r.modern.downstream, MG_PER_L, i),
      sediment: scale(r.modern.sediment.concentrations, MG_PER_KG, i),
      sedimentOc: scale(r.modern.sediment.organicCarbonNormalized, MG_PER_KG, i),
      groundwater: r.modern.fluxAveraged[i]! * MG_PER_L,
      groundwaterFlow: r.modern.groundwaterFlow * DAY,
      reach: r.reachLength,
      residence: r.modern.residenceTime / DAY,
      linked: r.linked,
    },
  ];
}

export function surfaceWaterSeriesRows(r: SwResult): CsvRow[] {
  const rows: CsvRow[] = [];
  r.times.forEach((t, i) => {
    rows.push({
      method: LEGACY_ID,
      time: convert(t, 's', 'yr'),
      groundwater: r.legacy.groundwaterConcentrations[i]! * MG_PER_L,
      surfaceWater: r.legacy.surfaceWater[i]! * MG_PER_L,
      downstream: null,
      sediment: scale(r.legacy.sediment.concentrations, MG_PER_KG, i),
      sedimentOc: scale(r.legacy.sediment.organicCarbonNormalized, MG_PER_KG, i),
    });
  });
  r.times.forEach((t, i) => {
    rows.push({
      method: MODERN_ID,
      time: convert(t, 's', 'yr'),
      groundwater: r.modern.fluxAveraged[i]! * MG_PER_L,
      surfaceWater: r.modern.surfaceWater[i]! * MG_PER_L,
      downstream: scale(r.modern.downstream, MG_PER_L, i),
      sediment: scale(r.modern.sediment.concentrations, MG_PER_KG, i),
      sedimentOc: scale(r.modern.sediment.organicCarbonNormalized, MG_PER_KG, i),
    });
  });
  return rows;
}

export function surfaceWaterCsvTables(r: SwResult): CsvTable[] {
  return [
    {
      name: 'surface-water-results',
      label: 'results',
      rows: surfaceWaterResultRows(r),
      columns: RESULT_COLUMNS,
    },
    {
      name: 'surface-water-time-series',
      label: 'time series',
      rows: surfaceWaterSeriesRows(r),
      columns: SERIES_COLUMNS,
    },
  ];
}
