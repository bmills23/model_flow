import { checkFinite, checkNonNegative, checkPositive } from './checks.js';

/**
 * One well-mixed leaf and stem compartment (structure of Trapp and Matthies 1995):
 *   M dC/dt = TSCF Q C_pw + g A C_a - (g A / K_la) C - lambda M C
 * C fresh-weight plant concentration (kg/kg), M plant mass (kg), Q transpiration (m^3/d), g
 * conductance (m/d), A leaf area (m^2), C_a air concentration (kg/m^3), K_la the leaf-air partition
 * coefficient (kg/kg per kg/m^3, i.e. m^3/kg), lambda the first-order loss (1/d).
 * TSCF and K_la are inputs: their published regressions were not readable in slice E1 (see DECISIONS).
 */
export interface LeafParameters {
  /** Transpiration stream concentration factor, 0 to 1 for a neutral chemical. */
  tscf: number;
  transpiration_m3_per_d: number;
  conductance_m_per_d: number;
  leafArea_m2: number;
  mass_kg: number;
  kLeafAir_m3_per_kg: number;
  /** Growth dilution plus metabolism, 1/d. */
  lossRate_per_d: number;
}

export interface LeafSteadyState {
  concentration: number;
  /** Source term, kg/d. */
  source_kg_per_d: number;
  /** Time constant M / k, d. */
  timeConstant_d: number;
}

function checkLeaf(p: LeafParameters): void {
  checkFinite('TSCF', p.tscf);
  if (p.tscf < 0 || p.tscf > 1) throw new RangeError('TSCF must be in [0, 1]');
  checkNonNegative('transpiration rate', p.transpiration_m3_per_d);
  checkNonNegative('conductance', p.conductance_m_per_d);
  checkNonNegative('leaf area', p.leafArea_m2);
  checkPositive('plant mass', p.mass_kg);
  checkPositive('leaf-air partition coefficient', p.kLeafAir_m3_per_kg);
  checkNonNegative('loss rate', p.lossRate_per_d);
}

export function leafSteadyState(
  p: LeafParameters,
  poreWater_kg_per_m3: number,
  air_kg_per_m3: number,
): LeafSteadyState {
  checkLeaf(p);
  checkNonNegative('pore water concentration', poreWater_kg_per_m3);
  checkNonNegative('air concentration', air_kg_per_m3);
  const gA = p.conductance_m_per_d * p.leafArea_m2;
  const source = p.tscf * p.transpiration_m3_per_d * poreWater_kg_per_m3 + gA * air_kg_per_m3;
  const k = gA / p.kLeafAir_m3_per_kg + p.lossRate_per_d * p.mass_kg;
  if (k <= 0)
    throw new RangeError('the leaf has no loss (g A / K_la + lambda M is zero): no steady state');
  return { concentration: source / k, source_kg_per_d: source, timeConstant_d: p.mass_kg / k };
}

/** Exact solution for constant inputs from an initial concentration (default zero) at time t (d). */
export function leafTimeDependent(
  p: LeafParameters,
  poreWater_kg_per_m3: number,
  air_kg_per_m3: number,
  time_d: number,
  initial_kg_per_kg = 0,
): LeafSteadyState {
  checkNonNegative('time', time_d);
  checkNonNegative('initial concentration', initial_kg_per_kg);
  const ss = leafSteadyState(p, poreWater_kg_per_m3, air_kg_per_m3);
  const decay = Math.exp(-time_d / ss.timeConstant_d);
  return {
    ...ss,
    concentration: ss.concentration + (initial_kg_per_kg - ss.concentration) * decay,
  };
}
