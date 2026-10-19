import type { UncertainInput } from '../../registry/index.js';
import { declareRows, type Row } from '../vapor/uncertain.js';
import type { At123dRunInput } from './index.js';
import type { DomenicoRunInput, WexlerRunInput } from './index.js';

/**
 * Uncertain-input declarations of the M1 groundwater transport methods (uncertainty note, ruling 2).
 * Ids are `groundwater.<name>`. An optional scalar the base input omits (retardation, decay rate,
 * thickness, finite-aquifer width) reads NaN and is created by `set`; a loading slot the base does not
 * carry reads NaN and refuses a set. Observation points, the evaluation time and the boundary
 * condition switch are scenario choices, not parameters, and are not declared.
 */

const ANY = [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY] as const;
const RETARDATION = [1, Number.POSITIVE_INFINITY] as const;
const POROSITY = [0, 1] as const;

/** Loading, concentration-step slots declared per method; a base with fewer steps reads NaN. */
export const GROUNDWATER_DECLARED_LOADING_STEPS = 4;

/** Declarations of `groundwater.at123d`. */
export function at123dUncertainInputs(): UncertainInput<At123dRunInput>[] {
  type I = At123dRunInput;
  const rows: Row<I>[] = [
    ['velocity', ['aquifer', 'velocity'], 'Seepage velocity along x', 'm/s', 'transport'],
    ['porosity', ['aquifer', 'porosity'], 'Effective porosity', '1', 'site', POROSITY],
    ['retardation', ['aquifer', 'retardation'], 'Retardation factor', '1', 'chemical', RETARDATION],
    ['decayRate', ['aquifer', 'decayRate'], 'First-order decay rate', '1/s', 'chemical'],
    ['dx', ['aquifer', 'dx'], 'Longitudinal dispersion coefficient', 'm^2/s', 'transport'],
    ['dy', ['aquifer', 'dy'], 'Transverse dispersion coefficient', 'm^2/s', 'transport'],
    ['dz', ['aquifer', 'dz'], 'Vertical dispersion coefficient', 'm^2/s', 'transport'],
    ['thickness', ['aquifer', 'thickness'], 'Aquifer thickness', 'm', 'site'],
    ['source.x1', ['source', 'x1'], 'Source box upstream face', 'm', 'site', ANY],
    ['source.x2', ['source', 'x2'], 'Source box downstream face', 'm', 'site', ANY],
    ['source.y1', ['source', 'y1'], 'Source box lower transverse face', 'm', 'site', ANY],
    ['source.y2', ['source', 'y2'], 'Source box upper transverse face', 'm', 'site', ANY],
    ['source.z1', ['source', 'z1'], 'Source box lower vertical face', 'm', 'site', ANY],
    ['source.z2', ['source', 'z2'], 'Source box upper vertical face', 'm', 'site', ANY],
  ];
  for (let k = 0; k < GROUNDWATER_DECLARED_LOADING_STEPS; k++) {
    rows.push([
      `loading${k}.rate`,
      ['loading', k, 'rate'],
      `Mass release rate of loading step ${k + 1}`,
      'kg/s',
      'site',
    ]);
  }
  return declareRows<I>('groundwater', rows);
}

function stepRows<I>(): Row<I>[] {
  const rows: Row<I>[] = [];
  for (let k = 0; k < GROUNDWATER_DECLARED_LOADING_STEPS; k++) {
    rows.push([
      `loading${k}.concentration`,
      ['loading', k, 'concentration'],
      `Boundary concentration of loading step ${k + 1}`,
      'kg/m^3',
      'site',
    ]);
  }
  return rows;
}

/** Declarations of `groundwater.wexler1992`. */
export function wexlerUncertainInputs(): UncertainInput<WexlerRunInput>[] {
  type I = WexlerRunInput;
  const rows: Row<I>[] = [
    ['velocity', ['params', 'velocity'], 'Seepage velocity along x', 'm/s', 'transport'],
    ['retardation', ['params', 'retardation'], 'Retardation factor', '1', 'chemical', RETARDATION],
    ['decayRate', ['params', 'decayRate'], 'First-order decay rate', '1/s', 'chemical'],
    ['dx', ['params', 'dx'], 'Longitudinal dispersion coefficient', 'm^2/s', 'transport'],
    ['dy', ['params', 'dy'], 'Transverse dispersion coefficient', 'm^2/s', 'transport'],
    ['dz', ['params', 'dz'], 'Vertical dispersion coefficient', 'm^2/s', 'transport'],
    ['c0', ['params', 'c0'], 'Concentration held on the patch', 'kg/m^3', 'site'],
    ['patch.y1', ['params', 'patch', 'y1'], 'Patch lower transverse edge', 'm', 'site', ANY],
    ['patch.y2', ['params', 'patch', 'y2'], 'Patch upper transverse edge', 'm', 'site', ANY],
    ['patch.z1', ['params', 'patch', 'z1'], 'Patch lower vertical edge', 'm', 'site', ANY],
    ['patch.z2', ['params', 'patch', 'z2'], 'Patch upper vertical edge', 'm', 'site', ANY],
    ['width', ['width'], 'Finite aquifer width (PATCHF)', 'm', 'site'],
    ['thickness', ['thickness'], 'Finite aquifer thickness (PATCHF)', 'm', 'site'],
    ...stepRows<I>(),
  ];
  return declareRows<I>('groundwater', rows);
}

/** Declarations of `groundwater.domenico1987`. */
export function domenicoUncertainInputs(): UncertainInput<DomenicoRunInput>[] {
  type I = DomenicoRunInput;
  const rows: Row<I>[] = [
    ['velocity', ['params', 'velocity'], 'Seepage velocity', 'm/s', 'transport'],
    ['retardation', ['params', 'retardation'], 'Retardation factor', '1', 'chemical', RETARDATION],
    ['decayRate', ['params', 'decayRate'], 'First-order decay rate', '1/s', 'chemical'],
    ['alphaL', ['params', 'alphaL'], 'Longitudinal dispersivity', 'm', 'transport'],
    ['alphaT', ['params', 'alphaT'], 'Transverse dispersivity', 'm', 'transport'],
    ['alphaV', ['params', 'alphaV'], 'Vertical dispersivity', 'm', 'transport'],
    ['c0', ['params', 'c0'], 'Source concentration', 'kg/m^3', 'site'],
    ['sourceWidth', ['params', 'sourceWidth'], 'Source width', 'm', 'site'],
    ['sourceThickness', ['params', 'sourceThickness'], 'Source thickness', 'm', 'site'],
    ...stepRows<I>(),
  ];
  return declareRows<I>('groundwater', rows);
}
