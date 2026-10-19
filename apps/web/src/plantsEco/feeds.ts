import type { ProduceBoundary, ProduceFactors } from '@model-flow/engine';
import { createFeed } from '../vapor/feedStore';

/**
 * The plants and ecology screen's homegrown produce inputs offered to the exposure and risk screen for
 * one chemical: the fresh-weight plant factors (soil-derived uptake only) and the intake of the receptor
 * the user described. Factors are kg produce per kg soil per unit soil concentration. The intake applies
 * to every life stage of every receptor that switches the produce pathway on.
 */
export interface ProduceRiskFeed {
  /** Database id of the chemical, as the exposure and risk screen keys its chemicals. */
  chemicalId: string;
  label: string;
  /** Registry id of the plant uptake method that produced the factors. */
  method: string;
  factors: ProduceFactors;
  intakes: ProduceBoundary;
  /** What the intake is, for the risk screen's note ("EFH chapter 13, ages 20 to 39", "user entered"). */
  intakeLabel: string;
}

const produce = createFeed<ProduceRiskFeed>();
export const getProduceFeed = produce.get;
export const setProduceFeed = produce.set;
export const clearProduceFeed = produce.clear;
export const subscribeProduceFeed = produce.subscribe;
