import type { FieldOverrides, OverridesState } from './model';

/**
 * Editable exposure factors of a receptor, per project. The preset gives the starting values; an edit
 * here replaces one of them for the receptor it was typed on. Edits are keyed by `<screen>.<a|b>` so the
 * exposure and the cleanup screens keep their own receptors, and so does the guided flow (`guided`). Display units: the same boundary units the
 * engine's receptor tables use (kg, yr, d/yr, mg/d, mL/h).
 */
export type ReceptorScreen = 'risk' | 'cleanup' | 'guided';

export const receptorKey = (screen: ReceptorScreen, which: 'a' | 'b'): string =>
  `${screen}.${which}`;

/** Legacy method factors, edited on the receptor boundary (`prop`). */
export const LEGACY_FIELDS = [
  { key: 'legacy.bwKg', prop: 'bwKg', label: 'Body weight', unit: 'kg' },
  { key: 'legacy.edYr', prop: 'edYr', label: 'Exposure duration', unit: 'yr' },
  { key: 'legacy.efDaysPerYr', prop: 'efDaysPerYr', label: 'Exposure frequency', unit: 'd/yr' },
  {
    key: 'legacy.soilIngestionMgPerDay',
    prop: 'soilIngestionMgPerDay',
    label: 'Soil ingestion rate',
    unit: 'mg/d',
  },
  {
    key: 'legacy.swimIngestionMlPerHour',
    prop: 'swimIngestionMlPerHour',
    label: 'Swimming water ingestion',
    unit: 'mL/h',
  },
] as const;

/** Modern method stage scalars; the key carries the life-stage group (child, adult, worker). */
export const MODERN_FIELDS = [
  { prop: 'bwKg', label: 'Body weight', unit: 'kg' },
  { prop: 'efDaysPerYr', label: 'Exposure frequency', unit: 'd/yr' },
  { prop: 'soilIngestionMgPerDay', label: 'Soil ingestion rate', unit: 'mg/d' },
] as const;
export type ModernProp = (typeof MODERN_FIELDS)[number]['prop'];

export const modernKey = (group: string, prop: ModernProp): string => `modern.${group}.${prop}`;

/** The cancer averaging time (lifetime), used by both methods. */
export const LIFETIME_KEY = 'lifetimeYr';
export const LIFETIME_LABEL = 'Averaging time for cancer (lifetime)';

export const MAX_NAME_LENGTH = 60;

/** What a build reads from a receptor: raw typed values by field key and the optional name. */
export interface ReceptorEdits {
  name: string;
  values: Record<string, string>;
}

/** The edits of one receptor, or undefined when it has none. */
export function editsFor(
  state: OverridesState,
  screen: ReceptorScreen,
  which: 'a' | 'b',
): ReceptorEdits | undefined {
  const k = receptorKey(screen, which);
  const name = (state.receptorNames[k] ?? '').trim();
  const own = state.receptors[k] ?? {};
  const values = Object.fromEntries(
    Object.entries(own)
      .filter(([, e]) => e.value.trim() !== '')
      .map(([f, e]) => [f, e.value]),
  );
  if (name === '' && Object.keys(values).length === 0) return undefined;
  return { name, values };
}

/** A copy of the form with this project's edits laid on its receptors, ready for a build. */
export function withReceptorEdits<
  F extends { a: { edits?: ReceptorEdits }; b: { edits?: ReceptorEdits } | null },
>(form: F, state: OverridesState, screen: ReceptorScreen): F {
  const ea = editsFor(state, screen, 'a');
  const eb = editsFor(state, screen, 'b');
  if (ea === undefined && eb === undefined) return form;
  return {
    ...form,
    a: ea === undefined ? form.a : { ...form.a, edits: ea },
    b: form.b === null || eb === undefined ? form.b : { ...form.b, edits: eb },
  };
}

/** How many edits (factors and the name) one receptor holds. */
export function editCount(state: OverridesState, key: string): number {
  const names = (state.receptorNames[key] ?? '') === '' ? 0 : 1;
  return Object.keys(state.receptors[key] ?? {}).length + names;
}

/** A copy with every edit of one receptor removed. */
export function clearReceptor(state: OverridesState, key: string): OverridesState {
  const receptors: FieldOverrides = Object.fromEntries(
    Object.entries(state.receptors).filter(([k]) => k !== key),
  );
  const receptorNames = Object.fromEntries(
    Object.entries(state.receptorNames).filter(([k]) => k !== key),
  );
  return { ...state, receptors, receptorNames };
}
