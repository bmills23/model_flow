import type { EpcSeries, EpcSpec } from '../exposure/index.js';
import { seriesEpc } from '../exposure/index.js';
import { at123dConcentration, createAt123dMemo, type At123dInput } from '../groundwater/index.js';
import type { PlaneConcentration } from './discharge.js';
import { checkFinite, checkNonNegative, checkPositive } from './checks.js';

/**
 * Coupling of the surface water models to M1 (groundwater at the bank) and M4 (swimming EPCs); see
 * `docs/methods/surface-water.md`, "Coupling to M1 and M4". SI units throughout.
 */

/**
 * Legacy edge series: the screen average of the M1 concentrations at equally spaced points from the water
 * table to the discharge thickness on the plume centreline at the bank, at each sample time, by the M1
 * well-screen trapezoid rule (`wellScreenAverage`, DEFAULT ruling 3): the two end points carry half weight.
 * A single point is its own average. Negative round-off is clipped to zero.
 */
export function bankScreenAverage(
  run: (time: number) => { concentrations: readonly number[] },
  times: readonly number[],
): EpcSeries {
  if (times.length === 0) throw new RangeError('a bank series needs at least one time');
  const values = times.map((t) => {
    const { concentrations } = run(t);
    if (concentrations.length === 0) throw new RangeError('the run returned no concentrations');
    const n = concentrations.length;
    const mean =
      n === 1
        ? (concentrations[0] as number)
        : concentrations.reduce((a, c, i) => a + (i === 0 || i === n - 1 ? 0.5 * c : c), 0) /
          (n - 1);
    return Math.max(0, mean);
  });
  return { times: [...times], values };
}

export interface BankPlaneOptions {
  /**
   * Absolute tolerance of each plane point as a fraction of the centreline surface concentration at the
   * same time. Omit (the default) for the kernel's full relative tolerance at every point. The bank
   * plane integral adds points over a reach that can be far wider than the plume, and chasing the
   * relative tolerance of a tail value many orders of magnitude below the peak dominated the cost
   * (`docs/DECISIONS.md`, Wave G slice G4).
   */
  tailTolerance?: number;
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
  options: BankPlaneOptions = {},
): PlaneConcentration {
  checkFinite('bank x', bankX);
  checkFinite('water table z', waterTableZ);
  const tail = options.tailTolerance;
  if (tail !== undefined) checkPositive('tail tolerance', tail);
  const memo = createAt123dMemo();
  if (tail === undefined) {
    return (y, depth, t) =>
      at123dConcentration({ ...input, time: t }, { x: bankX, y, z: waterTableZ - depth }, { memo });
  }
  // The plane integral weighs a point by its size next to the plume, so a point far out in the tail needs
  // its time integral only to a small share of the centreline surface value at that time. The reference
  // is that value, converged to the kernel's own tolerance, and is kept for the time in hand (the plane
  // integral visits one time at a time).
  let refTime = Number.NaN;
  let refValue = 0;
  return (y, depth, t) => {
    if (t !== refTime) {
      refValue = at123dConcentration(
        { ...input, time: t },
        { x: bankX, y: 0, z: waterTableZ },
        { memo },
      );
      refTime = t;
    }
    return at123dConcentration(
      { ...input, time: t },
      { x: bankX, y, z: waterTableZ - depth },
      { absTol: tail * refValue, memo },
    );
  };
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
