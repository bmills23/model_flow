import type { Scenario } from './form';
import { createChemicalFeed } from '../vapor/feedStore';

/**
 * The groundwater screen's aquifer, source footprint, receptor well and evaluation time, offered to
 * the cleanup levels screen as the transport that carries a source to the well. It lives in memory
 * for the session (the scenario holds a closure, so it is not serialisable); a reload starts without
 * a feed.
 */
export interface TransportFeed {
  scenario: Scenario;
  label: string;
  /** Database id of the chemical the screen was set to; absent when entered by hand. */
  chemicalId?: string;
}

/** One slot per chemical (see `project/feedSlots.ts`); `getTransportFeed(chemicalId)` reads a consumer's slot. */
const store = createChemicalFeed<TransportFeed>();

export const getTransportFeed = store.get;
export const getTransportFeedSlots = store.slots;
export const setTransportFeed = store.set;
export const clearTransportFeed = store.clear;
export const subscribeTransportFeed = store.subscribe;
