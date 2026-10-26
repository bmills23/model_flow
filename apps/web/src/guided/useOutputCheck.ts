import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  getChemicals,
  getGuided,
  getOverrides,
  subscribeChemicals,
  subscribeGuided,
  subscribeProject,
} from '../project/store';
import type { ProjectChemical } from '../project/chemicals';
import type { OverridesState } from '../overrides/model';
import { applyFateOverrides } from '../overrides/fate';
import { userCleanupProps, withUserFateRows } from '../overrides/userChemicals';
import { loadVaporChemicals, type VaporChemicalRow } from '../vapor/chemicals';
import { loadCleanupProps, type CleanupProps } from '../cleanup/ssg';
import type { ChemicalData } from './derive';
import { outputHashes } from './hash';
import { hashOutputCheck, type OutputCheck } from './status';

/**
 * The project chemicals as the Run reads them: each with its fate row (the database or user chemical, with
 * the 3c edits laid over, as `useChemicalRows` gives the screens) and its cleanup partition properties.
 */
export function guidedChemicalData(
  chemicals: readonly ProjectChemical[],
  loaded: VaporChemicalRow[],
  overrides: OverridesState,
  props: CleanupProps | null,
): ChemicalData[] {
  const rows = applyFateOverrides(withUserFateRows(loaded, chemicals), overrides);
  const own = userCleanupProps(chemicals);
  return chemicals.map((c) => {
    const p = props?.get(c.id) ?? own.get(c.id);
    return {
      id: c.id,
      name: c.name,
      fate: rows.find((r) => r.id === c.id),
      ...(p === undefined ? {} : { props: p }),
    };
  });
}

/**
 * The project chemicals with their database values, once the two chemical files have loaded (null until
 * then, and while `enabled` is false, so a page with nothing to check loads nothing).
 */
export function useGuidedChemicalData(enabled: boolean): ChemicalData[] | null {
  const chemicals = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const overrides = useSyncExternalStore(subscribeProject, getOverrides, getOverrides);
  const [files, setFiles] = useState<{
    rows: VaporChemicalRow[];
    props: CleanupProps | null;
  } | null>(null);
  useEffect(() => {
    if (!enabled || files !== null) return;
    let live = true;
    void Promise.all([loadVaporChemicals(), loadCleanupProps().catch(() => null)]).then(
      ([rows, props]) => {
        if (live) setFiles({ rows, props });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [enabled, files]);
  return useMemo(
    () =>
      files === null ? null : guidedChemicalData(chemicals, files.rows, overrides, files.props),
    [chemicals, overrides, files],
  );
}

/** Until the chemical files load, an output that is there cannot be checked yet, so it reads unchecked. */
const presentCheck =
  (outputs: ReturnType<typeof getGuided>['outputs']): OutputCheck =>
  (feed, id) =>
    outputs[feed]?.[id] === undefined ? 'missing' : 'unchecked';

/**
 * The step list's 3d check: each output's recorded hash against the live hash of its chemical and model
 * (`hashOutputCheck`). A project with no outputs needs no chemical data and loads none.
 */
export function useGuidedOutputCheck(): OutputCheck {
  const guided = useSyncExternalStore(subscribeGuided, getGuided, getGuided);
  const any = Object.keys(guided.outputs).length > 0;
  const data = useGuidedChemicalData(any);
  return useMemo(
    () =>
      data === null
        ? presentCheck(guided.outputs)
        : hashOutputCheck(guided.outputs, outputHashes(guided, data), guided.runNotes),
    [guided, data],
  );
}
