import type { Warning } from '../../registry/index.js';
import { checkNonNeg, checkPos } from '../vapor/units.js';
import {
  dropletFraction,
  FILM_REFERENCE_WARNING,
  filmCoefficients,
  overallLiquidCoefficient,
  type FilmReferences,
  type TemperatureCorrection,
} from './droplet.js';

/** Inputs shared by the legacy stall and Little's model. SI: kg/m^3, m^3/s, s, m^3, m. */
export interface ShowerInput {
  /** Tap water concentration, kg/m^3. */
  waterConcentration: number;
  /** Dimensionless Henry's constant (air over water). */
  henry: number;
  /** g/mol. */
  molecularWeight: number;
  /** Droplet diameter, m. */
  dropletDiameter: number;
  /** Droplet fall time, s. */
  fallTime: number;
  /** Shower water flow, m^3/s. */
  waterFlow: number;
  /** Shower duration, s. */
  showerTime: number;
  /** Stall or bathroom volume, m^3. */
  stallVolume: number;
  /** Film reference coefficients; omitted means the RISC5 choices, with a warning. */
  filmReferences?: FilmReferences;
  temperature?: TemperatureCorrection;
}

export interface ShowerResult {
  /** Exposure-average stall air concentration, kg/m^3. */
  concentration: number;
  /** Air concentration per unit water concentration (dimensionless, kg/m^3 air per kg/m^3 water). */
  coefficient: number;
  /** Time the receptor is in the stall, s. */
  exposureTime: number;
  warnings: Warning[];
}

export function checkShower(p: ShowerInput): void {
  checkNonNeg('water concentration', p.waterConcentration);
  checkPos('Henry constant', p.henry);
  checkPos('molecular weight', p.molecularWeight);
  checkPos('droplet diameter', p.dropletDiameter);
  checkNonNeg('fall time', p.fallTime);
  checkPos('water flow', p.waterFlow);
  checkPos('shower time', p.showerTime);
  checkPos('stall volume', p.stallVolume);
}

/** Droplet fraction volatilized for a shower input, plus the unverified-default warning. */
export function showerDropletFraction(p: ShowerInput): { fv: number; warnings: Warning[] } {
  const refs = p.filmReferences;
  const { kg, kl } = filmCoefficients(p.molecularWeight, refs, p.temperature);
  const kL = overallLiquidCoefficient(kl, kg, p.henry);
  return {
    fv: dropletFraction(kL, p.fallTime, p.dropletDiameter),
    warnings: refs ? [] : [FILM_REFERENCE_WARNING],
  };
}
