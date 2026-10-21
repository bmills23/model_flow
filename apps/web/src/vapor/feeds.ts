import type { EpcSpec } from '@model-flow/engine';
import { createFeed } from './feedStore';
import type { VaporCoefficients } from './coefficients';
import type { SourceSeries } from './series';

/**
 * Sources other screens offer the vapor screen, one store per origin so offering one does not drop
 * another: the vadose source pore water, the groundwater at the water table, and the saturated
 * source's region above the water table.
 */
const vadose = createFeed<SourceSeries>();
export const getVadoseVaporFeed = vadose.get;
export const setVadoseVaporFeed = vadose.set;
export const clearVadoseVaporFeed = vadose.clear;
export const subscribeVadoseVaporFeed = vadose.subscribe;

const waterTable = createFeed<SourceSeries>();
export const getWaterTableFeed = waterTable.get;
export const setWaterTableFeed = waterTable.set;
export const clearWaterTableFeed = waterTable.clear;
export const subscribeWaterTableFeed = waterTable.subscribe;

const saturated = createFeed<SourceSeries>();
export const getSaturatedVaporFeed = saturated.get;
export const setSaturatedVaporFeed = saturated.set;
export const clearSaturatedVaporFeed = saturated.clear;
export const subscribeSaturatedVaporFeed = saturated.subscribe;

/**
 * The vapor screen's air concentrations offered to the exposure and risk screen for one chemical, as
 * exposure point concentrations in SI whose origin is the producing method id.
 */
export interface VaporRiskFeed {
  /** CAS-style id of the chemical, as the exposure and risk screen keys its chemicals. */
  chemicalId: string;
  label: string;
  indoor?: EpcSpec;
  outdoor?: EpcSpec;
  /**
   * Air concentration per unit source of the indoor and outdoor paths above, for the cleanup screen's
   * vapor source levels (wave K slice K1). Absent in a project saved before it existed.
   */
  coefficients?: VaporCoefficients;
}

const risk = createFeed<VaporRiskFeed>();
export const getVaporRiskFeed = risk.get;
export const setVaporRiskFeed = risk.set;
export const clearVaporRiskFeed = risk.clear;
export const subscribeVaporRiskFeed = risk.subscribe;
