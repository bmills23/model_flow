import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import { ECO_LEGACY_ID, ECO_MODERN_ID, type BenchmarkHqRow, type EcosslResult } from './eco';
import type { Section } from './form';
import { WILDLIFE_GROUP_LABELS, type WildlifeResult } from './wildlife';
import type { ProduceRow } from './produce';
import type { TphResult } from './tph';

export interface PlantsEcoOutcome {
  produce: Section<{ row: ProduceRow }>;
  ecossl: Section<{ result: EcosslResult }>;
  benchmarks: Section<{ rows: BenchmarkHqRow[] }>;
  tph: Section<{ result: TphResult }>;
  wildlife?: Section<WildlifeResult>;
}

const PRODUCE_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'produceClass', header: 'produce class' },
  { key: 'factor', header: 'plant factor', unit: 'kg/kg per kg/kg' },
  { key: 'plant', header: 'fresh weight plant concentration', unit: 'mg/kg' },
];

const ECO_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'receptor', header: 'receptor' },
  { key: 'status', header: 'status' },
  { key: 'benchmark', header: 'benchmark', unit: 'mg/kg dry weight' },
  { key: 'hq', header: 'hazard quotient', unit: '-' },
  { key: 'citation', header: 'citation' },
];

const WILDLIFE_COLUMNS: CsvColumn[] = [
  { key: 'group', header: 'receptor group' },
  { key: 'surrogate', header: 'surrogate' },
  { key: 'source', header: 'source' },
  { key: 'dose', header: 'dose', unit: 'mg/kg body weight/day' },
  { key: 'trv', header: 'toxicity reference value', unit: 'mg/kg body weight/day' },
  { key: 'hq', header: 'hazard quotient', unit: '-' },
  { key: 'backCalc', header: 'soil level for a hazard quotient of one', unit: 'mg/kg dry weight' },
  { key: 'printed', header: 'printed Eco-SSL', unit: 'mg/kg dry weight' },
];

const TPH_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'quantity', header: 'quantity' },
  { key: 'item', header: 'fraction' },
  { key: 'value', header: 'value' },
  { key: 'unit', header: 'unit' },
];

export function produceCsvRows(s: PlantsEcoOutcome['produce']): CsvRow[] {
  if (!s.ok) return [];
  return s.row.classes.map((c) => ({
    method: s.row.methodId,
    produceClass: c.label,
    factor: c.factor,
    plant: c.plantMgPerKg,
  }));
}

/** Eco-SSL rows (status NA and NC kept, with a blank value) followed by the user benchmark rows. */
export function ecoCsvRows(
  ecossl: PlantsEcoOutcome['ecossl'],
  benchmarks: PlantsEcoOutcome['benchmarks'],
): CsvRow[] {
  const rows: CsvRow[] = [];
  if (ecossl.ok) {
    for (const r of ecossl.result.rows) {
      rows.push({
        method: ECO_MODERN_ID,
        receptor: r.label,
        status: r.status,
        benchmark: r.sslMgPerKg,
        hq: r.hq,
      });
    }
  }
  if (benchmarks.ok) {
    for (const r of benchmarks.rows) {
      rows.push({
        method: ECO_LEGACY_ID,
        receptor: r.receptor,
        status: 'user benchmark',
        benchmark: r.valueMgPerKg,
        hq: r.hq,
        citation: r.citation,
      });
    }
  }
  return rows;
}

/** Site-specific wildlife dose rows: screening values, not cleanup levels. */
export function wildlifeCsvRows(s: PlantsEcoOutcome['wildlife']): CsvRow[] {
  if (!s || !s.ok) return [];
  return s.rows.map((r) => ({
    group: WILDLIFE_GROUP_LABELS[r.group],
    surrogate: r.label,
    source: r.source,
    dose: r.doseMgPerKgD,
    trv: r.trvMgPerKgD,
    hq: r.hq,
    backCalc: r.backCalcMgPerKg,
    printed: r.printedMgPerKg,
  }));
}

export function tphCsvRows(s: PlantsEcoOutcome['tph']): CsvRow[] {
  if (!s.ok) return [];
  const r = s.result;
  const rows: CsvRow[] = [];
  const add = (quantity: string, value: number, unit: string, item?: string): void => {
    rows.push({ method: r.methodId, quantity, item, value, unit });
  };
  if (r.totalMgPerKg !== null) {
    add('total TPH level for the target hazard index', r.totalMgPerKg, 'mg/kg');
  }
  for (const f of r.fractions) {
    if (f.levelMgPerKg !== undefined) {
      add('level for a hazard quotient of one', f.levelMgPerKg, 'mg/kg', f.label);
    }
  }
  if (r.forward) {
    add('hazard index of the entered composition', r.forward.hazardIndex, '-');
    for (const b of r.forward.byFraction) {
      add('soil concentration of the fraction', b.soilMgPerKg, 'mg/kg', b.label);
      add('hazard quotient', b.hazardQuotient, '-', b.label);
    }
  }
  if (r.saturation && 'index' in r.saturation) {
    add('saturation index', r.saturation.index, '-');
    for (const p of r.saturation.perFraction) {
      add('pure-phase limit of the fraction', p.limitMgPerKg, 'mg/kg', p.label);
    }
  }
  return rows;
}

export function plantsEcoCsvTables(o: PlantsEcoOutcome): CsvTable[] {
  const tables: CsvTable[] = [
    {
      name: 'plants-produce',
      label: 'plant factors',
      editions: ['rsl'],
      rows: produceCsvRows(o.produce),
      columns: PRODUCE_COLUMNS,
    },
    {
      name: 'eco-screening',
      label: 'ecological screening',
      rows: ecoCsvRows(o.ecossl, o.benchmarks),
      columns: ECO_COLUMNS,
    },
    {
      name: 'wildlife-dose',
      label: 'wildlife dose',
      rows: wildlifeCsvRows(o.wildlife),
      columns: WILDLIFE_COLUMNS,
    },
    {
      name: 'tph-results',
      label: 'TPH',
      editions: ['rsl'],
      rows: tphCsvRows(o.tph),
      columns: TPH_COLUMNS,
    },
  ];
  return tables.filter((t) => t.rows.length > 0);
}
