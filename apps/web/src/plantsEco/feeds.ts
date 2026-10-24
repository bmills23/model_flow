import type { ProduceBoundary, ProduceFactors } from '@model-flow/engine';
import { createChemicalFeed, createFeed } from '../vapor/feedStore';
import type { RunInputRow } from '../project/runInputs';

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
  /**
   * The plant uptake engine's warnings for these factors (for example log Kow outside the fitted
   * range), carried so the cleanup screen and report show what the plants screen showed. Absent in
   * a feed saved before the cleanup screen read it.
   */
  warnings?: { code: string; message: string }[];
  /**
   * The inputs this result ran with, as labelled rows in the sending screen's words and units, recorded
   * when the result was sent (see `project/runInputs.ts`). Absent in a project saved before it existed.
   */
  runInputs?: RunInputRow[];
}

/** One slot per chemical (see `project/feedSlots.ts`). */
const produce = createChemicalFeed<ProduceRiskFeed>();
export const getProduceFeed = produce.get;
export const getProduceFeedSlots = produce.slots;
export const setProduceFeed = produce.set;
export const clearProduceFeed = produce.clear;
export const subscribeProduceFeed = produce.subscribe;

/**
 * The total TPH cleanup level of the composition on the plants and ecology screen, offered to the
 * cleanup screen. Levels are mg/kg dry soil at the target hazard index; the fraction levels are the
 * ones the user entered, so the cleanup screen can show what the total rests on.
 */
export interface TphRiskFeed {
  /** Registry id of the fraction set (`tph.tphcwg` or `tph.madep`). */
  methodId: string;
  label: string;
  targetHazardIndex: number;
  /** Total TPH level in soil, mg/kg. */
  totalMgPerKg: number;
  fractions: {
    label: string;
    family: 'aliphatic' | 'aromatic';
    massFraction: number;
    mapped: boolean;
    levelMgPerKg: number | null;
  }[];
  /** Fractions left out of the total because no RSL surrogate is mapped. */
  unmapped: string[];
  warnings: { code: string; message: string }[];
}

/** A composition, not one chemical: a single slot. */
const tph = createFeed<TphRiskFeed>();
export const getTphFeed = tph.get;
export const setTphFeed = tph.set;
export const clearTphFeed = tph.clear;
export const subscribeTphFeed = tph.subscribe;
