import { DEFAULT_HARDNESS } from '@model-flow/engine';
import type { CsvRow } from '../export/csv';
import type { SwResult } from './compute';
import {
  compareAll,
  coveredBy,
  coveredCsvRows,
  coveredText,
  criteriaCsvRows,
} from './criteriaCompare';
import { CRITERIA_SET_LABEL, type CriteriaSetChoice } from './criteriaSetChoice';
import { loadCriteriaDbFor } from './criteriaSets';

export interface ReportCriteria {
  set: CriteriaSetChoice;
  rows: CsvRow[];
  /** One line for the report: the set, the chemical, and how the comparison was made. */
  note: string;
}

/**
 * The comparison the report prints for the chemical of the run, with the criteria set saved in the project. The
 * screen compares one water type at a hardness the viewer types; the report has no such state, so it compares
 * freshwater and saltwater criteria alike and uses the default hardness (DEFAULT_HARDNESS, mg/L as CaCO3), and says so.
 * Returns null when the run has no chemical, the set has no criterion for it, or the set cannot be loaded.
 */
export async function reportCriteria(
  set: CriteriaSetChoice,
  chemicalId: string,
  result: SwResult,
  foc: number | undefined,
): Promise<ReportCriteria | null> {
  if (chemicalId === '') return null;
  let db;
  try {
    db = await loadCriteriaDbFor(set);
  } catch {
    return null;
  }
  const chemical = db.chemicals.find((c) => c.id === chemicalId);
  if (chemical === undefined) {
    // a chemical the set points to a group row: the covering row's name and value, no ratio
    const pointer = coveredBy(db, chemicalId);
    if (pointer === undefined) return null;
    const rows = coveredCsvRows(db, { id: chemicalId, name: pointer.name }, pointer);
    if (rows.length === 0) return null;
    return {
      set,
      rows,
      note: `Criteria comparison for ${pointer.name} (${chemicalId}) with ${CRITERIA_SET_LABEL[set]}: ${coveredText(pointer)}`,
    };
  }
  const compared = compareAll(db, chemical, result, foc !== undefined ? { foc } : {});
  const rows = criteriaCsvRows(compared, db.info, chemical);
  if (rows.length === 0) return null;
  return {
    set,
    rows,
    note: `Criteria comparison for ${chemical.name} (${chemical.id}) with ${CRITERIA_SET_LABEL[set]}: the peak of each series against every criterion of the set, freshwater and saltwater, at the default hardness of ${DEFAULT_HARDNESS} mg/L as CaCO3. Each row names its basis, medium and source table.`,
  };
}
