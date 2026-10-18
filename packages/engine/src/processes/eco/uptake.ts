import { checkNonNegative, checkPositive } from '../plantUptake/checks.js';

/**
 * Soil-to-biota uptake models of the Eco-SSL guidance, as the per-chemical documents tabulate them.
 * The regression constants are defined for concentrations in mg/kg dry weight, so the evaluation converts
 * at the model boundary; everything outside this file is kg/kg.
 *
 *   ratio:  Bi = a C            (C = cdiet * soil, cdiet defaults to 1)
 *   ln:     ln Bi = a ln(soil) + b
 *   affine: Bi = a C + b        (b in mg/kg)
 */
export type UptakeModel =
  | { form: 'ratio'; a: number; cdiet?: number }
  | { form: 'ln'; a: number; b: number }
  | { form: 'affine'; a: number; b: number; cdiet?: number };

const MG_PER_KG_TO_KG_PER_KG = 1e-6;

/** Food item concentration (kg/kg dry weight) for a soil concentration (kg/kg dry weight). */
export function preyConcentration(model: UptakeModel, soil_kg_per_kg: number): number {
  checkNonNegative('soil concentration', soil_kg_per_kg);
  checkNonNegative('uptake coefficient a', model.a);
  if (model.form === 'ln') {
    checkPositive('soil concentration for a log-linear uptake model', soil_kg_per_kg);
    const soilMg = soil_kg_per_kg / MG_PER_KG_TO_KG_PER_KG;
    return Math.exp(model.a * Math.log(soilMg) + model.b) * MG_PER_KG_TO_KG_PER_KG;
  }
  const cdiet = model.cdiet ?? 1;
  checkNonNegative('diet concentration factor', cdiet);
  const c = cdiet * soil_kg_per_kg;
  if (model.form === 'ratio') return model.a * c;
  return model.a * c + model.b * MG_PER_KG_TO_KG_PER_KG;
}
