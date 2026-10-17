import type { Scenario } from './form';

/**
 * The groundwater run of the transport screen, offered to the surface water screen as the plume that
 * discharges at the bank. It carries the whole scenario (plain data, so it reaches the worker); the
 * surface water screen reads the AT123D-class concentration on the bank plane from it. It lives in
 * memory for the session; a reload starts without a feed.
 */
export interface BankFeed {
  scenario: Omit<Scenario, 'zOf'>;
  label: string;
}

let current: BankFeed | null = null;
const listeners = new Set<() => void>();

const emit = (): void => listeners.forEach((fn) => fn());

export function getBankFeed(): BankFeed | null {
  return current;
}

export function setBankFeed(feed: BankFeed): void {
  current = feed;
  emit();
}

export function clearBankFeed(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function subscribeBankFeed(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
