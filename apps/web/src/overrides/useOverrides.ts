import { useMemo, useSyncExternalStore } from 'react';
import type { ChemicalDb } from '../risk/chemicalDb';
import { getOverrides, setOverrides, subscribeProject } from '../project/store';
import type { OverridesState } from './model';
import { applyToxOverrides } from './toxicity';

/** The project's overrides, live: every screen that calls this sees the same edit at once. */
export function useOverrides(): [OverridesState, (next: OverridesState) => void] {
  const state = useSyncExternalStore(subscribeProject, getOverrides, getOverrides);
  return [state, setOverrides];
}

/** The loaded database with the project's toxicity overrides laid over it (the same object when none apply). */
export function useEffectiveDb(
  base: ChemicalDb | null,
  overrides: OverridesState,
): ChemicalDb | null {
  return useMemo(
    () => (base === null ? null : applyToxOverrides(base, overrides)),
    [base, overrides],
  );
}
