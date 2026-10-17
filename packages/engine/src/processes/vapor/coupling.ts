import type { Warning } from '../../registry/index.js';
import type { Point3 } from '../groundwater/common.js';
import type { EpcSeries } from '../exposure/units.js';
import { validateSeries } from '../exposure/averaging.js';
import type { RegionState } from '../saturatedSource/partitioning.js';
import { checkNonNeg, checkPos } from './units.js';

/**
 * Adapters from the M1, M2 and M3 results to vapor sources, and the quasi-steady check (DEFAULT
 * ruling 7). All series are SI: times in s, concentrations in kg/m^3, fluxes in kg/(m^2 s). None of
 * these changes the process it reads from; the vapor model does not feed back on transport.
 */

/**
 * M1: the groundwater concentration at the water table under the building, as a series. `run` evaluates
 * the transport solution at one time and points; the value is taken at the building's plan position
 * (x, y) at depth zero below the water table (`waterTableZ`, default 0, the no-flux water table of an
 * infinitely deep aquifer; pass the aquifer thickness for a finite layer), not the well-screen average.
 * Negative round-off is clipped to zero.
 */
export function groundwaterWaterTableSeries(
  run: (time: number, point: Point3) => { concentrations: readonly number[] },
  position: { x: number; y: number },
  times: readonly number[],
  waterTableZ = 0,
): EpcSeries {
  if (times.length < 2) throw new RangeError('a water-table series needs at least two times');
  const point: Point3 = { x: position.x, y: position.y, z: waterTableZ };
  const values = times.map((t) => {
    const { concentrations } = run(t, point);
    if (concentrations.length === 0) throw new RangeError('the run returned no concentrations');
    return Math.max(0, concentrations.reduce((a, c) => a + c, 0) / concentrations.length);
  });
  validateSeries({ times, values }, 'water-table series');
  return { times: [...times], values };
}

/** The part of an M2 `vadose.vadsat` output the vapor adapters read. */
export interface VadoseVaporSource {
  volatilizationVelocity: number;
  series: { times: readonly number[]; sourcePoreWater: readonly number[] };
}

/** M2: source vapor concentration series C_vs(t) = H C_s(t) for a soil source, kg/m^3. */
export function vadoseSoilVaporSeries(out: VadoseVaporSource, H: number): EpcSeries {
  checkNonNeg('Henry constant', H);
  return {
    times: [...out.series.times],
    values: out.series.sourcePoreWater.map((c) => H * Math.max(0, c)),
  };
}

/**
 * M2: the volatilization flux series, kg/(m^2 s), the velocity H D_eff / L_d times the source pore
 * water, which feeds the legacy outdoor box as an area flux.
 */
export function vadoseVolatilizationFlux(out: VadoseVaporSource): EpcSeries {
  checkNonNeg('volatilization velocity', out.volatilizationVelocity);
  return {
    times: [...out.series.times],
    values: out.series.sourcePoreWater.map((c) => out.volatilizationVelocity * Math.max(0, c)),
  };
}

/**
 * M3: region 1 (above the water table) pore water as a soil source. Region 2 reaches vapor only through
 * M1 groundwater, so a result without region 1 is a RangeError.
 */
export function saturatedRegion1Source(out: {
  regions: { unsaturated: Pick<RegionState, 'c' | 'residual'> | null };
}): { poreWater: number; residual: boolean } {
  const r = out.regions.unsaturated;
  if (r === null) {
    throw new RangeError(
      'the saturated source has no region 1 (above the water table): region 2 reaches vapor only through the groundwater series',
    );
  }
  return { poreWater: r.c, residual: r.residual };
}

/** Time to establish the vapor profile through the soil column, s: L_T^2 / D_E (D_E gas-referenced). */
export function quasiSteadyTime(columnLength: number, effectiveDiffusivity: number): number {
  checkPos('column length', columnLength);
  checkPos('effective diffusivity', effectiveDiffusivity);
  return (columnLength * columnLength) / effectiveDiffusivity;
}

/** Relative change within the establishment time above which the steady application is questioned. */
export const QUASI_STEADY_TOLERANCE = 0.1;

/**
 * `vapor.quasi-steady` when the source series changes by more than 10 percent (of its larger end)
 * inside any window of length `tau`, so applying a steady method at each time is not justified.
 */
export function quasiSteadyWarnings(source: EpcSeries, tau: number): Warning[] {
  validateSeries(source, 'source series');
  checkPos('establishment time', tau);
  const t = source.times;
  const v = source.values;
  const at = (x: number): number => {
    if (x <= t[0]!) return v[0]!;
    if (x >= t[t.length - 1]!) return v[v.length - 1]!;
    let i = 0;
    while (t[i + 1]! < x) i++;
    return v[i]! + ((v[i + 1]! - v[i]!) * (x - t[i]!)) / (t[i + 1]! - t[i]!);
  };
  const starts = new Set<number>();
  for (const x of t) {
    starts.add(x);
    starts.add(x - tau);
  }
  for (const s of starts) {
    const lo = Math.max(s, t[0]!);
    const hi = Math.min(s + tau, t[t.length - 1]!);
    if (!(hi > lo)) continue;
    let mn = Math.min(at(lo), at(hi));
    let mx = Math.max(at(lo), at(hi));
    for (let i = 0; i < t.length; i++) {
      if (t[i]! > lo && t[i]! < hi) {
        mn = Math.min(mn, v[i]!);
        mx = Math.max(mx, v[i]!);
      }
    }
    if (mx > 0 && (mx - mn) / mx > QUASI_STEADY_TOLERANCE) {
      return [
        {
          code: 'vapor.quasi-steady',
          message: `the source changes by more than ${QUASI_STEADY_TOLERANCE * 100} percent within the vapor establishment time (${tau.toExponential(2)} s): the steady vapor method applied at each time overstates the response to a declining source and understates it to a rising one`,
        },
      ];
    }
  }
  return [];
}
