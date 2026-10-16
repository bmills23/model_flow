import { unitGradientMoisture, type HydraulicModel } from '../vadose/hydraulics.js';
import { equilibriumPoreWater, residualPhaseTest } from '../vadose/partitioning.js';
import { finite, nonNeg, pos } from './checks.js';

export interface SaturatedSoil {
  /** Porosity: saturated water content and transport porosity. */
  porosity: number;
  /** Bulk density, kg/m^3. */
  rhoB: number;
  /** Organic carbon fraction. */
  foc: number;
  /** Residual water content and van Genuchten n (region 1 moisture only). */
  thetaR: number;
  n: number;
  hydraulicModel?: HydraulicModel;
}

export interface SaturatedChemical {
  /** Total soil concentration, kg/kg. */
  F: number;
  /** Molar mass, kg/mol. */
  M: number;
  /** Aqueous solubility, kg/m^3. */
  S: number;
  /** Dimensionless Henry's constant. */
  H: number;
  /** Organic carbon partition coefficient, m^3/kg. */
  koc: number;
  /** Optional TPH mass fraction (kg/kg) and molar mass (kg/mol); give both or neither. */
  FT?: number;
  MT?: number;
}

/** State of one region: moisture, partitioning outcome and the pore-water concentration it holds. */
export interface RegionState {
  theta: number;
  thetaA: number;
  /** Equilibrium pore-water concentration without a separate phase, kg/m^3. */
  ceq: number;
  /** Mole fraction in the hydrocarbon and the Raoult effective solubility x S, kg/m^3. */
  x: number;
  effS: number;
  /** True when a separate phase is present in this region. */
  residual: boolean;
  /** Pore-water concentration the region releases, kg/m^3: x S with a separate phase, else ceq. */
  c: number;
  /** F / F_T (0 without TPH). */
  tphRatio: number;
  /** Soil saturation limit of the region, kg/kg. */
  fSat: number;
}

export function checkSoilAndChemical(soil: SaturatedSoil, c: SaturatedChemical): void {
  finite('soil.porosity', soil.porosity);
  if (!(soil.porosity > 0 && soil.porosity <= 1)) {
    throw new RangeError(`porosity must be in (0, 1], got ${soil.porosity}`);
  }
  pos('soil.rhoB', soil.rhoB);
  nonNeg('soil.foc', soil.foc);
  finite('soil.thetaR', soil.thetaR);
  if (!(soil.thetaR >= 0 && soil.thetaR < soil.porosity)) {
    throw new RangeError(`thetaR must be in [0, porosity), got ${soil.thetaR}`);
  }
  finite('soil.n', soil.n);
  if (!(soil.n > 1)) throw new RangeError(`van Genuchten n must exceed 1, got ${soil.n}`);
  nonNeg('chemical.F', c.F);
  pos('chemical.M', c.M);
  pos('chemical.S', c.S);
  nonNeg('chemical.H', c.H);
  nonNeg('chemical.koc', c.koc);
  if (c.FT !== undefined || c.MT !== undefined) {
    if (c.FT === undefined || c.MT === undefined) {
      throw new RangeError('give both the TPH mass fraction and the TPH molar mass, or neither');
    }
    pos('chemical.FT', c.FT);
    pos('chemical.MT', c.MT);
    if (c.F > c.FT) throw new RangeError('F must not exceed the TPH mass fraction');
  }
}

/**
 * Soil saturation limit, kg/kg: the soil concentration at which the partitioning prediction reaches
 * the effective solubility x S (SSG 1996 equation 9 with x = 1):
 * F_sat = x S (rho_b K_d + theta + theta_a H) / rho_b.
 */
