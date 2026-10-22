import { createFeed } from '../vapor/feedStore';
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
  /** Database id of the chemical the screen was set to; absent when entered by hand or sent before the tag existed. */
  chemicalId?: string;
}

const store = createFeed<WellFeed>();

export const getWellFeed = store.get;
export const setWellFeed = store.set;
export const clearWellFeed = store.clear;
export const subscribeWellFeed = store.subscribe;
