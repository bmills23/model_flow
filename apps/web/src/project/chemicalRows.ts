import type { ProjectChemical } from './chemicals';

interface RowLike {
  id: string;
  name: string;
}

/**
 * The rows of a screen that follows the project chemical list (risk, cleanup). Existing rows keep their
 * state and their place; a list entry with no row gets `make(id, name)` (the screen's defaults, or null
 * when the screen cannot make one, as for a chemical outside its database) appended in list order; a
 * row whose id is in `removed` (it was in the list and has just left it) is dropped. A row the list
 * never held stays, so opening a project loses no row state (see `rowsMissingFromList`). The same array
 * comes back when nothing changes.
 */
export function followList<R extends RowLike>(
  rows: readonly R[],
  list: readonly ProjectChemical[],
  removed: ReadonlySet<string>,
  make: (id: string, name: string) => R | null,
): readonly R[] {
  const kept = rows.filter((r) => !removed.has(r.id));
  const have = new Set(kept.map((r) => r.id));
  const added: R[] = [];
  for (const c of list) {
    if (have.has(c.id)) continue;
    const row = make(c.id, c.name);
    if (row !== null) {
      added.push(row);
      have.add(c.id);
    }
  }
  return kept.length === rows.length && added.length === 0 ? rows : [...kept, ...added];
}

/** The rows whose chemical is not in the list (and was not just removed from it): they join the list. */
export function rowsMissingFromList(
  rows: readonly RowLike[],
  list: readonly ProjectChemical[],
  removed: ReadonlySet<string>,
): ProjectChemical[] {
  const out: ProjectChemical[] = [];
  for (const r of rows) {
    if (removed.has(r.id) || list.some((c) => c.id === r.id) || out.some((c) => c.id === r.id))
      continue;
    out.push({ id: r.id, name: r.name });
  }
  return out;
}
