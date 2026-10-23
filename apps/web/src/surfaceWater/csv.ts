import { convert } from '@model-flow/engine';
import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import type { SwResult } from './compute';
import { CRITERIA_COLUMNS } from './criteriaCompare';
import type { CriteriaSetChoice } from './criteriaSetChoice';

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

/** The data editions a criteria comparison reads, for the file name: the US pair, the international sets, or both. */
export function criteriaEditions(set: CriteriaSetChoice): NonNullable<CsvTable['editions']> {
  if (set === 'us') return ['nrwqc', 'sediment'];
  if (set === 'all') return ['nrwqc', 'sediment', 'criteria'];
  return ['criteria'];
}

/**
 * The CSV tables of the screen. When a comparison with criteria has been made, its rows (each with the set,
 * basis, medium and source of the criterion) are a table of their own.
 */
export function surfaceWaterCsvTables(
  r: SwResult,
  criteria?: { set: CriteriaSetChoice; rows: readonly CsvRow[] },
): CsvTable[] {
  const tables: CsvTable[] = [
    {
      name: 'surface-water-results',
      editions: ['nrwqc', 'sediment'],
      label: 'results',
      rows: surfaceWaterResultRows(r),
      columns: RESULT_COLUMNS,
    },
    {
      name: 'surface-water-time-series',
      editions: ['nrwqc', 'sediment'],
      label: 'time series',
      rows: surfaceWaterSeriesRows(r),
      columns: SERIES_COLUMNS,
    },
  ];
  if (criteria !== undefined && criteria.rows.length > 0) {
    tables.push({
      name: `surface-water-criteria-${criteria.set}`,
      editions: criteriaEditions(criteria.set),
      label: 'criteria comparison',
      rows: criteria.rows,
      columns: CRITERIA_COLUMNS,
    });
  }
  return tables;
}
