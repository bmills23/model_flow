import { useMemo, useSyncExternalStore } from 'react';
import type { ChemicalDb } from '../risk/chemicalDb';
import {
  getChemicals,
  getOverrides,
  setOverrides,
  subscribeChemicals,
  subscribeProject,
} from '../project/store';
import type { OverridesState } from './model';
import { effectiveDb } from './userChemicals';

/** The project's overrides, live: every screen that calls this sees the same edit at once. */
export function useOverrides(): [OverridesState, (next: OverridesState) => void] {
  const state = useSyncExternalStore(subscribeProject, getOverrides, getOverrides);
  return [state, setOverrides];
}

/**
 * The loaded database with the project's user chemicals added and its toxicity overrides laid over it
 * (the same object when none apply).
 */
export function useEffectiveDb(
  base: ChemicalDb | null,
  overrides: OverridesState,
): ChemicalDb | null {
  const chemicals = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  return useMemo(
    () => (base === null ? null : effectiveDb(base, overrides, chemicals)),
    [base, overrides, chemicals],
  );
}
