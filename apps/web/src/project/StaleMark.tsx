import { FEED_INFO, useStaleFeeds } from './staleFeeds';
import type { StaleFeedKey } from './store';

/**
 * The mark beside a value taken from another screen whose inputs changed after it was sent. It is
 * text (not colour alone) and shows nothing while the value is current. The value itself stays
 * visible next to it.
 */
export function StaleMark(props: { feed: StaleFeedKey | readonly StaleFeedKey[] }) {
  const stale = useStaleFeeds();
  const keys = ([] as StaleFeedKey[]).concat(props.feed as StaleFeedKey | StaleFeedKey[]);
  const hit = keys.filter((k) => stale.includes(k));
  if (hit.length === 0) return null;
  const sources = [...new Set(hit.map((k) => FEED_INFO[k].source))];
  return (
    <span className="stale-mark">
      <span className="badge badge-legacy">Out of date</span>{' '}
      <small>Send again from {sources.join(' and ')}, or edit its inputs back.</small>
    </span>
  );
}
