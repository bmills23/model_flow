import type { SampleSummary } from '@model-flow/engine';
import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import { summaryRows, type SobolRow, type TornadoRow } from './resultsData';

/**
 * CSV tables of an uncertainty run (the exposure panel and the probabilistic cleanup panel). A run is
 * reproduced from the saved setup and seed, so the tables hold what the screen shows: the summary, the
 * sensitivity measures and the sample behind the charts, at full precision.
 */

export const SUMMARY_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'output', header: 'output' },
  { key: 'statistic', header: 'statistic' },
  { key: 'value', header: 'value' },
  { key: 'unit', header: 'unit' },
];

export const SAMPLE_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'iteration', header: 'iteration' },
  { key: 'output', header: 'output' },
  { key: 'value', header: 'value' },
  { key: 'unit', header: 'unit' },
];

export const SENSITIVITY_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'measure', header: 'measure' },
  { key: 'input', header: 'input' },
  { key: 'inputValue', header: 'input value at the swing (input unit)' },
  { key: 'value', header: 'value' },
  { key: 'lower', header: 'lower bound' },
  { key: 'upper', header: 'upper bound' },
];

export function summaryCsvRows(
  method: string,
  output: string,
  unit: string,
  s: SampleSummary,
): CsvRow[] {
  return summaryRows(s).map((r) => ({
    method,
    output,
    statistic: r.label,
    value: r.value,
    unit,
  }));
}

export function sampleRows(
  method: string,
  output: string,
  unit: string,
  values: readonly number[],
): CsvRow[] {
  return values.map((value, i) => ({ method, iteration: i + 1, output, value, unit }));
}

const SOBOL_ID = 'uncertainty.sobol-saltelli';

export function sensitivityRows(d: {
  method: string;
  tornado: readonly TornadoRow[];
  spearman: readonly { label: string; rho: number }[];
  sobol: readonly SobolRow[] | null;
}): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const t of d.tornado) {
    if (!t.ok) continue;
    rows.push({
      method: d.method,
      measure: 'one-at-a-time low',
      input: t.label,
      inputValue: t.lowInput,
      value: t.low,
    });
    rows.push({
      method: d.method,
      measure: 'one-at-a-time high',
      input: t.label,
      inputValue: t.highInput,
      value: t.high,
    });
  }
  for (const r of d.spearman) {
    rows.push({
      method: d.method,
      measure: 'Spearman rank correlation',
      input: r.label,
      value: r.rho,
    });
  }
  for (const s of d.sobol ?? []) {
    rows.push({
      method: SOBOL_ID,
      measure: 'Sobol first order',
      input: s.label,
      value: s.first,
      lower: s.firstInterval[0],
      upper: s.firstInterval[1],
    });
    rows.push({
      method: SOBOL_ID,
      measure: 'Sobol total',
      input: s.label,
      value: s.total,
      lower: s.totalInterval[0],
      upper: s.totalInterval[1],
    });
  }
  return rows;
}

export interface ExposureRunCsv {
  method: string;
  outputLabel: string;
  unit: string;
  summary: SampleSummary | null;
  values: readonly number[];
  tornado: readonly TornadoRow[];
  spearman: readonly { label: string; rho: number }[];
  sobol: readonly SobolRow[] | null;
}

/** The exposure panel's tables; a table with no rows is left out. */
export function exposureUncertaintyTables(
  d: ExposureRunCsv,
  editions: CsvTable['editions'] = [],
): CsvTable[] {
  const tables: CsvTable[] = [
    {
      name: 'uncertainty-summary',
      label: 'summary',
      editions,
      rows: d.summary ? summaryCsvRows(d.method, d.outputLabel, d.unit, d.summary) : [],
      columns: SUMMARY_COLUMNS,
    },
    {
      name: 'uncertainty-sample',
      label: 'sample',
      editions,
      rows: sampleRows(d.method, d.outputLabel, d.unit, d.values),
      columns: SAMPLE_COLUMNS,
    },
    {
      name: 'uncertainty-sensitivity',
      label: 'sensitivity',
      editions,
      rows: sensitivityRows(d),
      columns: SENSITIVITY_COLUMNS,
    },
  ];
  return tables.filter((t) => t.rows.length > 0);
}

const CLEANUP_ID = 'uncertainty.cleanup-probabilistic';

const LEVEL_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'protected', header: 'fraction of the sampled population protected', unit: 'percent' },
  { key: 'chosen', header: 'chosen' },
  { key: 'level', header: 'cleanup level' },
  { key: 'unit', header: 'unit' },
];

const CLEANUP_SAMPLE_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'iteration', header: 'iteration' },
  { key: 'status', header: 'status' },
  { key: 'level', header: 'cleanup level' },
  { key: 'unit', header: 'unit' },
];

/** `fromSi` multiplies a level in SI into the screen unit. A level that cannot be reached is blank. */
export function cleanupLevelRows(
  levels: readonly { p: number; level: number | null }[],
  chosen: number,
  unit: string,
  fromSi: number,
): CsvRow[] {
  return levels.map((l) => ({
    method: CLEANUP_ID,
    protected: Number((l.p * 100).toFixed(4)),
    chosen: l.p === chosen,
    level: l.level === null ? null : l.level * fromSi,
    unit,
  }));
}

export interface CleanupRunCsv {
  label: string;
  unit: string;
  fromSi: number;
  levels: readonly { p: number; level: number | null }[];
  chosen: number;
  iterationLevels: readonly number[];
  censored: readonly number[];
  spearman: readonly { label: string; rho: number }[];
}

export function cleanupUncertaintyTables(d: CleanupRunCsv): CsvTable[] {
  const censored = new Set(d.censored);
  const sample: CsvRow[] = d.iterationLevels.map((v, i) => {
    const failed = Number.isNaN(v);
    return {
      method: CLEANUP_ID,
      iteration: i + 1,
      status: failed ? 'failed' : censored.has(i) ? 'censored at the cap' : 'solved',
      level: failed ? null : v * d.fromSi,
      unit: d.unit,
    };
  });
  const tables: CsvTable[] = [
    {
      name: 'cleanup-uncertainty-levels',
      label: 'protective levels',
      editions: ['rsl'],
      rows: cleanupLevelRows(d.levels, d.chosen, d.unit, d.fromSi),
      columns: LEVEL_COLUMNS,
    },
    {
      name: 'cleanup-uncertainty-sample',
      label: 'sample',
      editions: ['rsl'],
      rows: sample,
      columns: CLEANUP_SAMPLE_COLUMNS,
    },
    {
      name: 'cleanup-uncertainty-sensitivity',
      label: 'sensitivity',
      editions: ['rsl'],
      rows: sensitivityRows({
        method: CLEANUP_ID,
        tornado: [],
        spearman: d.spearman,
        sobol: null,
      }),
      columns: SENSITIVITY_COLUMNS,
    },
  ];
  return tables.filter((t) => t.rows.length > 0);
}
