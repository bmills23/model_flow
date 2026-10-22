import { useEffect, useState } from 'react';
import { loadCriteriaDb, type CriteriaDb } from '../surfaceWater/criteriaDb';

/** The NRWQC criteria tables, loaded on first use (they are separate chunks, so only a screen that needs them pays). */
export function useCriteriaDb(): CriteriaDb | null {
  const [db, setDb] = useState<CriteriaDb | null>(null);
  useEffect(() => {
    let live = true;
    loadCriteriaDb().then(
      (d) => live && setDb(d),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return db;
}
