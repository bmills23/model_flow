export type WellMethod = 'legacy' | 'modern' | 'domenico';

/**
 * The receptor-well concentration history of the groundwater screen, offered to the exposure and
 * risk screen as a drinking-water and bathing concentration series. Times are in s from the start
 * of the release and concentrations in kg/m3 (SI, as the engine takes them). It lives in memory for
 * the session; a reload starts without a feed.
 */
export interface WellFeed {
  method: WellMethod;
  label: string;
  times: number[];
  values: number[];
}

let current: WellFeed | null = null;
const listeners = new Set<() => void>();

const emit = (): void => listeners.forEach((fn) => fn());

export function getWellFeed(): WellFeed | null {
  return current;
}

export function setWellFeed(feed: WellFeed): void {
  current = feed;
  emit();
}

export function clearWellFeed(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function subscribeWellFeed(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