export function soilSaturationConcentration(p: {
  S: number;
  x: number;
  rhoB: number;
  kd: number;
  theta: number;
  thetaA: number;
  H: number;
}): number {
  pos('S', p.S);
  finite('x', p.x);
  if (!(p.x > 0 && p.x <= 1)) throw new RangeError(`mole fraction must be in (0, 1], got ${p.x}`);
  pos('rhoB', p.rhoB);
  nonNeg('kd', p.kd);
  nonNeg('theta', p.theta);
  nonNeg('thetaA', p.thetaA);
  nonNeg('H', p.H);
  return (p.x * p.S * (p.rhoB * p.kd + p.theta + p.thetaA * p.H)) / p.rhoB;
}

function regionState(
  soil: SaturatedSoil,
  c: SaturatedChemical,
  theta: number,
  thetaA: number,
): RegionState {
  const kd = c.koc * soil.foc;
  const ceq = equilibriumPoreWater({ F: c.F, rhoB: soil.rhoB, kd, theta, thetaA, H: c.H });
  const test = residualPhaseTest({
    F: c.F,
    M: c.M,
    S: c.S,
    ceq,
    ...(c.FT !== undefined && c.MT !== undefined ? { FT: c.FT, MT: c.MT } : {}),
  });
  const fSat =
    test.x > 0
      ? soilSaturationConcentration({
          S: c.S,
          x: test.x,
          rhoB: soil.rhoB,
          kd,
          theta,
          thetaA,
          H: c.H,
        })
      : 0;
  return {
    theta,
    thetaA,
    ceq,
    x: test.x,
    effS: test.effS,
    residual: test.residual,
    c: test.cs0,
    tphRatio: test.tphRatio,
    fSat,
  };
}

export interface RegionInput {
  soil: SaturatedSoil;
  chemical: SaturatedChemical;
  /** Hydraulic conductivity of the aquifer, used as Ks of region 1, m/s. */
  conductivity: number;
  /** Infiltration (Darcy flux), m/s. */
  infiltration: number;
  /** Whether the source has an unsaturated part at low water, and a saturated part at high water. */
  unsaturatedExists: boolean;
  saturatedExists: boolean;
  /** What to do when infiltration reaches the conductivity: reduce it (legacy) or refuse (modern). */
  onClamp: 'clamp' | 'throw';
}

export interface RegionConcentrations {
  /** Region 1 (above the water table); null without infiltration or without an unsaturated part. */
  unsaturated: RegionState | null;
  /** Region 2 (below the water table); null when the source is never submerged. */
  saturated: RegionState | null;
  /** Infiltration actually used, m/s (reduced to K when it exceeds it on the legacy method). */
  infiltration: number;
  /** True when the entered infiltration exceeded the conductivity and was reduced. */
  clamped: boolean;
}

/** Pore-water concentrations of regions 1 and 2. */
export function regionConcentrations(input: RegionInput): RegionConcentrations {
  const { soil, chemical: c } = input;
  checkSoilAndChemical(soil, c);
  pos('aquifer.conductivity', input.conductivity);
  nonNeg('infiltration', input.infiltration);
  let q = input.infiltration;
  const exceeds = q > input.conductivity;
  let unsaturated: RegionState | null = null;
  if (q > 0 && input.unsaturatedExists) {
    if (q >= input.conductivity && input.onClamp === 'throw') {
      throw new RangeError(
        `infiltration (${q} m/s) must be below the hydraulic conductivity (${input.conductivity} m/s)`,
      );
    }
    const m = unitGradientMoisture(
      { thetaS: soil.porosity, thetaR: soil.thetaR, n: soil.n, Ks: input.conductivity },
      q,
      soil.hydraulicModel ?? 'brooksCorey1964',
    );
    if (m.clamped) q = Math.min(q, input.conductivity);
    unsaturated = regionState(soil, c, m.theta, soil.porosity - m.theta);
  }
  const saturated = input.saturatedExists ? regionState(soil, c, soil.porosity, 0) : null;
  return {
    unsaturated,
    saturated,
    infiltration: q,
    clamped: exceeds && unsaturated !== null,
  };
}
