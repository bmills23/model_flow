import type { EpcSpec } from '@model-flow/engine';
import { createFeed } from '../vapor/feedStore';

/**
 * The household screen's air concentrations offered to the exposure and risk screen (and its model
 * coefficients to the cleanup screen) for one chemical. EPCs are SI and carry the producing method id as
 * their origin; a series source gives a series EPC. Irrigation ingestion and dermal contact are not
 * offered: the nine exposure pathways have no irrigation contact pathway.
 */
export interface HouseholdRiskFeed {
  /** CAS-style id of the chemical, as the exposure and risk screen keys its chemicals. */
  chemicalId: string;
  label: string;
  /** Shower stall or house air for the shower inhalation pathway. */
  bathroomAir?: EpcSpec;
  /** Sprinkler spray air, an outdoor inhalation option. */
  outdoorSprinkler?: EpcSpec;
  /** Windblown particulate air, an outdoor inhalation option. */
  outdoorParticulate?: EpcSpec;
  /**
   * Linear model coefficients of the chosen methods: receptor air per unit source, dimensionless for
   * water to air and (kg/m3)/(kg/kg) for soil to air. Cleanup levels are the air level over these.
   */
  coefficients: { bathroomAir?: number; sprayAir?: number; particulateAir?: number };
}

const household = createFeed<HouseholdRiskFeed>();
export const getHouseholdFeed = household.get;
export const setHouseholdFeed = household.set;
export const clearHouseholdFeed = household.clear;
export const subscribeHouseholdFeed = household.subscribe;
