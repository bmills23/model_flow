import type { UncertainInput } from '../../registry/index.js';
import { declareRows, type Row } from '../vapor/uncertain.js';
import type { ShowerInput } from './common.js';
import type { HouseholdInput } from './household.js';
import type { LittleInput } from './little.js';

/**
 * Uncertain-input declarations of the shower methods (uncertainty note, ruling 2). Ids are
 * `shower.<name>`. Molecular weight and the volatility flag are constants of the chemical, not
 * declared; the film references and the water temperature read NaN when the base omits them (the
 * unverified RISC5 defaults then apply) and `set` refuses.
 */

/** Rows shared by the stall methods; `I` must extend the stall input. */
export function stallRows<I extends ShowerInput>(): Row<I>[] {
  return [
    ['waterConcentration', ['waterConcentration'], 'Tap water concentration', 'kg/m^3', 'site'],
    ['henry', ['henry'], "Dimensionless Henry's constant", '1', 'chemical'],
    ['dropletDiameter', ['dropletDiameter'], 'Droplet diameter', 'm', 'transport'],
    ['fallTime', ['fallTime'], 'Droplet fall time', 's', 'transport'],
    ['waterFlow', ['waterFlow'], 'Shower water flow', 'm^3/s', 'site'],
    ['showerTime', ['showerTime'], 'Shower duration', 's', 'site'],
    ['stallVolume', ['stallVolume'], 'Stall volume', 'm^3', 'site'],
    [
      'film.gas',
      ['filmReferences', 'gasCmPerH'],
      'Gas film reference coefficient',
      'cm/h',
      'chemical',
    ],
    [
      'film.liquid',
      ['filmReferences', 'liquidCmPerH'],
      'Liquid film reference coefficient',
      'cm/h',
      'chemical',
    ],
    ['waterTemperature', ['temperature', 'waterK'], 'Shower water temperature', 'K', 'site'],
  ];
}

/** Declarations of `shower.fc-1986`. */
export function showerFcUncertainInputs(): UncertainInput<ShowerInput>[] {
  return declareRows<ShowerInput>('shower', stallRows<ShowerInput>());
}

/** Declarations of `shower.little-1992`. */
export function showerLittleUncertainInputs(): UncertainInput<LittleInput>[] {
  const rows: Row<LittleInput>[] = [
    ...stallRows<LittleInput>(),
    ['gasFlow', ['gasFlow'], 'Stall ventilation flow', 'm^3/s', 'transport'],
    ['postShowerTime', ['postShowerTime'], 'Time in the stall after the water is off', 's', 'site'],
  ];
  return declareRows<LittleInput>('shower', rows);
}

/** Declarations of `shower.rsl-household`. */
export function showerHouseholdUncertainInputs(): UncertainInput<HouseholdInput>[] {
  const rows: Row<HouseholdInput>[] = [
    ['waterConcentration', ['waterConcentration'], 'Tap water concentration', 'kg/m^3', 'site'],
    [
      'transferFactor',
      ['transferFactorLPerM3'],
      'Water-to-indoor-air transfer factor K',
      'L/m^3',
      'transport',
    ],
  ];
  return declareRows<HouseholdInput>('shower', rows);
}
