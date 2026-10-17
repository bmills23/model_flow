import { useEffect, useState } from 'react';
import { loadChemicalDb, type ChemicalDb } from './chemicalDb';

/** Loads the RSL chemical database on first use of a screen that needs it. */
export function useChemicalDb(): { db: ChemicalDb | null; error: string | null } {
  const [state, setState] = useState<{ db: ChemicalDb | null; error: string | null }>({
    db: null,
    error: null,
  });
  useEffect(() => {
    let live = true;
    loadChemicalDb().then(
      (db) => live && setState({ db, error: null }),
      (e: unknown) =>
        live && setState({ db: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
