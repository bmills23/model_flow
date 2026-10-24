import type { EpcSpec } from '@model-flow/engine';
import { createChemicalFeed } from '../vapor/feedStore';
import type { RunInputRow } from '../project/runInputs';

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
  /**
   * Whole-house air for the 24 h/day indoor inhalation pathway (the RSL household term). Never sent as
   * shower-stall air: the stall pathway's exposure time is the bathing time.
   */
  indoorAir?: EpcSpec;
  /** Sprinkler spray air, an outdoor inhalation option. */
  outdoorSprinkler?: EpcSpec;
  /** Windblown particulate air, an outdoor inhalation option. */
  outdoorParticulate?: EpcSpec;
  /**
   * Linear model coefficients of the chosen methods: receptor air per unit source, dimensionless for
   * water to air and (kg/m3)/(kg/kg) for soil to air. Cleanup levels are the air level over these.
   */
  coefficients: {
    bathroomAir?: number;
    householdAir?: number;
    sprayAir?: number;
    particulateAir?: number;
  };
  /** The household method id that produced each coefficient, shown beside the cleanup source levels. */
  methods: {
    bathroomAir?: string;
    householdAir?: string;
    sprayAir?: string;
    particulateAir?: string;
  };
  /**
   * The inputs this result ran with, as labelled rows in the sending screen's words and units, recorded
   * when the result was sent (see `project/runInputs.ts`). Absent in a project saved before it existed.
   */
  runInputs?: RunInputRow[];
}

/** One slot per chemical (see `project/feedSlots.ts`). */
const household = createChemicalFeed<HouseholdRiskFeed>();
export const getHouseholdFeed = household.get;
export const getHouseholdFeedSlots = household.slots;
export const setHouseholdFeed = household.set;
export const clearHouseholdFeed = household.clear;
export const subscribeHouseholdFeed = household.subscribe;
