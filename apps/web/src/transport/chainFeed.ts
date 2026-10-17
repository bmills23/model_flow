import type { Scenario } from './form';

/**
 * The groundwater screen's aquifer, source footprint, receptor well and evaluation time, offered to
 * the cleanup levels screen as the transport that carries a source to the well. It lives in memory
 * for the session (the scenario holds a closure, so it is not serialisable); a reload starts without
 * a feed.
 */
export interface TransportFeed {
  scenario: Scenario;
  label: string;
}

let current: TransportFeed | null = null;
const listeners = new Set<() => void>();

const emit = (): void => listeners.forEach((fn) => fn());

export function getTransportFeed(): TransportFeed | null {
  return current;
}

export function setTransportFeed(feed: TransportFeed): void {
  current = feed;
  emit();
}

export function clearTransportFeed(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function subscribeTransportFeed(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
