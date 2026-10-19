import type { ChemicalsFile, ToxFile } from '@model-flow/data/rsl-types';
import chemicalsUrl from '@model-flow/data/generated/rsl-2024-11/chemicals.json?url';
import { buildBrowse, type BrowseDb } from './browse';

let loading: Promise<BrowseDb> | null = null;

/**
 * Loads the full RSL property file and the toxicity file on first use. The full file (633,152 bytes
 * once the build minifies it; 1,218,894 pretty-printed in the repo) is over the per-chunk size limit as a script chunk, so it is a separate asset fetched at
 * run time; the toxicity file is the same chunk the risk screen loads.
 */
export function loadBrowse(): Promise<BrowseDb> {
  loading ??= Promise.all([
    fetch(chemicalsUrl).then((r) => {
      if (!r.ok) throw new Error(`the chemical file answered ${r.status}`);
      return r.json() as Promise<ChemicalsFile>;
    }),
    import('@model-flow/data/generated/rsl-2024-11/tox.json'),
  ]).then(([full, tox]) => buildBrowse(full, tox.default as unknown as ToxFile));
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
