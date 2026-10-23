import { compareToCriteria, type CompareResult, type Criterion } from '@model-flow/engine';
import type { CsvColumn, CsvRow } from '../export/csv';
import type { SwResult } from './compute';
import {
  criteriaFor,
  type CriteriaDb,
  type CriteriaChemical,
  type CriterionInfo,
} from './criteriaDb';

export type Method = 'legacy' | 'modern';
export type Medium = 'surfaceWater' | 'sediment';

export interface Compared {
  method: Method;
  medium: Medium;
  outcome: { ok: true; value: CompareResult } | { ok: false; error: string };
}

export interface CompareOptions {
  waterType?: 'fresh' | 'salt' | undefined;
  hardness?: number | undefined;
  foc?: number | undefined;
}

/**
 * Compares the peak of the modelled water and sediment series of both methods with every criterion of the
 * chemical in the database (the chosen set). The peak rule and the per-criterion ratios are the engine's and
 * are unchanged by the choice of set (DECISIONS M8 ruling 11). A set with no water values is not compared
 * with water, and a chemical with no sediment values is not compared with sediment.
 */
export function compareAll(
  db: CriteriaDb,
  chemical: Pick<CriteriaChemical, 'id' | 'hasSediment'>,
  result: SwResult,
  opts: CompareOptions = {},
): Compared[] {
  const out: Compared[] = [];
  const run = (method: Method, medium: Medium, series: number[] | undefined): void => {
    if (!series || series.length === 0) return;
    try {
      const value = compareToCriteria({
        medium,
        chemicalId: chemical.id,
        series,
        criteria: criteriaFor(db, chemical.id, medium),
        ...(opts.waterType !== undefined ? { waterType: opts.waterType } : {}),
        ...(opts.hardness !== undefined ? { hardness: opts.hardness } : {}),
        ...(opts.foc !== undefined ? { fractionOrganicCarbon: opts.foc } : {}),
      });
      out.push({ method, medium, outcome: { ok: true, value } });
    } catch (e) {
      out.push({
        method,
        medium,
        outcome: { ok: false, error: e instanceof Error ? e.message : String(e) },
      });
    }
  };
  for (const method of ['legacy', 'modern'] as const) {
    if (db.media.includes('surfaceWater')) run(method, 'surfaceWater', result[method].surfaceWater);
    if (chemical.hasSediment) run(method, 'sediment', result[method].sediment.concentrations);
  }
  return out;
}

const MEDIUM_NAME: Record<Medium, string> = { surfaceWater: 'surface water', sediment: 'sediment' };
const WATER_NAME = { fresh: 'freshwater', salt: 'saltwater' } as const;

/** The unit the screen and the CSV show a criterion and a peak in: ug/L for water, mg/kg for sediment. */
export const displayUnit = (medium: Medium): 'ug/L' | 'mg/kg' =>
  medium === 'surfaceWater' ? 'ug/L' : 'mg/kg';

/** SI (kg/m^3 or kg/kg) to the display unit. */
export const toDisplay = (si: number): number => si * 1e6;

/** "Set; freshwater; table" under a criterion: the set, the water type and the source table. */
export function sourceLine(info: CriterionInfo): string {
  const parts = [info.setLabel];
  if (info.waterType !== undefined) parts.push(WATER_NAME[info.waterType]);
  parts.push(info.source);
  return parts.join('; ');
}

export const CRITERIA_COLUMNS: CsvColumn[] = [
  { key: 'chemicalId', header: 'chemical id' },
  { key: 'chemical', header: 'chemical' },
  { key: 'method', header: 'method' },
  { key: 'medium', header: 'medium' },
  { key: 'set', header: 'criteria set' },
  { key: 'basis', header: 'basis' },
  { key: 'waterType', header: 'water type' },
  { key: 'criterion', header: 'criterion' },
  { key: 'source', header: 'source table' },
  { key: 'status', header: 'status' },
  { key: 'criterionValue', header: 'criterion value' },
  { key: 'peak', header: 'peak concentration' },
  { key: 'unit', header: 'concentration unit' },
  { key: 'ratio', header: 'ratio of peak to criterion' },
  { key: 'exceeds', header: 'exceeds' },
  { key: 'note', header: 'condition or note' },
];

/**
 * The comparison as CSV rows, one per criterion and method, each carrying the set, basis, medium and source
 * of the criterion. Values are in the units the screen shows (ug/L and mg/kg); a criterion that is site
 * specific or has no value is written with its status and no numbers.
 */
export function criteriaCsvRows(
  compared: readonly Compared[],
  info: ReadonlyMap<string, CriterionInfo>,
  chemical: { id: string; name: string },
): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const c of compared) {
    const methodId =
      c.method === 'legacy' ? 'surfaceWater.well-mixed' : 'surfaceWater.mass-discharge';
    if (!c.outcome.ok) {
      rows.push({
        chemicalId: chemical.id,
        chemical: chemical.name,
        method: methodId,
        medium: MEDIUM_NAME[c.medium],
        status: 'not compared',
        note: c.outcome.error,
      });
      continue;
    }
    for (const r of c.outcome.value.results) {
      const crit: Criterion | undefined = r.criterion;
      const i = crit === undefined ? undefined : info.get(crit.id);
      rows.push({
        chemicalId: chemical.id,
        chemical: chemical.name,
        method: methodId,
        medium: MEDIUM_NAME[c.medium],
        set: i?.setLabel ?? '',
        basis: i?.basis ?? '',
        waterType: i?.waterType === undefined ? '' : WATER_NAME[i.waterType],
        criterion: crit?.endpoint ?? '',
        source: i?.source ?? '',
        status: r.status,
        criterionValue:
          r.status === 'compared' && r.criterionValue !== undefined
            ? toDisplay(r.criterionValue)
            : null,
        peak:
          r.status === 'compared' && r.comparedConcentration !== undefined
            ? toDisplay(r.comparedConcentration)
            : null,
        unit: displayUnit(c.medium),
        ratio: r.ratio ?? null,
        exceeds: r.exceeds ?? null,
        note: i?.condition ?? '',
      });
    }
  }
  return rows;
}
