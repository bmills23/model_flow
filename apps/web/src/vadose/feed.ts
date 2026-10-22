import type { VadoseMethod } from './compute';
import type { VadoseScenario } from './form';
import { createChemicalFeed } from '../vapor/feedStore';

/**
 * The vadose result offered to the groundwater screen as its source. It holds the scenario, not
 * the flux, so the groundwater screen can run the vadose method for its own evaluation time. It
 * lives in memory for the session; a reload starts without a feed.
 */
export interface VadoseFeed {
  scenario: VadoseScenario;
  method: VadoseMethod;
  label: string;
  /** Database id of the chemical the screen was set to; absent when entered by hand or untagged. */
  chemicalId?: string;
}

/** One slot per chemical (see `project/feedSlots.ts`); `getVadoseFeed(chemicalId)` reads a consumer's slot. */
const store = createChemicalFeed<VadoseFeed>();

export const getVadoseFeed = store.get;
export const getVadoseFeedSlots = store.slots;
export const setVadoseFeed = store.set;
export const clearVadoseFeed = store.clear;
export const subscribeVadoseFeed = store.subscribe;
