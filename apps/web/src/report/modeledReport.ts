import type { Screens } from '../project';
import type { ChemicalDb } from '../risk/chemicalDb';
import { buildModeledRows } from '../cleanup/modeledBuild';
import {
  getOwnModeledSummary,
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
  | { state: 'none'; chemical?: string }
  | { state: 'stale'; summary: ModeledUncertaintySummary; chemical?: string }
  | { state: 'current'; summary: ModeledUncertaintySummary; chemical?: string };

export type ModeledReportEntry =
  | ModeledChemicalEntry
  | { state: 'many'; entries: (ModeledChemicalEntry & { chemical: string })[] };

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
  const entries = rows.map((row): ModeledChemicalEntry & { chemical: string } => {
    // the chemical's own summary, else one kept without a chemical; never another chemical's
    const held = getOwnModeledSummary(row.id) ?? getOwnModeledSummary('');
    if (held === null) return { state: 'none', chemical: row.name };
    if (!row.result.ok) return { state: 'stale', summary: held, chemical: row.name };
    const now = modeledFingerprint(row.result.request, screens.uncertainty.modeled);
    return {
      state: now === held.fingerprint ? 'current' : 'stale',
      summary: held,
      chemical: row.name,
    };
  });
  if (entries.length === 0) return { state: 'none' };
  if (entries.length === 1) {
    const { chemical: _name, ...single } = entries[0]!;
    void _name;
    return single;
  }
  return { state: 'many', entries };
}
