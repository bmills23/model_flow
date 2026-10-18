import type { Warning } from '../../registry/index.js';
import { boxConcentration } from '../outdoorAir/box.js';
import type { OutdoorEmission } from '../outdoorAir/emissions.js';
import {
  dropletFraction,
  FILM_REFERENCE_WARNING,
  filmCoefficients,
  overallLiquidCoefficient,
  type FilmReferences,
  type TemperatureCorrection,
} from '../shower/droplet.js';
import { checkNonNeg, checkPos } from '../vapor/units.js';

/**
 * Legacy sprinkler volatilization (`irrigation.sprinkler-fc`): the shared droplet fraction f_v with
 * outdoor droplet parameters gives a mass rate E = f_v Q_spr C_w that enters the outdoor box as a
 * `massRate` emission, C_a = E / (u delta W). SI throughout. Linear in C_w.
 */
export interface SprinklerInput {
  /** Dimensionless Henry's constant. */
  henry: number;
  /** g/mol. */
  molecularWeight: number;
  /** Droplet diameter, m. */
  dropletDiameter: number;
  /** Droplet fall time, including any ponding in the box, s. */
  fallTime: number;
  /** Sprinkler water flow, m^3/s. */
  sprinklerFlow: number;
  filmReferences?: FilmReferences;
  temperature?: TemperatureCorrection;
}

export interface SprinklerBox {
  /** Mixing height, m. */
  height: number;
  /** Wind speed, m/s. */
  windSpeed: number;
  /** Length along the wind, m (does not enter the mass-rate box). */
  length?: number;
  /** Width across the wind, m; omitted means the RISC5 choice of 1 m, with a warning. */
  width?: number;
}

export const SPRINKLER_DEFAULT_WIDTH = 1;

export const BOX_WIDTH_WARNING: Warning = {
  code: 'irrigation.box-width-default',
  message:
    'The sprinkler box width is left at the 1 m RISC5 default; for a real sprinkler the plume width matters, since the box concentration is inversely proportional to it.',
};

export interface SprinklerEmissionResult {
  dropletFraction: number;
  emission: OutdoorEmission;
  /** Emission rate per unit water concentration, kg/s per kg/m^3 (= f_v Q_spr, m^3/s). */
  coefficient: number;
  warnings: Warning[];
}

export function sprinklerEmission(cw: number, p: SprinklerInput): SprinklerEmissionResult {
  checkNonNeg('water concentration', cw);
  checkPos('Henry constant', p.henry);
  checkPos('molecular weight', p.molecularWeight);
  checkPos('droplet diameter', p.dropletDiameter);
  checkNonNeg('fall time', p.fallTime);
  checkPos('sprinkler flow', p.sprinklerFlow);
  const { kg, kl } = filmCoefficients(p.molecularWeight, p.filmReferences, p.temperature);
  const kL = overallLiquidCoefficient(kl, kg, p.henry);
  const fv = dropletFraction(kL, p.fallTime, p.dropletDiameter);
  const coefficient = fv * p.sprinklerFlow;
  const rate = coefficient * cw;
  return {
    dropletFraction: fv,
    emission: { origin: 'irrigation.sprinkler-fc', kind: 'massRate', rate: () => rate },
    coefficient,
    warnings: p.filmReferences ? [] : [FILM_REFERENCE_WARNING],
  };
}

export interface SprinklerAirResult {
  /** Box air concentration, kg/m^3. */
  concentration: number;
  /** Air concentration per unit water concentration (dimensionless). */
  coefficient: number;
  warnings: Warning[];
}

/** Outdoor box air concentration from the sprinkler, C_a = E / (u delta W). */
export function sprinklerAir(cw: number, p: SprinklerInput, box: SprinklerBox): SprinklerAirResult {
  const e = sprinklerEmission(cw, p);
  const warnings = [...e.warnings];
  if (box.width === undefined) warnings.push(BOX_WIDTH_WARNING);
  const width = box.width ?? SPRINKLER_DEFAULT_WIDTH;
  const full = { length: box.length ?? 1, width, height: box.height, windSpeed: box.windSpeed };
  const rate = e.emission.kind === 'massRate' ? e.emission.rate(0) : 0;
  const concentration = boxConcentration(full, rate);
  const coefficient = boxConcentration(full, e.coefficient);
  return { concentration, coefficient, warnings };
}
