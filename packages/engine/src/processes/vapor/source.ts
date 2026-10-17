import type { Warning } from '../../registry/index.js';
import { effectiveSolubility, equilibriumPoreWater, residualPhaseTest } from '../vadose/index.js';
import { R_GAS, checkNonNeg, checkPos } from './units.js';

/**
 * Source vapor concentration C_vs (kg/m^3) for the three source kinds shared by every vapor method.
 */

export interface SoilSourceInput {
  kind: 'soil';
  /** Chemical mass fraction in soil, kg/kg. */
  F: number;
  rhoB: number;
  /** Koc * foc, m^3/kg. */
  kd: number;
  theta: number;
  thetaA: number;
  /** Dimensionless Henry's constant. */
  H: number;
  /** Molar mass, kg/mol. */
  M: number;
  /** Aqueous solubility, kg/m^3. */
  S: number;
  FT?: number;
  MT?: number;
  /** Pure-component vapor pressure, Pa, for the comparison form only. */
  vaporPressure?: number;
  /** Temperature, K, for the comparison form only. */
  temperature?: number;
}

export interface SoilGasSourceInput {
  kind: 'soilGas';
  /** Measured soil gas concentration, kg/m^3. */
  csg: number;
}

export interface GroundwaterSourceInput {
  kind: 'groundwater';
  /** Groundwater concentration, kg/m^3. */
  cgw: number;
  H: number;
  /** Solubility, kg/m^3, for the above-solubility warning. */
  S?: number;
  /** Mole fraction in a mixture (default 1). */
  x?: number;
}

export type SourceVaporInput = SoilSourceInput | SoilGasSourceInput | GroundwaterSourceInput;

export interface SourceVaporResult {
  /** Source vapor concentration, kg/m^3. */
  cvs: number;
  /** Pore-water (soil) or groundwater concentration behind it, kg/m^3 (undefined for soil gas). */
  poreWater?: number;
  residual: boolean;
  /** Mole fraction used (1 without TPH). */
  x: number;
  /** x P_v M / (R T), kg/m^3: reported for comparison, never used (DEFAULT ruling 4). */
  vaporPressureForm?: number;
  warnings: Warning[];
}

export function sourceVapor(p: SourceVaporInput): SourceVaporResult {
  const warnings: Warning[] = [];
  if (p.kind === 'soilGas') {
    checkNonNeg('csg', p.csg);
    return { cvs: p.csg, residual: false, x: 1, warnings };
  }
  if (p.kind === 'groundwater') {
    checkNonNeg('cgw', p.cgw);
    checkNonNeg('H', p.H);
    const x = p.x ?? 1;
    if (p.S !== undefined) {
      const effS = effectiveSolubility(p.S, x);
      if (p.cgw > effS) {
        warnings.push({
          code: 'vapor.source-above-solubility',
          message: `groundwater concentration ${p.cgw} kg/m^3 exceeds the effective solubility ${effS} kg/m^3; the vapor source is not clamped`,
        });
      }
    }
    return { cvs: p.H * p.cgw, poreWater: p.cgw, residual: false, x, warnings };
  }
  checkNonNeg('H', p.H);
  const ceq = equilibriumPoreWater({
    F: p.F,
    rhoB: p.rhoB,
    kd: p.kd,
    theta: p.theta,
    thetaA: p.thetaA,
    H: p.H,
  });
  const test = residualPhaseTest({
    F: p.F,
    M: p.M,
    S: p.S,
    ceq,
    ...(p.FT !== undefined && p.MT !== undefined ? { FT: p.FT, MT: p.MT } : {}),
  });
  if (test.residual) {
    warnings.push({
      code: 'vapor.residual-phase',
      message: `a separate phase is present: mole fraction ${test.x}, effective solubility ${test.effS} kg/m^3, equilibrium pore water ${test.ceq} kg/m^3; source vapor is fixed at x S H`,
    });
  }
  const result: SourceVaporResult = {
    cvs: p.H * test.cs0,
    poreWater: test.cs0,
    residual: test.residual,
    x: test.x,
    warnings,
  };
  if (p.vaporPressure !== undefined && p.temperature !== undefined) {
    checkNonNeg('vaporPressure', p.vaporPressure);
    checkPos('temperature', p.temperature);
    result.vaporPressureForm = (test.x * p.vaporPressure * p.M) / (R_GAS * p.temperature);
  }
  return result;
}
