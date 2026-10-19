import type { VadoseMethod } from './compute';
import type { VadoseScenario } from './form';
import { createFeed } from '../vapor/feedStore';

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

const store = createFeed<VadoseFeed>();

export const getVadoseFeed = store.get;
export const setVadoseFeed = store.set;
export const clearVadoseFeed = store.clear;
export const subscribeVadoseFeed = store.subscribe;
