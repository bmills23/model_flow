/**
 * Project-level overrides: a value the user typed to replace a database or preset value for this
 * project only, with the short source note that justifies it.
 *
 * The mechanism is general. An override set maps a subject (a chemical id, or a receptor tag) to the
 * fields edited on it; each edit is a typed value and a required note. `OverridesState` holds one such
 * set per kind of override (`toxicity` today). A later slice adds a sibling set (for example `receptors`)
 * by adding a key to the state, the schema in `project.ts` and a function that lays the set over its
 * defaults; the helpers below, the saved shape and the edit panel are shared.
 */

/** One edit: the value as typed and the source note. Both must be usable for the edit to apply. */
export interface OverrideEntry {
  value: string;
  note: string;
}

/** Subject (chemical id, receptor tag) to field key to edit. */
export type FieldOverrides = Record<string, Record<string, OverrideEntry>>;

export interface OverridesState {
  /** Toxicity values per chemical id: sfo, iur, rfdo, rfci. */
  toxicity: FieldOverrides;
}

export const emptyOverrides = (): OverridesState => ({ toxicity: {} });

export const isEmpty = (o: OverridesState): boolean => Object.keys(o.toxicity).length === 0;

/** The number an entry gives, or null when the entry is not usable (not above zero, or no note). */
export function usableValue(e: OverrideEntry): number | null {
  if (e.note.trim() === '') return null;
  return numberAboveZero(e.value);
}

function numberAboveZero(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Why an entry is not applied, or null when it is. */
export function entryProblem(e: OverrideEntry): string | null {
  if (numberAboveZero(e.value) === null) return 'Enter a number above zero.';
  if (e.note.trim() === '')
    return 'A source note is required; the value is not used until you add one.';
  return null;
}

/** A copy with one field set. */
export function setField(
  map: FieldOverrides,
  subject: string,
  field: string,
  entry: OverrideEntry,
): FieldOverrides {
  return { ...map, [subject]: { ...(map[subject] ?? {}), [field]: entry } };
}

/** A copy with one field removed; a subject left with no fields is removed too. */
export function resetField(map: FieldOverrides, subject: string, field: string): FieldOverrides {
  const own = map[subject];
  if (own === undefined || !(field in own)) return map;
  const rest = Object.fromEntries(Object.entries(own).filter(([k]) => k !== field));
  const others = Object.fromEntries(Object.entries(map).filter(([k]) => k !== subject));
  return Object.keys(rest).length === 0 ? others : { ...others, [subject]: rest };
}
