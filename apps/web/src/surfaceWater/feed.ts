import { createFeed } from '../vapor/feedStore';
import type { SurfaceWaterCoefficient } from './coefficient';
export type SurfaceWaterFeedMethod = 'well-mixed' | 'mass-discharge';

/**
 * The surface water concentration history of the surface water screen, offered to the exposure and risk
 * screen as the swimming concentration series. Times are in s from the start of the release and
 * concentrations in kg/m3 (SI, as the engine takes them). `origin` is the registered method id the
 * series came from, carried onto the exposure point concentration. It lives in memory for the session.
 */
export interface SurfaceWaterFeed {
  method: SurfaceWaterFeedMethod;
  origin: string;
  label: string;
  times: number[];
  values: number[];
  /**
   * Peak surface water per unit of the groundwater source that drove the run, for the cleanup screen's
   * source levels. Absent on a feed saved before it existed (the cleanup panel then says so).
   */
  coefficient?: SurfaceWaterCoefficient;
}

const store = createFeed<SurfaceWaterFeed>();

export const getSurfaceWaterFeed = store.get;
export const setSurfaceWaterFeed = store.set;
export const clearSurfaceWaterFeed = store.clear;
export const subscribeSurfaceWaterFeed = store.subscribe;
