import { cloneData } from './merge';

/** The project format version this build writes and reads. */
export const CURRENT_VERSION = 1;

export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * `migrations[n]` turns a version n document into a version n + 1 document. Pure functions, applied
 * in order on load. A form field rename or a unit change adds an entry and bumps CURRENT_VERSION;
 * adding an optional field does not. Each entry needs a fixture test (a saved version n file that
 * loads to the expected version n + 1 document). Version 1 is the first format, so the table is empty.
 */
export const migrations: Record<number, Migration> = {};

/** Apply the steps from the document's own version up to `target`, on a copy. */
export function migrate(
  doc: Record<string, unknown>,
  target: number,
  table: Record<number, Migration> = migrations,
): Record<string, unknown> {
  let current = cloneData(doc);
  let version = Number(current['version']);
  while (version < target) {
    const step = table[version];
    if (!step) throw new Error(`no migration from version ${version}`);
    current = step(current);
    version += 1;
  }
  return current;
}
