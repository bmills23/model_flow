import type { Screens } from '../project';
import type { ChemicalDb } from '../risk/chemicalDb';
import { buildModeledRows } from '../cleanup/modeledBuild';
import {
  getOwnModeledSummary,
  heldModeledSummaries,
  modeledFingerprint,
  type ModeledUncertaintySummary,
} from '../cleanup/modeledSummary';
import { getTransportFeed } from '../transport/chainFeed';
import { getVadoseFeed } from '../vadose/feed';
import { getSaturatedFeed } from '../saturated/feed';

/**
 * The modeled-source uncertainty result in the report (docs/DECISIONS.md, wave J slice J2). The report
 * cannot repeat the run, because a modeled source is solved through the groundwater chain, which holds
 * a function and is not saved with a project. It prints the summary the cleanup screen kept this
 * session instead, and only while the screens' inputs still give the request and setup it was
 * computed from. With several cleanup chemicals each has its own summary and its own state (wave P
 * slice P3): the entry is then a list that names each chemical.
 */
export type ModeledChemicalEntry =
  | { state: 'none'; chemical?: string; id?: string }
  | { state: 'stale'; summary: ModeledUncertaintySummary; chemical?: string; id?: string }
  | { state: 'current'; summary: ModeledUncertaintySummary; chemical?: string; id?: string };

export type ModeledReportEntry =
  | ModeledChemicalEntry
  | { state: 'many'; entries: (ModeledChemicalEntry & { chemical: string; id: string })[] };

/**
 * The entry for the project's screens (receptor edits already laid on, as `planUncertainty` does), or
 * null when the cleanup source is direct and there is no modeled source to report. Each chemical's
 * current request is rebuilt from the cleanup form and the session's chain feeds exactly as the cleanup
 * screen builds it, from that chemical's own slots; with no chain to build from, a held summary can no
 * longer be vouched for. A chemical with no summary of its own is `none`, whatever another chemical
 * kept. One chemical gives a plain entry, several give `many`.
 */
export function modeledReportEntry(screens: Screens, db: ChemicalDb): ModeledReportEntry | null {
  const form = screens.cleanup.form;
  if (form.source === 'direct') return null;
  const rows = buildModeledRows(form, db, (id) => ({
    transport: getTransportFeed(id),
    vadose: getVadoseFeed(id),
    saturated: getSaturatedFeed(id),
  }));
  const entries = rows.map((row): ModeledChemicalEntry & { chemical: string; id: string } => {
    // the chemical's own summary, else one kept without a chemical; never another chemical's
    const held = getOwnModeledSummary(row.id) ?? getOwnModeledSummary('');
    if (held === null) return { state: 'none', chemical: row.name, id: row.id };
    if (!row.result.ok) return { state: 'stale', summary: held, chemical: row.name, id: row.id };
    const now = modeledFingerprint(row.result.request, screens.uncertainty.modeled);
    return {
      state: now === held.fingerprint ? 'current' : 'stale',
      summary: held,
      chemical: row.name,
      id: row.id,
    };
  });
  if (entries.length === 0) {
    // the list was emptied after a run: the summaries kept still say a run existed, and it no longer
    // answers any cleanup chemical, so it is out of date rather than absent
    const kept = heldModeledSummaries();
    if (kept.length === 0) return { state: 'none' };
    if (kept.length === 1) return { state: 'stale', summary: kept[0]! };
    return {
      state: 'many',
      entries: kept.map((summary) => ({
        state: 'stale' as const,
        summary,
        chemical: summary.chemical,
        id: summary.chemicalId,
      })),
    };
  }
  if (entries.length === 1) {
    const { chemical: _name, id: _id, ...single } = entries[0]!;
    void _name;
    void _id;
    return single;
  }
  return { state: 'many', entries };
}
