import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import type { HouseholdOutcome, Section } from './compute';
import { PARTICULATE_ORIGIN, SHOWER_ORIGIN, SPRINKLER_ORIGIN } from './form';

export const RESULT_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'quantity', header: 'quantity' },
  { key: 'value', header: 'value' },
  { key: 'unit', header: 'unit' },
];

const MGM3 = 1e6; // mg/m3 per kg/m3
const MGL = 1e3; // mg/L per kg/m3

/**
 * The household results in long format, one row per quantity of each method that computed. The
 * screen's computations are in SI; values are converted to the units the screen shows. A method that
 * needs inputs has no rows.
 */
export function householdResultRows(out: HouseholdOutcome): CsvRow[] {
  const rows: CsvRow[] = [];
  const add = (method: string, quantity: string, value: number, unit: string): void => {
    rows.push({ method, quantity, value, unit });
  };
  const ok = <T extends object>(s: Section<T>): T | null => (s.ok ? s : null);

  for (const key of ['legacy', 'little', 'rsl'] as const) {
    const s = ok(out.shower[key]);
    if (!s) continue;
    const id = SHOWER_ORIGIN[key];
    add(id, 'exposure-average air', s.concentration * MGM3, 'mg/m3');
    add(id, 'air per unit water concentration', s.coefficient, '-');
    if ('endConcentration' in s) {
      add(id, 'air at the end of the shower', (s.endConcentration as number) * MGM3, 'mg/m3');
    }
  }

  const irr = ok(out.irrigation);
  if (irr) {
    add(SPRINKLER_ORIGIN, 'incidental ingestion water', irr.ingestion * MGL, 'mg/L');
    add(SPRINKLER_ORIGIN, 'dermal contact water', irr.dermal * MGL, 'mg/L');
    add(SPRINKLER_ORIGIN, 'spray inhalation air', irr.sprayAir * MGM3, 'mg/m3');
    add(SPRINKLER_ORIGIN, 'air per unit water concentration', irr.sprayCoefficient, '-');
  }

  for (const key of ['box', 'pef1996', 'pef2002'] as const) {
    const s = ok(out.particulate[key]);
    if (!s) continue;
    const id = PARTICULATE_ORIGIN[key];
    add(id, 'outdoor air', s.concentration * MGM3, 'mg/m3');
    add(id, 'air per unit soil concentration', s.coefficient, '(kg/m3)/(kg/kg)');
    add(id, 'particulate flux', s.flux * 1000, 'g/(m2 s)');
    if (s.pef !== undefined) add(id, 'particulate emission factor', s.pef, 'm3/kg');
  }
  return rows;
}

export function householdCsvTables(out: HouseholdOutcome): CsvTable[] {
  const rows = householdResultRows(out);
  if (rows.length === 0) return [];
  return [{ name: 'household-results', label: 'results', rows, columns: RESULT_COLUMNS }];
}
