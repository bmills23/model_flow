import { useEffect } from 'react';
import type { ChemicalDb } from '../risk/chemicalDb';
import type { SaturatedFeed } from '../saturated/feed';
import type { TransportFeed } from '../transport/chainFeed';
import type { VadoseFeed } from '../vadose/feed';
import { useStaleSlots } from '../project/staleFeeds';
import { getChainHash, setModeledLevels } from '../project/store';
import type { CleanupForm } from './form';
import type { ModeledSolved } from './ModeledCleanup';
import type { ModeledRowBuild } from './modeledBuild';
import { modeledLevelsFingerprint, summarizeModeledLevels } from './modeledLevels';
import { requestKey } from './useModeled';

/**
 * Keeps the modeled cleanup levels of each chemical with the project (docs/DECISIONS.md, wave AA ruling 2)
 * whenever the screen holds a solve that answers the chemical's request now and was made through a
 * groundwater run (and vadose or saturated source) that is not out of date against the screen it was sent
 * from. The fingerprint names the run the solve went through (that chemical's own slot), never the
 * groundwater screen's form as it stands: that form is shared by every chemical, so it would stamp a
 * solve from an old run as current after an edit made for another chemical. A solve that is being
 * redone, or rests on a stale run, is not kept: the levels already kept stay, and the report calls them
 * out of date once the inputs no longer match their fingerprint.
 */
export function useSaveModeledLevels(args: {
  /** The cleanup form with the project's receptor edits laid on. */
  form: CleanupForm;
  db: ChemicalDb | null;
  rows: readonly ModeledRowBuild[] | null;
  solved: ReadonlyMap<string, ModeledSolved>;
  feedsOf: (id: string) => {
    transport: TransportFeed | null;
    vadose: VadoseFeed | null;
    saturated: SaturatedFeed | null;
  };
}): void {
  const { form, db, rows, solved, feedsOf } = args;
  const stale = useStaleSlots();
  useEffect(() => {
    if (db === null || rows === null || form.source === 'direct') return;
    const source = form.source;
    for (const row of rows) {
      const s = solved.get(row.id);
      if (!row.result.ok || s === undefined || !s.item.ok) continue;
      if (requestKey(s.req) !== requestKey(row.result.request)) continue;
      const held = feedsOf(row.id);
      const outOfDate = (feed: 'transportChain' | 'vadose' | 'saturated'): boolean =>
        stale.some((x) => x.feed === feed && (x.chemicalId === row.id || x.chemicalId === ''));
      if (held.transport === null || outOfDate('transportChain')) continue;
      // the levels are fingerprinted from the record of the run they were solved through; with no
      // record there is nothing to tie them to, so they are not kept
      const chain = getChainHash(row.id);
      if (chain === undefined) continue;
      if (source === 'vadose' && (held.vadose === null || outOfDate('vadose'))) continue;
      if (source === 'saturated' && (held.saturated === null || outOfDate('saturated'))) continue;
      setModeledLevels(
        summarizeModeledLevels(s.item.outcome, {
          chemicalId: row.id,
          chemical: row.name,
          source,
          notes: row.result.notes,
          fingerprint: modeledLevelsFingerprint({
            cleanup: form,
            chemicalId: row.id,
            chain,
            vadose: held.vadose,
            saturated: held.saturated,
            rec: db.byId.get(row.id),
            edition: db.edition,
          }),
        }),
      );
    }
    // feedsOf reads only the feed slots the rows were built from
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, db, rows, solved, stale]);
}
