import { seriesValue } from '../exposure/averaging.js';
import type { EpcSpec } from '../exposure/epc.js';
import { seriesEpc } from '../exposure/epc.js';
import type { OutdoorEmission } from '../outdoorAir/emissions.js';
import {
  irrigationEpcs,
  type IrrigationEpcs,
  type IrrigationInput,
} from '../irrigation/pathways.js';
import { sprinklerEmission, type SprinklerInput } from '../irrigation/sprinkler.js';

/**
 * Coupling of the M7 processes to the exposure evaluator (`docs/methods/shower-irrigation-particulates.md`,
 * "Coupling"). The water source is an `EpcSpec`: a constant, or the M1 well series through
 * `groundwaterBreakthrough`. The stall and box models are quasi-steady (minutes against years), so each
 * is evaluated per sample of the water series and the result is an EPC series at the same times. Every
 * forward function is linear in the water concentration, so linear interpolation between the samples
 * is exact for the derived series.
 */

/** Water concentration (kg/m^3) of a constant or series spec at time t, s; a series holds its end values. */
export function waterConcentrationAt(water: EpcSpec, t: number): number {
  return water.kind === 'constant' ? water.value : seriesValue(water.series, t);
}

/**
 * An EPC derived from the water concentration by a forward function (a shower stall, the household
 * term). `origin` is the producing method id, for example `shower.little-1992`. A constant stays a
 * constant; a series is evaluated at each sample time.
 */
export function waterDrivenEpc(
  water: EpcSpec,
  forward: (waterConcentration: number) => { concentration: number },
  origin: string,
): EpcSpec {
  if (water.kind === 'constant') {
    return {
      kind: 'constant',
      value: Math.max(0, forward(water.value).concentration),
      origin,
    };
  }
  return seriesEpc(
    {
      times: water.series.times,
      values: water.series.values.map((cw) => Math.max(0, forward(cw).concentration)),
    },
    origin,
  );
}

export interface IrrigationEpcSpecs {
  /** Incidental ingestion EPC (M4 pathway 8), kg/m^3. */
  ingestion: EpcSpec;
  /** Dermal contact EPC (M4 pathway 9), kg/m^3. */
  dermal: EpcSpec;
  /** Spray inhalation outdoor air (M4 pathway 7), kg/m^3. */
  sprayAir: EpcSpec;
  /** Warnings of the irrigation model (the box width default, a potable source, film defaults). */
  warnings: IrrigationEpcs['warnings'];
}

/** The irrigation EPCs of a water source, each tagged with its producing method. */
export function irrigationEpcSpecs(water: EpcSpec, p: IrrigationInput): IrrigationEpcSpecs {
  const probe = water.kind === 'constant' ? water.value : 0;
  return {
    ingestion: waterDrivenEpc(
      water,
      (cw) => ({ concentration: irrigationEpcs(cw, p).ingestion }),
      'irrigation.pathways',
    ),
    dermal: waterDrivenEpc(
      water,
      (cw) => ({ concentration: irrigationEpcs(cw, p).dermal }),
      'irrigation.pathways',
    ),
    sprayAir: waterDrivenEpc(
      water,
      (cw) => ({ concentration: irrigationEpcs(cw, p).sprayAir }),
      'irrigation.sprinkler-fc',
    ),
    warnings: irrigationEpcs(probe, p).warnings,
  };
}

/** The sprinkler mass rate as a function of time for `outdoorAirEpc` (origin `irrigation.sprinkler-fc`). */
export function sprinklerOutdoorEmission(water: EpcSpec, p: SprinklerInput): OutdoorEmission {
  const coefficient = sprinklerEmission(1, p).coefficient;
  return {
    origin: 'irrigation.sprinkler-fc',
    kind: 'massRate',
    rate: (t) => coefficient * waterConcentrationAt(water, t),
  };
}
