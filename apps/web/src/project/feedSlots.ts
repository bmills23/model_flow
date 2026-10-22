/**
 * One slot per chemical (wave O slice O4). A feed about one chemical holds one sent value per
 * chemical id, so sending toluene from a screen keeps the benzene value it sent before. The slot key
 * is the chemical id the value carries (`chemicalId`), or the empty text for a value sent while its
 * screen's chemical was typed by hand. Version 2 of the project file stores such a feed as an object
 * of these slots; the TPH feed is about a composition, not one chemical, and keeps its single slot.
 */

/** The held values of one feed, by slot key, in the order they were last sent (oldest first). */
export type FeedSlots<T> = ReadonlyMap<string, T>;

/** The slot key of a chemical id: the id, or the empty text when it is absent or blank. */
export const slotOf = (chemicalId: string | undefined | null): string =>
  typeof chemicalId === 'string' && chemicalId.trim() !== '' ? chemicalId : '';

/** The slot key of a sent value: its `chemicalId`, or the empty text when it carries none. */
export const slotOfValue = (value: unknown): string =>
  typeof value === 'object' && value !== null
    ? slotOf((value as { chemicalId?: unknown }).chemicalId as string | undefined)
    : '';

/**
 * The slot key a consumer for `chemicalId` reads among `keys`: its own chemical's slot; when there is
 * none, the untagged slot; when neither is held, the most recently sent slot of another chemical, so
 * the consumer's chemical check (`project/feedChemical.ts`) names the chemical it was made for. A
 * consumer with no chemical (typed by hand) reads the untagged slot, else the most recent. Null when
 * nothing is held.
 */
export function resolveSlot(
  keys: readonly string[],
  chemicalId: string | undefined,
): string | null {
  if (keys.length === 0) return null;
  const own = slotOf(chemicalId);
  if (keys.includes(own)) return own;
  if (keys.includes('')) return '';
  return keys[keys.length - 1]!;
}

const isSlots = <T>(held: unknown): held is FeedSlots<T> => held instanceof Map;

/**
 * The value a consumer for `chemicalId` reads (see `resolveSlot`). `held` is a feed's slots, or a
 * single value (taken as it is, the way a caller that already picked a slot passes it), or nothing.
 */
export function pickSlot<T>(
  held: T | FeedSlots<T> | null | undefined,
  chemicalId: string | undefined,
): T | null {
  if (held === null || held === undefined) return null;
  if (!isSlots<T>(held)) return held;
  const key = resolveSlot([...held.keys()], chemicalId);
  return key === null ? null : (held.get(key) ?? null);
}

/** The value held in exactly the slot of `chemicalId` (no fallback), or null: what a sender shows as sent. */
export function ownSlot<T>(held: FeedSlots<T>, chemicalId: string | undefined): T | null {
  return held.get(slotOf(chemicalId)) ?? null;
}

/** Every held value of a feed, in send order; a single value is a list of one. */
export function slotValues<T>(held: T | FeedSlots<T> | null | undefined): T[] {
  if (held === null || held === undefined) return [];
  return isSlots<T>(held) ? [...held.values()] : [held];
}
