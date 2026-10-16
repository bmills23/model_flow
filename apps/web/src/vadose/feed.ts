import type { VadoseMethod } from './compute';
import type { VadoseScenario } from './form';

/**
 * The vadose result offered to the groundwater screen as its source. It holds the scenario, not
 * the flux, so the groundwater screen can run the vadose method for its own evaluation time. It
 * lives in memory for the session; a reload starts without a feed.
 */
export interface VadoseFeed {
  scenario: VadoseScenario;
  method: VadoseMethod;
  label: string;
}

let current: VadoseFeed | null = null;
const listeners = new Set<() => void>();

const emit = (): void => listeners.forEach((fn) => fn());

export function getVadoseFeed(): VadoseFeed | null {
  return current;
}

export function setVadoseFeed(feed: VadoseFeed): void {
  current = feed;
  emit();
}

export function clearVadoseFeed(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function subscribeVadoseFeed(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
