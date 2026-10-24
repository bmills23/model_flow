import { registry } from '@model-flow/engine';
import { z } from 'zod';

/**
 * The inputs a sent result ran with, recorded on the feed at the moment it is sent (wave AA scope ruling 1:
 * a report block names the chemical AND the inputs of the run that produced the sent values). Each row is
 * a label and a value with its unit, both words as the sending screen shows them. The project keeps only
 * each screen's current form, so the inputs of a run sent earlier would be lost without this copy.
 *
 * The field is optional inside the current format version: a feed saved before it existed loads without
 * it, and its report block says the inputs were not recorded. It is never part of an inputs hash, a
 * staleness mark or a sent value (see `withoutRunInputs`).
 */
export interface RunInputRow {
  label: string;
  value: string;
}

/** The key of the field on a feed. */
export const RUN_INPUTS = 'runInputs';

const rowSchema = z.object({ label: z.string(), value: z.string() });

/** Rows as the project file holds them: a malformed value is dropped (the field is absent), never a failure. */
export const runInputRowsSchema = z.array(rowSchema).optional().catch(undefined);

/** True when `v` is a list of labelled rows (label and value, both text). */
export function isRunInputRows(v: unknown): v is RunInputRow[] {
  return rowSchema.array().safeParse(v).success;
}

/**
 * The rows of a feed, or null when it has none (a feed sent before they were recorded, or a malformed
 * value). The report reads rows through this so a bad value never reaches a table.
 */
export function readRunInputs(feed: unknown): RunInputRow[] | null {
  if (typeof feed !== 'object' || feed === null) return null;
  const rows = (feed as Record<string, unknown>)[RUN_INPUTS];
  return isRunInputRows(rows) && rows.length > 0 ? rows : null;
}

/**
 * A feed object with a malformed `runInputs` removed, for the feeds whose project file shape is a plain
 * JSON object. Anything else is returned as it was.
 */
export function dropMalformedRunInputs<T extends Record<string, unknown>>(feed: T): T {
  if (!(RUN_INPUTS in feed) || isRunInputRows(feed[RUN_INPUTS])) return feed;
  const { [RUN_INPUTS]: _dropped, ...rest } = feed;
  void _dropped;
  return rest as T;
}

/**
 * A feed as its content is fingerprinted: without the recorded inputs, so recording them (or sending the
 * same values again with a different record) changes no inputs hash and marks no screen out of date.
 */
export function withoutRunInputs<T>(value: T): T {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !(RUN_INPUTS in value)
  ) {
    return value;
  }
  const { [RUN_INPUTS]: _dropped, ...rest } = value as Record<string, unknown>;
  void _dropped;
  return rest as T;
}

/** The report's sentence for a sent result that carries no rows, naming what to do. */
export function notRecordedNote(what: string, screen: string): string {
  return `The inputs of the ${what} that was sent were not recorded (it was sent before inputs were recorded); send it again from the ${screen} to record them.`;
}

/** The name of a method id as the methods statement prints it, or the plain words for an entered value. */
export function methodName(id: string | undefined): string {
  if (id === undefined || id === '' || id === 'entered') return 'entered by the user';
  return registry.has(id) ? registry.get(id).name : 'a method of this program';
}
