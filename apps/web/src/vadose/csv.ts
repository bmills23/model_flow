import { convert } from '@model-flow/engine';
import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import type { RunSummary, VadoseComputeResult, VadoseMethod } from './compute';
import { fluxGPerM2Day, massRateKgPerDay } from './chartData';

/** Registered method ids for the two vadose methods. */
export const VADOSE_METHOD_IDS: Record<VadoseMethod, string> = {
  legacy: 'vadose.vadsat',
  modern: 'vadose.layered',
};

const METHODS: readonly VadoseMethod[] = ['legacy', 'modern'];
const MG_PER_L = 1e3;

const RESULT_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'solution', header: 'transport solution' },
  { key: 'infiltration', header: 'infiltration', unit: 'm/yr' },
  { key: 'clamped', header: 'infiltration reduced to smallest Ks' },
  { key: 'separatePhase', header: 'separate phase' },
  { key: 'poreWater0', header: 'source pore water at start', unit: 'mg/L' },
  { key: 'gamma', header: 'source depletion rate', unit: '1/yr' },
  { key: 'leachedShare', header: 'share of source loss that leaches', unit: 'fraction' },
  { key: 'dispersivity', header: 'dispersivity at the water table', unit: 'm' },
  { key: 'waterTableEnd', header: 'water table concentration at the end', unit: 'mg/L' },
  { key: 'massInitial', header: 'initial mass', unit: 'kg' },
  { key: 'massSource', header: 'remaining in source', unit: 'kg' },
  { key: 'massVolatilized', header: 'volatilized', unit: 'kg' },
  { key: 'massDecayed', header: 'decayed in source', unit: 'kg' },
  { key: 'massLeached', header: 'leached', unit: 'kg' },
  { key: 'massInProfile', header: 'in the profile', unit: 'kg' },
  { key: 'massTransitLoss', header: 'lost in transit', unit: 'kg' },
  { key: 'massDelivered', header: 'delivered to the water table', unit: 'kg' },
  { key: 'closure', header: 'mass closure error', unit: 'fraction' },
];

const SERIES_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'time', header: 'time', unit: 'yr' },
  { key: 'waterTable', header: 'water table concentration', unit: 'mg/L' },
  { key: 'flux', header: 'water table flux', unit: 'g/m2/d' },
  { key: 'massRate', header: 'mass rate to groundwater', unit: 'kg/d' },
  { key: 'poreWater', header: 'source pore water concentration', unit: 'mg/L' },
  { key: 'sourceMass', header: 'mass in source', unit: 'kg' },
  { key: 'leached', header: 'cumulative leached', unit: 'kg' },
  { key: 'volatilized', header: 'cumulative volatilized', unit: 'kg' },
  { key: 'decayed', header: 'cumulative decayed in source', unit: 'kg' },
  { key: 'delivered', header: 'cumulative delivered', unit: 'kg' },
];

function resultRow(m: VadoseMethod, r: RunSummary): CsvRow {
  const wt = r.series.waterTable;
  const b = r.budget;
  return {
    method: VADOSE_METHOD_IDS[m],
    solution: r.evaluation,
    infiltration: convert(r.q, 'm/s', 'm/yr'),
    clamped: r.clamped,
    separatePhase: r.partition.residual,
    poreWater0: r.series.sourcePoreWater[0]! * MG_PER_L,
    gamma: r.gamma * convert(1, 'yr', 's'),
    leachedShare: r.leachedShare,
    dispersivity: r.dispersivity,
    waterTableEnd: wt.length > 0 ? wt[wt.length - 1]! * MG_PER_L : null,
    massInitial: b.initial,
    massSource: b.source,
    massVolatilized: b.volatilized,
    massDecayed: b.sourceDecayed,
    massLeached: b.leached,
    massInProfile: b.inProfile,
    massTransitLoss: b.transitLoss,
    massDelivered: b.delivered,
    closure: b.closure,
  };
}

export function vadoseResultRows(result: VadoseComputeResult): CsvRow[] {
  return METHODS.flatMap((m) => {
    const r = result.runs[m];
    return r ? [resultRow(m, r)] : [];
  });
}

export function vadoseSeriesRows(result: VadoseComputeResult): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const m of METHODS) {
    const r = result.runs[m];
    if (!r) continue;
    const s = r.series;
    s.times.forEach((t, i) => {
      rows.push({
        method: VADOSE_METHOD_IDS[m],
        time: convert(t, 's', 'yr'),
        waterTable: s.waterTable[i]! * MG_PER_L,
        flux: fluxGPerM2Day(s.flux[i]!),
        massRate: massRateKgPerDay(s.massRate[i]!),
        poreWater: s.sourcePoreWater[i]! * MG_PER_L,
        sourceMass: s.sourceMass[i],
        leached: s.leached[i],
        volatilized: s.volatilized[i],
        decayed: s.sourceDecayed[i],
        delivered: s.delivered[i],
      });
    });
  }
  return rows;
}

export function vadoseCsvTables(result: VadoseComputeResult): CsvTable[] {
  return [
    {
      name: 'vadose-results',
      label: 'results',
      rows: vadoseResultRows(result),
      columns: RESULT_COLUMNS,
    },
    {
      name: 'vadose-time-series',
      label: 'time series',
      rows: vadoseSeriesRows(result),
      columns: SERIES_COLUMNS,
    },
  ];
}
