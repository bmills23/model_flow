import type { SwResult } from './compute';
import type { SurfaceWaterFeedMethod } from './feed';
import type { SwRequest } from './inputs';

/**
 * What the cleanup screen needs from a surface water run to turn a surface water level into the
 * groundwater source level behind it: the peak surface water concentration per unit of the dissolved
 * groundwater source that drove the run.
 *
 * The source is the groundwater concentration the run was driven by, in kg/m3 (printed in mg/L):
 * the typed groundwater concentration of an unlinked run, or the held source concentration c0 of a
 * linked transport run (a mass rate source is the same source, c0 = rate over the Darcy flux times the
 * source cross-section). Every step of either chain (AT123D-class transport, the legacy box, the
 * modern mass discharge) is linear in that source, so the surface water series scales with it and its
 * peak over the source is a constant: doubling the source doubles the peak (coefficient.test.ts).
 * It is not quantified where the chain is not proportional to the source (an upstream background
 * adds a fixed part) or where the source is not a groundwater concentration (a vadose or saturated
 * fed plume, whose soil or leachate concentration the run does not record).
 */
export interface SurfaceWaterCoefficient {
  /** Peak surface water over source, dimensionless (kg/m3 per kg/m3); null when not quantified. */
  value: number | null;
  /** Why the coefficient is not quantified; null when it is. */
  reason: string | null;
  /** The registered method id of the series it was taken from (the feed origin). */
  method: string;
  /** The medium of the source the coefficient divides by. */
  sourceMedium: 'groundwater';
  /** Unit the source level is printed in; the coefficient itself is a ratio. */
  sourceUnit: 'mg/L';
  /** The source the run was driven by, kg/m3; absent when the run has none. */
  source?: number;
  /** Solubility entered on the run, kg/m3, when one was entered. */
  solubility?: number;
}

const notQuantified = (
  base: Omit<SurfaceWaterCoefficient, 'value' | 'reason'>,
  reason: string,
): SurfaceWaterCoefficient => ({ ...base, value: null, reason });

export function surfaceWaterCoefficient(
  request: SwRequest,
  result: SwResult,
  method: SurfaceWaterFeedMethod,
): SurfaceWaterCoefficient {
  const series = method === 'well-mixed' ? result.legacy.surfaceWater : result.modern.surfaceWater;
  const link = request.link !== null && result.linked ? request.link : null;
  const source = link ? link.scenario.c0 : request.groundwaterConcentration;
  const base: Omit<SurfaceWaterCoefficient, 'value' | 'reason'> = {
    method: `surfaceWater.${method}`,
    sourceMedium: 'groundwater',
    sourceUnit: 'mg/L',
    ...(Number.isFinite(source) ? { source } : {}),
    ...(request.solubility !== undefined ? { solubility: request.solubility } : {}),
  };
  if (link?.scenario.fed) {
    return notQuantified(
      base,
      'The plume is fed by a vadose or saturated source screen, so the run does not hold a groundwater source concentration to divide by.',
    );
  }
  if (request.background > 0) {
    return notQuantified(
      base,
      'The run has an upstream background concentration, which adds a fixed part to the surface water concentration, so the peak is not proportional to the groundwater source.',
    );
  }
  const peak = series.reduce((a, b) => Math.max(a, b), 0);
  if (!(source > 0) || !(peak > 0)) {
    return notQuantified(
      base,
      'The run has no groundwater source or transfers nothing to the surface water (coefficient 0), so there is no risk-based source level.',
    );
  }
  return { ...base, value: peak / source, reason: null };
}
