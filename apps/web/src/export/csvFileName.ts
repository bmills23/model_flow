import pkg from '../../package.json';
import { CURRENT_EDITIONS } from '../report/methodsRun';
import type { CsvTable } from './DownloadCsv';

/**
 * The file name: table, app version, data edition of each dataset the table reads, and the date. The
 * file itself carries no metadata rows, so the name is what ties a saved CSV to a build and an edition.
 */
export function csvFileName(t: CsvTable, now: Date = new Date()): string {
  const editions = (t.editions ?? []).map((k) => CURRENT_EDITIONS[k]);
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return [t.name, `v${pkg.version}`, ...editions, date].join('-') + '.csv';
}
