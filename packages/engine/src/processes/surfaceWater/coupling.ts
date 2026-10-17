import type { EpcSeries, EpcSpec } from '../exposure/index.js';
import { seriesEpc } from '../exposure/index.js';
import { at123dConcentration, type At123dInput } from '../groundwater/index.js';
import type { PlaneConcentration } from './discharge.js';
import { checkFinite, checkNonNegative } from './checks.js';

/**
 * Coupling of the surface water models to M1 (groundwater at the bank) and M4 (swimming EPCs); see
 * `docs/methods/surface-water.md`, "Coupling to M1 and M4". SI units throughout.
 */

/**
 * Legacy edge series: the plain mean of the M1 concentrations at the trapezoid points of the discharge
 * thickness on the plume centreline at the bank, at each sample time. This is the same reduction as the M4
 * adapter `groundwaterBreakthrough` (DEFAULT ruling 3), without making an EPC of it. Negative round-off is
 * clipped to zero.
 */
export function bankScreenAverage(
  run: (time: number) => { concentrations: readonly number[] },
  times: readonly number[],
): EpcSeries {
  if (times.length === 0) throw new RangeError('a bank series needs at least one time');
  const values = times.map((t) => {
    const { concentrations } = run(t);
    if (concentrations.length === 0) throw new RangeError('the run returned no concentrations');
    const mean = concentrations.reduce((a, c) => a + c, 0) / concentrations.length;
    return Math.max(0, mean);
  });
  return { times: [...times], values };
}

/**
 * The AT123D concentration on the bank plane for `bankPlaneDischarge`: lateral offset y from the
 * centreline, depth below the water table (z = waterTableZ - depth), at the plane x = bankX from the
 * model's own origin (the downgradient source face plus x_s).
 */
export function at123dBankPlane(
  input: Omit<At123dInput, 'time'>,
  bankX: number,
  waterTableZ: number,
): PlaneConcentration {
  checkFinite('bank x', bankX);
  checkFinite('water table z', waterTableZ);
  return (y, depth, t) =>
    at123dConcentration({ ...input, time: t }, { x: bankX, y, z: waterTableZ - depth });
}

/**
 * A surface water concentration series (kg/m^3) as the swimming EPC for `swimIngestion` and `swimDermal`,
 * tagged with the id of the method that produced it. A single time is a constant EPC.
 */
export function surfaceWaterEpc(
  times: readonly number[],
  values: readonly number[],
  origin: string,
): EpcSpec {
  if (times.length !== values.length) throw new RangeError('one value per time is required');
  if (times.length === 0) throw new RangeError('a series needs at least one time');
  if (times.length === 1) {
    const v = values[0] as number;
    checkNonNegative('surface water concentration', v);
    return { kind: 'constant', value: v, origin };
  }
  return seriesEpc({ times: [...times], values: values.map((v) => Math.max(0, v)) }, origin);
}
