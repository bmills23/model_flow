import { pickSlot, slotOf, slotOfValue, type FeedSlots } from '../project/feedSlots';

/**
 * A held value shared between screens. It starts empty unless an `initial` value is given; the
 * project store restores saved feeds into it when the app starts.
 */
export function createFeed<T>(initial: T | null = null): {
  get: () => T | null;
  set: (value: T) => void;
  clear: () => void;
  subscribe: (fn: () => void) => () => void;
} {
  let current: T | null = initial;
  const listeners = new Set<() => void>();
  const emit = (): void => listeners.forEach((fn) => fn());
  return {
    get: () => current,
    set: (value) => {
      current = value;
      emit();
    },
    clear: () => {
      if (current === null) return;
      current = null;
      emit();
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/** Every per-chemical feed made, so a chemical removed from the project can be cleared from all of them. */
const chemicalFeeds = new Set<{ clearSlot: (chemicalId: string) => void }>();

/** Clear the slot of `chemicalId` from every per-chemical feed (the other chemicals' slots stay). */
export function clearChemicalSlots(chemicalId: string): void {
  chemicalFeeds.forEach((feed) => feed.clearSlot(chemicalId));
}

/**
 * A held value about one chemical, kept per chemical (wave O slice O4, see `project/feedSlots.ts`).
 * `set` writes the slot of the value's own `chemicalId` (the sending screen's chemical) and leaves the
 * other slots alone. `get(chemicalId)` is what a consumer for that chemical reads (`resolveSlot`);
 * `slots()` is every slot, one Map that keeps its identity until a slot changes (a
 * `useSyncExternalStore` snapshot). A listener is told the slot key a send wrote (a re-send of the
 * same value included); a clear tells it nothing more.
 */
export function createChemicalFeed<T extends { chemicalId?: string }>(): {
  get: (chemicalId?: string) => T | null;
  slots: () => FeedSlots<T>;
  set: (value: T) => void;
  clear: () => void;
  clearSlot: (chemicalId: string) => void;
  subscribe: (fn: (slot?: string) => void) => () => void;
} {
  let current: FeedSlots<T> = new Map();
  const listeners = new Set<(slot?: string) => void>();
  const emit = (slot?: string): void => listeners.forEach((fn) => fn(slot));
  const feed = {
    get: (chemicalId?: string) => pickSlot(current, chemicalId),
    slots: () => current,
    set: (value: T) => {
      const key = slotOfValue(value);
      const next = new Map(current);
      // a re-send moves the slot to the end: the order is the order of the last sends
      next.delete(key);
      next.set(key, value);
      current = next;
      emit(key);
    },
    clear: () => {
      if (current.size === 0) return;
      current = new Map();
      emit();
    },
    clearSlot: (chemicalId: string) => {
      const key = slotOf(chemicalId);
      if (key === '' || !current.has(key)) return;
      const next = new Map(current);
      next.delete(key);
      current = next;
      emit(key);
    },
    subscribe: (fn: (slot?: string) => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  chemicalFeeds.add(feed);
  return feed;
}
