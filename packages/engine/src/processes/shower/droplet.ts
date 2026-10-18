import type { Warning } from '../../registry/index.js';
import { checkNonNeg, checkPos } from '../vapor/units.js';

/** Molecular weights of the reference compounds of the film scaling: water vapour and carbon dioxide. */
export const MW_WATER = 18;
export const MW_CO2 = 44;

/**
 * Film transfer coefficients of the reference compounds, cm/h. These are RISC5 choices; S0 could not
 * verify them against the Foster and Chrostowski paper, so they are inputs, warned when taken as defaults.
 */
export interface FilmReferences {
  /** Gas film of water vapour, cm/h. */
  gasCmPerH: number;
  /** Liquid film of carbon dioxide, cm/h. */
  liquidCmPerH: number;
}

export const RISC5_FILM_REFERENCES: FilmReferences = { gasCmPerH: 3000, liquidCmPerH: 20 };

/** Optional liquid-film correction from the calibration temperature to the water temperature. */
export interface TemperatureCorrection {
  /** T_1, K. */
  calibrationK: number;
  /** T_2, K. */
  waterK: number;
  /** Water viscosity at T_1 and T_2 in any one consistent unit; the caller supplies a read source. */
  viscosityCalibration: number;
  viscosityWater: number;
}

export const FILM_REFERENCE_WARNING: Warning = {
  code: 'shower.film-reference-unverified',
  message:
    'The film reference coefficients (3000 cm/h gas, 20 cm/h liquid) are RISC5 choices that could not be verified against the primary paper; enter values you can cite to remove this warning.',
};

const CM_PER_H_TO_M_PER_S = 1 / 100 / 3600;

/** k_g = k_g,ref sqrt(18/M), k_l = k_l,ref sqrt(44/M), in m/s. The temperature factor applies to k_l. */
export function filmCoefficients(
  molecularWeight: number,
  refs: FilmReferences = RISC5_FILM_REFERENCES,
  temperature?: TemperatureCorrection,
): { kg: number; kl: number } {
  checkPos('molecular weight', molecularWeight);
  checkPos('gas film reference coefficient', refs.gasCmPerH);
  checkPos('liquid film reference coefficient', refs.liquidCmPerH);
  let tf = 1;
  if (temperature) {
    checkPos('calibration temperature', temperature.calibrationK);
    checkPos('water temperature', temperature.waterK);
    checkPos('calibration viscosity', temperature.viscosityCalibration);
    checkPos('water viscosity', temperature.viscosityWater);
    tf = Math.sqrt(
      (temperature.waterK * temperature.viscosityCalibration) /
        (temperature.calibrationK * temperature.viscosityWater),
    );
  }
  return {
    kg: refs.gasCmPerH * Math.sqrt(MW_WATER / molecularWeight) * CM_PER_H_TO_M_PER_S,
    kl: refs.liquidCmPerH * Math.sqrt(MW_CO2 / molecularWeight) * CM_PER_H_TO_M_PER_S * tf,
  };
}

/** Overall liquid-referenced coefficient, 1/K_L = 1/k_l + 1/(H k_g), m/s. H dimensionless. */
export function overallLiquidCoefficient(kl: number, kg: number, henry: number): number {
  checkPos('liquid film coefficient', kl);
  checkPos('gas film coefficient', kg);
  checkPos('Henry constant', henry);
  return 1 / (1 / kl + 1 / (henry * kg));
}

/** Number of transfer units of one fall, N = 6 K_L t_d / d. */
export function transferUnits(kL: number, fallTime: number, diameter: number): number {
  checkPos('overall coefficient', kL);
  checkNonNeg('fall time', fallTime);
  checkPos('droplet diameter', diameter);
  return (6 * kL * fallTime) / diameter;
}

/** Fraction volatilized from a droplet into clean air, f_v = 1 - exp(-N). */
export function dropletFraction(kL: number, fallTime: number, diameter: number): number {
  return -Math.expm1(-transferUnits(kL, fallTime, diameter));
}
