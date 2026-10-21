import { useSyncExternalStore } from 'react';
import { getStaleFeeds, subscribeStale, type StaleFeedKey } from './store';

/**
 * How a screen asks whether a value passed from another screen is out of date. The mark is live: a
 * feed is stale from the moment the sending screen's inputs differ from those recorded at send until
 * they are edited back or the value is sent again. The values stay on the feed; a consumer shows them
 * with the mark and does not hide or recompute them.
 *
 * - `useStaleFeeds()` is the list of stale feed keys (a stable array until the set changes).
 * - `useFeedStale(key)` is true while that one feed is stale.
 * - Outside a component, `getStaleFeeds`, `isFeedStaleNow` and `subscribeStale` in `./store` do the same.
 */
export function useStaleFeeds(): readonly StaleFeedKey[] {
  return useSyncExternalStore(subscribeStale, getStaleFeeds, getStaleFeeds);
}

export function useFeedStale(key: StaleFeedKey): boolean {
  return useStaleFeeds().includes(key);
}

/** The keys of `wanted` that are in `stale`, in `wanted` order and without repeats. */
export function staleAmong(
  wanted: readonly StaleFeedKey[],
  stale: readonly StaleFeedKey[],
): StaleFeedKey[] {
  return [...new Set(wanted)].filter((k) => stale.includes(k));
}

/** One sentence naming each stale value and the screen that sends it; the text every consumer shows. */
export function staleSentence(keys: readonly StaleFeedKey[]): string {
  const names = keys.map((k) => `${FEED_INFO[k].label} (${FEED_INFO[k].source})`).join(', ');
  return `Out of date: ${names}`;
}

/** What a feed is called to a person, and the screen that sends it. */
export const FEED_INFO: Record<StaleFeedKey, { label: string; source: string; href: string }> = {
  well: { label: 'Receptor well concentration', source: 'Transport', href: '#/transport' },
  bank: { label: 'Groundwater run at the bank', source: 'Transport', href: '#/transport' },
  transportChain: {
    label: 'Groundwater run for cleanup levels',
    source: 'Transport',
    href: '#/transport',
  },
  vaporWaterTable: { label: 'Water table concentration', source: 'Transport', href: '#/transport' },
  surfaceWater: {
    label: 'Surface water concentration',
    source: 'Surface water',
    href: '#/surface-water',
  },
  vadose: { label: 'Vadose leaching source', source: 'Vadose leaching', href: '#/vadose' },
  vaporVadose: {
    label: 'Vadose pore water for vapor',
    source: 'Vadose leaching',
    href: '#/vadose',
  },
  saturated: {
    label: 'Saturated soil source',
    source: 'Saturated soil source',
    href: '#/saturated',
  },
  vaporSaturated: {
    label: 'Saturated pore water for vapor',
    source: 'Saturated soil source',
    href: '#/saturated',
  },
  vaporRisk: { label: 'Vapor air concentrations', source: 'Vapor intrusion', href: '#/vapor' },
  household: { label: 'Household exposure values', source: 'Household', href: '#/household' },
  produce: { label: 'Produce intake values', source: 'Plants and ecology', href: '#/plants-eco' },
  tph: { label: 'TPH fraction values', source: 'Plants and ecology', href: '#/plants-eco' },
};
