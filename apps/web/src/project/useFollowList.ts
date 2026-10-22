import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ProjectChemical } from './chemicals';
import { followList, rowsMissingFromList } from './chemicalRows';
import { addChemical, getChemicals, subscribeChemicals } from './store';

/**
 * Keeps the chemical rows of a screen that follows the project list (risk, cleanup) in step with it.
 * A chemical that joins the list gets a row made by `make` (the screen's defaults; null when the screen
 * cannot make one, as for a chemical outside its database, or while `canMake` is false). A chemical
 * that leaves the list loses its row. A row the list never held joins the list instead, so opening an
 * older project loses no state. Returns the list, for the screen to name what it cannot show.
 */
export function useFollowList<R extends { id: string; name: string }>(
  rows: readonly R[],
  setRows: (update: (rows: readonly R[]) => readonly R[]) => void,
  make: (id: string, name: string) => R | null,
  canMake: boolean,
): readonly ProjectChemical[] {
  const list = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const seen = useRef<readonly ProjectChemical[] | null>(null);
  const makeRef = useRef(make);
  useEffect(() => {
    makeRef.current = make;
  });
  useEffect(() => {
    const before = seen.current;
    seen.current = list;
    const removed = new Set(
      before === null
        ? []
        : before.filter((b) => !list.some((l) => l.id === b.id)).map((b) => b.id),
    );
    for (const c of rowsMissingFromList(rows, list, removed)) addChemical(c);
    setRows((cur) => followList(cur, list, removed, canMake ? makeRef.current : () => null));
  }, [list, canMake, rows, setRows]);
  return list;
}
