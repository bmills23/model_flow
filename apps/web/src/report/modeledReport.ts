import type { Screens } from '../project';
import type { ChemicalDb } from '../risk/chemicalDb';
import { buildModeled } from '../cleanup/modeledBuild';
import {
  getModeledSummary,
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
 * computed from.
 */
export type ModeledReportEntry =
  | { state: 'none' }
  | { state: 'stale'; summary: ModeledUncertaintySummary }
  | { state: 'current'; summary: ModeledUncertaintySummary };

/**
 * The entry for the project's screens (receptor edits already laid on, as `planUncertainty` does), or
 * null when the cleanup source is direct and there is no modeled source to report. The current
 * request is rebuilt from the cleanup form and the session's chain feeds exactly as the cleanup
 * screen builds it; with no chain to build from, a held summary can no longer be vouched for.
 */
export function modeledReportEntry(screens: Screens, db: ChemicalDb): ModeledReportEntry | null {
  const form = screens.cleanup.form;
  if (form.source === 'direct') return null;
  const held = getModeledSummary();
  if (held === null) return { state: 'none' };
  const built = buildModeled(form, db, {
    transport: getTransportFeed(),
    vadose: getVadoseFeed(),
    saturated: getSaturatedFeed(),
  });
  if (!built.ok) return { state: 'stale', summary: held };
  const now = modeledFingerprint(built.request, screens.uncertainty.modeled);
  return { state: now === held.fingerprint ? 'current' : 'stale', summary: held };
}
