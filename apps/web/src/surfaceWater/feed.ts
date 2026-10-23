import { createChemicalFeed } from '../vapor/feedStore';
import type { SurfaceWaterCoefficient, SurfaceWaterSolveState } from './coefficient';
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
  /**
   * The run's own request, for the cleanup screen to solve a source level on a path that is not linear in
   * the source (an upstream background, a plume fed by a vadose or saturated source screen) and to carry a
   * soil source to this surface water (wave V slice V2b). Optional state inside the current format version;
   * a feed saved without it asks to be sent again.
   */
  solve?: SurfaceWaterSolveState;
  /**
   * Database id of the chemical the run was made for, taken from the transport bank run it is linked
   * to; absent when the run is not linked or the bank run was untagged.
   */
  chemicalId?: string;
}

/** One slot per chemical (see `project/feedSlots.ts`); `getSurfaceWaterFeed(chemicalId)` reads a consumer's slot. */
const store = createChemicalFeed<SurfaceWaterFeed>();

export const getSurfaceWaterFeed = store.get;
export const getSurfaceWaterFeedSlots = store.slots;
export const setSurfaceWaterFeed = store.set;
export const clearSurfaceWaterFeed = store.clear;
export const subscribeSurfaceWaterFeed = store.subscribe;
