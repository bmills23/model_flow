import type { SaturatedSourceInput } from '@model-flow/engine';
import { createFeed } from '../vapor/feedStore';

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
  /** Database id of the chemical the screen was set to; absent when entered by hand or untagged. */
  chemicalId?: string;
}

const store = createFeed<SaturatedFeed>();

export const getSaturatedFeed = store.get;
export const setSaturatedFeed = store.set;
export const clearSaturatedFeed = store.clear;
export const subscribeSaturatedFeed = store.subscribe;
