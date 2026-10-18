import { checkNonNegative, checkPositive } from '../plantUptake/checks.js';
import { preyConcentration, type UptakeModel } from './uptake.js';

export interface FoodItem {
  name: string;
  /** Proportion of the food intake, 0 to 1. */
  dietFraction: number;
  model: UptakeModel;
}

export interface WildlifeDoseInput {
  /** Food ingestion rate, kg dry weight per kg body weight per day. */
  foodIngestion_kg_per_kg_d: number;
  /** Incidental soil ingestion as a proportion of the diet, 0 to 1. */
  soilFraction: number;
  /** Area use factor, 0 to 1 (1 for the Eco-SSL derivation). */
  areaUseFactor: number;
  items: FoodItem[];
  /** Toxicity reference value, kg per kg body weight per day. */
  trv_kg_per_kg_d: number;
}

function check01(label: string, x: number): void {
  checkNonNegative(label, x);
  if (x > 1) throw new RangeError(`${label} must not exceed 1`);
}

function checkInput(input: WildlifeDoseInput): void {
  checkPositive('food ingestion rate', input.foodIngestion_kg_per_kg_d);
  check01('soil fraction of the diet', input.soilFraction);
  check01('area use factor', input.areaUseFactor);
  checkPositive('toxicity reference value', input.trv_kg_per_kg_d);
  for (const item of input.items) check01(`diet fraction of ${item.name}`, item.dietFraction);
}

/** Daily dose, kg per kg body weight per day: [sum(C_i P_i) + C_s P_s] IR AUF. */
export function wildlifeDose(input: WildlifeDoseInput, soil_kg_per_kg: number): number {
  checkInput(input);
  checkNonNegative('soil concentration', soil_kg_per_kg);
  let intake = soil_kg_per_kg * input.soilFraction;
  for (const item of input.items) {
    intake += preyConcentration(item.model, soil_kg_per_kg) * item.dietFraction;
  }
  return intake * input.foodIngestion_kg_per_kg_d * input.areaUseFactor;
}

export function wildlifeHazardQuotient(input: WildlifeDoseInput, soil_kg_per_kg: number): number {
  return wildlifeDose(input, soil_kg_per_kg) / input.trv_kg_per_kg_d;
}

/**
 * Soil concentration (kg/kg dry weight) at which the dose equals the TRV, by geometric bisection on the
 * monotone dose. Null when the dose already exceeds the TRV at 1e-15 kg/kg or never reaches it by 1 kg/kg.
 * This is a screening back-calculation reproducing the guidance's wildlife Eco-SSL, not a cleanup level.
 */
export function backCalculateEcoSsl(input: WildlifeDoseInput): number | null {
  checkInput(input);
  let lo = 1e-15;
  let hi = 1;
  if (wildlifeHazardQuotient(input, lo) >= 1) return null;
  if (wildlifeHazardQuotient(input, hi) < 1) return null;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (wildlifeHazardQuotient(input, mid) < 1) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}
