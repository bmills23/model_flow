import type { SaturatedSourceInput } from '@model-flow/engine';

export type SaturatedMethod = 'legacy' | 'modern';

/**
 * The saturated-source result offered to the groundwater screen as its source. It holds the engine
 * input, not the schedule, so the groundwater screen can run the source method for its own
 * evaluation time. It lives in memory for the session; a reload starts without a feed.
 */
export interface SaturatedFeed {
  input: SaturatedSourceInput;
  method: SaturatedMethod;
  label: string;
}

let current: SaturatedFeed | null = null;
const listeners = new Set<() => void>();

const emit = (): void => listeners.forEach((fn) => fn());

export function getSaturatedFeed(): SaturatedFeed | null {
  return current;
}

export function setSaturatedFeed(feed: SaturatedFeed): void {
  current = feed;
  emit();
}

export function clearSaturatedFeed(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function subscribeSaturatedFeed(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
