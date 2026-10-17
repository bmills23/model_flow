import {
  aboveSolubilityWarning,
  checkFinite,
  checkMixingFraction,
  checkNonNegative,
  checkPositive,
  checkTimes,
  lowDilutionWarning,
  QUASI_STEADY_LIMIT_S,
  type SurfaceWaterWarning,
} from './checks.js';

/**
 * Legacy well-mixed surface water box (`docs/methods/surface-water.md`, "Legacy method"). SI inputs:
 * flows m^3/s, concentrations kg/m^3, decay 1/s, volumes m^3.
 */

export interface DarcyDischargeInput {
  /** Bed hydraulic conductivity K_b, m/s. */
  bedConductivity: number;
  /** Thickness of aquifer discharging into the water body d, m. */
  thickness: number;
  /** Reach length L_r, m. */
  reachLength: number;
  /** Head gradient between the aquifer and the water surface i_b (dimensionless). */
  gradient: number;
}

/** Q_gw = K_b d L_r i_b. A gradient of zero or less is a losing reach: RangeError. */
export function darcyDischarge(i: DarcyDischargeInput): number {
  checkPositive('bed conductivity', i.bedConductivity);
  checkPositive('discharge thickness', i.thickness);
  checkPositive('reach length', i.reachLength);
  checkFinite('bed gradient', i.gradient);
  if (i.gradient <= 0) {
    throw new RangeError('bed gradient must be positive (a losing reach receives no groundwater)');
  }
  return i.bedConductivity * i.thickness * i.reachLength * i.gradient;
}

/** River body volume V_b = A L_r, m^3. */
export function riverVolume(crossSection: number, reachLength: number): number {
  checkPositive('river cross-section', crossSection);
  checkPositive('reach length', reachLength);
  return crossSection * reachLength;
}

export interface LegacyBoxInput {
  /** Upstream flow Q_u, m^3/s. */
  upstreamFlow: number;
  /** Upstream background concentration C_u, kg/m^3. */
  background: number;
  /** Mixing fraction f in (0, 1]. */
  mixingFraction: number;
  /** Groundwater discharge Q_gw, m^3/s. */
  groundwaterFlow: number;
  /** Groundwater concentration C_gw, kg/m^3. */
  groundwaterConcentration: number;
  /** First-order decay k, 1/s. */
  decay: number;
  /** Body volume V_b (river: A L_r; lake: entered), m^3. */
  bodyVolume: number;
  /** Solubility, kg/m^3, for the warning only. */
  solubility?: number;
}

export interface LegacyBoxResult {
  /** C_sw, kg/m^3. */
  concentration: number;
  /** W = f Q_u C_u + Q_gw C_gw, kg/s. */
  loading: number;
  /** Q_mix = f Q_u + Q_gw, m^3/s. */
  mixFlow: number;
  /** V = f V_b, m^3. */
  mixVolume: number;
  /** Hydraulic residence time V / (Q_mix + k V), s. */
  residenceTime: number;
  warnings: SurfaceWaterWarning[];
}

function checkBox(i: LegacyBoxInput): void {
  checkNonNegative('upstream flow', i.upstreamFlow);
  checkNonNegative('background concentration', i.background);
  checkMixingFraction(i.mixingFraction);
  checkNonNegative('groundwater flow', i.groundwaterFlow);
  checkNonNegative('groundwater concentration', i.groundwaterConcentration);
  checkNonNegative('decay rate', i.decay);
  checkNonNegative('body volume', i.bodyVolume);
  if (i.solubility !== undefined) checkNonNegative('solubility', i.solubility);
}

/** C_sw = W / (Q_mix + k V): the box re-evaluated at steady state for the current loading. */
export function legacyBox(i: LegacyBoxInput): LegacyBoxResult {
  checkBox(i);
  const mixFlow = i.mixingFraction * i.upstreamFlow + i.groundwaterFlow;
  const mixVolume = i.mixingFraction * i.bodyVolume;
  const denom = mixFlow + i.decay * mixVolume;
  if (mixVolume === 0 && i.decay !== 0) {
    throw new RangeError('a zero mixing volume with a nonzero decay is undefined');
  }
  if (denom <= 0) throw new RangeError('the box has no flow and no decay: concentration undefined');
  const loading =
    i.mixingFraction * i.upstreamFlow * i.background +
    i.groundwaterFlow * i.groundwaterConcentration;
  const concentration = loading / denom;
  const residenceTime = mixVolume / denom;
  const warnings = [
    ...lowDilutionWarning(i.groundwaterFlow, i.mixingFraction, i.upstreamFlow),
    ...aboveSolubilityWarning(
      'groundwater concentration',
      i.groundwaterConcentration,
      i.solubility,
    ),
    ...aboveSolubilityWarning('surface water concentration', concentration, i.solubility),
  ];
  if (residenceTime > QUASI_STEADY_LIMIT_S) {
    warnings.push({
      code: 'surfaceWater.quasi-steady',
      message:
        'the box residence time exceeds 30 d, so ignoring storage may misstate a changing loading',
    });
  }
  return { concentration, loading, mixFlow, mixVolume, residenceTime, warnings };
}

export interface LegacyBoxSeriesInput extends Omit<LegacyBoxInput, 'groundwaterConcentration'> {
  /** Sample times, s, strictly increasing. */
  times: readonly number[];
  /** Groundwater concentration at each time, kg/m^3. */
  groundwaterConcentrations: readonly number[];
}

export interface LegacyBoxSeriesResult {
  times: number[];
  concentrations: number[];
  warnings: SurfaceWaterWarning[];
}

/** Quasi-steady series: the box is evaluated at each sample time with no storage (RISC5 choice). */
export function legacyBoxSeries(i: LegacyBoxSeriesInput): LegacyBoxSeriesResult {
  checkTimes(i.times);
  if (i.groundwaterConcentrations.length !== i.times.length) {
    throw new RangeError('one groundwater concentration per time is required');
  }
  const { times, groundwaterConcentrations, ...rest } = i;
  const seen = new Map<string, SurfaceWaterWarning>();
  const concentrations = groundwaterConcentrations.map((c) => {
    const r = legacyBox({ ...rest, groundwaterConcentration: c });
    for (const w of r.warnings) seen.set(w.code, w);
    return r.concentration;
  });
  return { times: [...times], concentrations, warnings: [...seen.values()] };
}
