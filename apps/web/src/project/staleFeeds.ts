import { useSyncExternalStore } from 'react';
import { projectNameOf } from './feedChemical';
import {
  getChemicals,
  getStaleFeeds,
  getStaleSlots,
  readMatches,
  subscribeStale,
  type FeedRead,
  type StaleFeedKey,
  type StaleSlot,
} from './store';

/**
 * How a screen asks whether a value passed from another screen is out of date. Feeds about one
 * chemical hold one slot per chemical (wave O slice O4), and the mark is per slot: a stale benzene
 * slot does not mark the toluene one. The mark is live: a slot is stale from the moment the sending
 * screen's inputs differ from those recorded at send until they are edited back or the value is sent
 * again. The values stay on the feed; a consumer shows them with the mark and does not hide or
 * recompute them.
 *
 * - `useStaleSlots()` is the list of stale slots (a stable array until the set changes).
 * - `useFeedStale(key, chemicalId)` is true while the slot a consumer of that chemical reads is stale.
 * - `useStaleFeeds()` is the list of feeds with any stale slot.
 * - Outside a component, `getStaleSlots`, `isFeedStaleNow` and `subscribeStale` in `./store` do the same.
 */
export function useStaleSlots(): readonly StaleSlot[] {
  return useSyncExternalStore(subscribeStale, getStaleSlots, getStaleSlots);
}

export function useStaleFeeds(): readonly StaleFeedKey[] {
  return useSyncExternalStore(subscribeStale, getStaleFeeds, getStaleFeeds);
}

export function useFeedStale(key: StaleFeedKey, chemicalId?: string): boolean {
  return useStaleSlots().some((s) => readMatches({ feed: key, chemicalId }, s));
}

/** A feed a consumer reads: a feed key alone (any slot), or a feed for a chemical. */
export type FeedRef = StaleFeedKey | FeedRead;
export const toRead = (r: FeedRef): FeedRead => (typeof r === 'string' ? { feed: r } : r);
const toSlot = (s: StaleSlot | StaleFeedKey): StaleSlot =>
  typeof s === 'string' ? { feed: s, chemicalId: '' } : s;

/** The stale slots that one of `wanted` reads (see `readMatches`), in stale order and without repeats. */
export function staleAmong(
  wanted: readonly FeedRef[],
  stale: readonly (StaleSlot | StaleFeedKey)[],
): StaleSlot[] {
  const reads = wanted.map(toRead);
  return stale.map(toSlot).filter((s) => reads.some((r) => readMatches(r, s)));
}

/** What one stale slot is called to a person: the value, the chemical it is for, the sending screen. */
export function slotLabel(
  slot: StaleSlot | StaleFeedKey,
  nameOf: (id: string) => string = projectNameOf(getChemicals()),
): string {
  const s = toSlot(slot);
  const info = FEED_INFO[s.feed];
  const chemical = s.chemicalId === '' ? '' : ` for ${nameOf(s.chemicalId)}`;
  return `${info.label}${chemical} (${info.source})`;
}

/** One sentence naming each stale value, its chemical and the screen that sends it; the text every consumer shows. */
export function staleSentence(
  slots: readonly (StaleSlot | StaleFeedKey)[],
  nameOf?: (id: string) => string,
): string {
  const names = slots.map((s) => slotLabel(s, nameOf)).join(', ');
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
