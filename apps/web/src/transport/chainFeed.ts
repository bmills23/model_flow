import type { Scenario } from './form';
import { createFeed } from '../vapor/feedStore';

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

const store = createFeed<TransportFeed>();

export const getTransportFeed = store.get;
export const setTransportFeed = store.set;
export const clearTransportFeed = store.clear;
export const subscribeTransportFeed = store.subscribe;
