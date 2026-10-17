/** Shared validity checks and warnings of the surface water kernels (RangeError, never a silent fix). */

export interface SurfaceWaterWarning {
  code: string;
  message: string;
}

export function checkFinite(label: string, x: number): void {
  if (!Number.isFinite(x)) throw new RangeError(`${label} must be finite`);
}

export function checkNonNegative(label: string, x: number): void {
  checkFinite(label, x);
  if (x < 0) throw new RangeError(`${label} must not be negative`);
}

export function checkPositive(label: string, x: number): void {
  checkFinite(label, x);
  if (x <= 0) throw new RangeError(`${label} must be positive`);
}

/** The mixing fraction f is in (0, 1]. */
export function checkMixingFraction(f: number): void {
  checkFinite('mixing fraction', f);
  if (f <= 0 || f > 1) throw new RangeError('mixing fraction must be in (0, 1]');
}

/** Sample times are finite and strictly increasing. */
export function checkTimes(times: readonly number[]): void {
  if (times.length === 0) throw new RangeError('a series needs at least one time');
  for (let i = 0; i < times.length; i++) {
    checkFinite('time', times[i] as number);
    if (i > 0 && (times[i] as number) <= (times[i - 1] as number)) {
      throw new RangeError('times must be strictly increasing');
    }
  }
}

/** Warning when the groundwater supplies most of the mixing flow (Q_gw > f Q_u). */
export function lowDilutionWarning(
  gwFlow: number,
  mixingFraction: number,
  upstreamFlow: number,
): SurfaceWaterWarning[] {
  return gwFlow > mixingFraction * upstreamFlow
    ? [
        {
          code: 'surfaceWater.low-dilution',
          message: 'groundwater supplies most of the mixing flow (Q_gw exceeds f Q_u)',
        },
      ]
    : [];
}

/** Warning when a concentration exceeds the chemical's solubility (both in kg/m^3). */
export function aboveSolubilityWarning(
  label: string,
  concentration: number,
  solubility: number | undefined,
): SurfaceWaterWarning[] {
  return solubility !== undefined && concentration > solubility
    ? [
        {
          code: 'surfaceWater.above-solubility',
          message: `${label} exceeds the chemical's solubility`,
        },
      ]
    : [];
}

/** Residence time above which the quasi-steady legacy box may misstate a changing loading, s. */
export const QUASI_STEADY_LIMIT_S = 30 * 86400;
