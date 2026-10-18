import type { OutdoorDirect, OutdoorEmission } from '../outdoorAir/index.js';
import { checkNonNeg, checkPos } from '../vapor/units.js';
import { PARTICULATE_DEFAULTS, windErosionFlux } from './windErosion.js';

/** Q/C defaults, g/(m^2 s) per kg/m^3: 1996 Table 3 Minneapolis (p. 32) and 2002 eq. 4-5 (p. 4-18). */
export const QOVERC_1996_PM10 = 90.8;
export const QOVERC_2002_WIND = 93.77;

/** Particulate emission factor, m^3/kg: PEF = (Q/C) / J, with Q/C in g/(m^2 s) per kg/m^3 and J in kg/(m^2 s). */
export function pef(qOverC: number, fluxKgPerM2S: number): number {
  checkPos('Q/C', qOverC);
  checkPos('wind erosion flux', fluxKgPerM2S);
  return qOverC / 1000 / fluxKgPerM2S;
}

export function pef1996Default(): number {
  return pef(QOVERC_1996_PM10, windErosionFlux(PARTICULATE_DEFAULTS));
}

export function pef2002Default(): number {
  return pef(QOVERC_2002_WIND, windErosionFlux(PARTICULATE_DEFAULTS));
}

/** Legacy box route: chemical area flux J * Cs (kg/(m^2 s)) for `outdoorAirEpc` emissions. Cs is kg/kg. */
export function particulateBoxEmission(
  origin: string,
  fluxKgPerM2S: number,
  soilConcentration: number,
  area?: number,
): OutdoorEmission {
  checkPos('particulate flux', fluxKgPerM2S);
  checkNonNeg('soil concentration', soilConcentration);
  const f = fluxKgPerM2S * soilConcentration;
  return area === undefined
    ? { origin, kind: 'areaFlux', flux: () => f }
    : { origin, kind: 'areaFlux', flux: () => f, area };
}

/** Modern route: air = Cs / PEF as a direct contribution for `outdoorAirEpc`. */
export function particulatePefDirect(
  origin: string,
  soilConcentration: number,
  pefValue: number,
): OutdoorDirect {
  checkNonNeg('soil concentration', soilConcentration);
  checkPos('PEF', pefValue);
  const c = soilConcentration / pefValue;
  return { origin, concentration: () => c };
}
