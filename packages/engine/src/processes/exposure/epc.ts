import { validateSeries } from './averaging.js';
import {
  PATHWAYS,
  mgPerKgToKgPerKg,
  mgPerLToKgPerM3,
  mgPerM3ToKgPerM3,
  type EpcOrigin,
  type EpcSeries,
  type PathwayId,
} from './units.js';

/**
 * Exposure point concentrations of a scenario: a constant, or a series (times in s, concentrations in
 * kg/kg or kg/m^3, linear between samples), each tagged with where it came from so a later milestone
 * can replace an entered air or surface-water value without changing the scenario.
 */
export type EpcSpec =
  | { kind: 'constant'; value: number; origin: EpcOrigin }
  | { kind: 'series'; series: EpcSeries; origin: EpcOrigin };

const TO_SI = {
  'mg/kg': mgPerKgToKgPerKg,
  'mg/L': mgPerLToKgPerM3,
  'mg/m3': mgPerM3ToKgPerM3,
} as const;

/** A user-entered constant in the pathway's boundary unit (mg/kg, mg/L or mg/m^3), converted to SI. */
export function constantEpc(
  pathway: PathwayId,
  value: number,
  origin: EpcOrigin = 'entered',
): EpcSpec {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${pathway}: concentrations must be finite and not negative`);
  }
  return { kind: 'constant', value: TO_SI[PATHWAYS[pathway].epcUnit](value), origin };
}

/** A series already in SI (as a transport run produces it). */
export function seriesEpc(series: EpcSeries, origin: EpcOrigin): EpcSpec {
  validateSeries(series, 'EPC series');
  return {
    kind: 'series',
    series: { times: [...series.times], values: [...series.values] },
    origin,
  };
}

/**
 * Adapter from an M1 groundwater run (`groundwater.at123d`, `groundwater.wexler1992`,
 * `groundwater.domenico`) to a drinking-water or bathing EPC series. `run` evaluates the transport
 * solution at one time and returns the concentrations (kg/m^3) at the points of the well screen; the
 * screen average is their plain mean (the points are the screen's quadrature points). Negative round-off
 * is clipped to zero. `times` are the sample times in s, strictly increasing.
 */
export function groundwaterBreakthrough(
  run: (time: number) => { concentrations: readonly number[] },
  times: readonly number[],
  origin: EpcOrigin,
): EpcSpec {
  if (times.length < 2) throw new RangeError('a breakthrough series needs at least two times');
  const values = times.map((t) => {
    const { concentrations } = run(t);
    if (concentrations.length === 0) throw new RangeError('the run returned no concentrations');
    const mean = concentrations.reduce((a, c) => a + c, 0) / concentrations.length;
    return Math.max(0, mean);
  });
  return seriesEpc({ times, values }, origin);
}

/**
 * Adapter from a vapor forward function (a steady method applied at each time to a source series) to
 * an indoor or outdoor inhalation EPC series in kg/m^3. `run` returns the receptor air concentration at
 * one time; negative round-off is clipped to zero. `origin` is the producing method id, for example
 * `vapor.je-1991`, so the scenario and the risk screen take it without change. `times` are s, strictly
 * increasing.
 */
export function vaporSeriesEpc(
  run: (time: number) => { concentration: number },
  times: readonly number[],
  origin: EpcOrigin,
): EpcSpec {
  if (times.length < 2) throw new RangeError('a vapor series needs at least two times');
  const values = times.map((t) => Math.max(0, run(t).concentration));
  return seriesEpc({ times, values }, origin);
}
