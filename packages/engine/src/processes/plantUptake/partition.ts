import { checkNonNegative, checkPositive } from './checks.js';

/**
 * Pore water concentration from soil: C_pw = C_s rho_b / (theta_w + rho_b K_d), the same partitioning
 * as the vadose and groundwater milestones. SI: C_s kg/kg, rho_b kg/m^3, K_d m^3/kg, result kg/m^3.
 */
export function poreWaterConcentration(
  soilConcentration_kg_per_kg: number,
  bulkDensity_kg_per_m3: number,
  waterFilledPorosity: number,
  kd_m3_per_kg: number,
): number {
  checkNonNegative('soil concentration', soilConcentration_kg_per_kg);
  checkPositive('bulk density', bulkDensity_kg_per_m3);
  checkNonNegative('water-filled porosity', waterFilledPorosity);
  checkNonNegative('Kd', kd_m3_per_kg);
  const denom = waterFilledPorosity + bulkDensity_kg_per_m3 * kd_m3_per_kg;
  if (denom <= 0) throw new RangeError('theta_w + rho_b K_d must be positive');
  return (soilConcentration_kg_per_kg * bulkDensity_kg_per_m3) / denom;
}
