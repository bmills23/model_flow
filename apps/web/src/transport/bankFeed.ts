import type { Scenario } from './form';
import { createFeed } from '../vapor/feedStore';

/**
 * The groundwater run of the transport screen, offered to the surface water screen as the plume that
 * discharges at the bank. It carries the whole scenario (plain data, so it reaches the worker); the
 * surface water screen reads the AT123D-class concentration on the bank plane from it. It lives in
 * memory for the session; a reload starts without a feed.
 */
export interface BankFeed {
  scenario: Omit<Scenario, 'zOf'>;
  label: string;
  /** Database id of the chemical the transport screen was set to; absent when entered by hand or untagged. */
  chemicalId?: string;
}

const store = createFeed<BankFeed>();

export const getBankFeed = store.get;
export const setBankFeed = store.set;
export const clearBankFeed = store.clear;
export const subscribeBankFeed = store.subscribe;
