import { useSyncExternalStore } from 'react';
import { projectNameOf } from './feedChemical';
import { FEED_INFO, staleAmong, toRead, useStaleSlots, type FeedRef } from './staleFeeds';
import { getChemicals, subscribeChemicals, type FeedRead, type StaleFeedKey } from './store';

/**
 * The mark beside a value taken from another screen whose inputs changed after it was sent. It is
 * text (not colour alone) and shows nothing while the value is current. The value itself stays
 * visible next to it. A consumer passes the feeds it reads, each for its own chemical: a feed key with
 * `chemicalId` (the consumer's chemical; undefined when it has none), or a list of reads (see
 * `feedsRead.ts`). The text names the chemical of each stale value.
 */
export function StaleMark(
  props:
    | { feed: FeedRead | readonly FeedRef[]; chemicalId?: undefined }
    | { feed: StaleFeedKey; chemicalId: string | undefined },
) {
  const stale = useStaleSlots();
  const list = useSyncExternalStore(subscribeChemicals, getChemicals, getChemicals);
  const refs = ([] as FeedRef[]).concat(props.feed as FeedRef | FeedRef[]);
  const reads = refs.map((r) =>
    typeof r === 'string' && props.chemicalId !== undefined
      ? { feed: r, chemicalId: props.chemicalId }
      : toRead(r),
  );
  const hit = staleAmong(reads, stale);
  if (hit.length === 0) return null;
  const nameOf = projectNameOf(list);
  const sources = [
    ...new Set(
      hit.map(
        (s) =>
          `${FEED_INFO[s.feed].source}${s.chemicalId === '' ? '' : ` for ${nameOf(s.chemicalId)}`}`,
      ),
    ),
  ];
  return (
    <span className="stale-mark">
      <span className="badge badge-legacy">Out of date</span>{' '}
      <small>Send again from {sources.join(' and ')}, or edit its inputs back.</small>
    </span>
  );
}
