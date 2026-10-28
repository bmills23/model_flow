import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { effectiveDb } from '../overrides/userChemicals';
import {
  getChemicals,
  getGuided,
  getOverrides,
  subscribeChemicals,
  subscribeGuided,
  subscribeProject,
} from '../project/store';
import type { ChemicalDb } from '../risk/chemicalDb';
import type { levelsCheckFor } from './solve';
import type { LevelsCheck } from './status';
import { useGuidedChemicalData } from './useOutputCheck';

const UNCHECKED: LevelsCheck = () => 'unchecked';

/**
 * The step list's step 5 check: each chemical's kept cleanup level against its live guided fingerprint.
 * It loads the solve code and the chemical files only once the project keeps levels for cleanup, so the
 * shell carries none of it, and reads 'unchecked' while they load. Undefined while nothing is kept.
 */
export function useGuidedLevelsCheck(): LevelsCheck | undefined {
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const chemicals = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const overrides = useSyncExternalStore(subscribeProject, getOverrides, getOverrides);
  const wanted =
    guided.targets.mode === 'cleanup' &&
    guided.levels !== undefined &&
    Object.keys(guided.levels).length > 0;
  const data = useGuidedChemicalData(wanted);
  const [loaded, setLoaded] = useState<{ check: typeof levelsCheckFor; db: ChemicalDb } | null>(
    null,
  );
  useEffect(() => {
    if (!wanted || loaded !== null) return;
    let live = true;
    void Promise.all([
      import('./solve'),
      import('../risk/chemicalDb').then((m) => m.loadChemicalDb()),
    ]).then(
      ([solve, db]) => {
        if (live) setLoaded({ check: solve.levelsCheckFor, db });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [wanted, loaded]);
  const db = useMemo(
    () => (loaded === null ? null : effectiveDb(loaded.db, overrides, chemicals)),
    [loaded, overrides, chemicals],
  );
  const check = loaded?.check ?? null;
  return useMemo((): LevelsCheck | undefined => {
    if (!wanted) return undefined;
    if (data === null || db === null || check === null) return UNCHECKED;
    return check(guided, { chemicals: data, db, overrides });
  }, [wanted, data, db, check, guided, overrides]);
}
