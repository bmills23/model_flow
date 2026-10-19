import type { UncertainInput } from '../../registry/index.js';
import { declareRows, type Row } from '../vapor/uncertain.js';
import type { IrrigationMethodInput, SprinklerMethodInput } from './methods.js';

/**
 * Uncertain-input declarations of the irrigation methods (uncertainty note, ruling 2). Ids are
 * `irrigation.<name>`. Molecular weight and the season are not declared. The film references, the
 * water temperature and the box length and width read NaN when the base omits them and `set` refuses.
 */

function sprinklerRows<I extends SprinklerMethodInput | IrrigationMethodInput>(): Row<I>[] {
  return [
    [
      'waterConcentration',
      ['waterConcentration'],
      'Irrigation water concentration',
      'kg/m^3',
      'site',
    ],
    ['henry', ['sprinkler', 'henry'], "Dimensionless Henry's constant", '1', 'chemical'],
    ['dropletDiameter', ['sprinkler', 'dropletDiameter'], 'Droplet diameter', 'm', 'transport'],
    ['fallTime', ['sprinkler', 'fallTime'], 'Droplet fall time', 's', 'transport'],
    ['sprinklerFlow', ['sprinkler', 'sprinklerFlow'], 'Sprinkler water flow', 'm^3/s', 'site'],
    [
      'film.gas',
      ['sprinkler', 'filmReferences', 'gasCmPerH'],
      'Gas film reference coefficient',
      'cm/h',
      'chemical',
    ],
    [
      'film.liquid',
      ['sprinkler', 'filmReferences', 'liquidCmPerH'],
      'Liquid film reference coefficient',
      'cm/h',
      'chemical',
    ],
    [
      'waterTemperature',
      ['sprinkler', 'temperature', 'waterK'],
      'Irrigation water temperature',
      'K',
      'site',
    ],
    ['box.height', ['box', 'height'], 'Mixing height', 'm', 'transport'],
    ['box.windSpeed', ['box', 'windSpeed'], 'Wind speed', 'm/s', 'transport'],
    ['box.length', ['box', 'length'], 'Box length along the wind', 'm', 'site'],
    ['box.width', ['box', 'width'], 'Box width across the wind', 'm', 'site'],
  ];
}

/** Declarations of `irrigation.sprinkler-fc`. */
export function sprinklerUncertainInputs(): UncertainInput<SprinklerMethodInput>[] {
  return declareRows<SprinklerMethodInput>('irrigation', sprinklerRows<SprinklerMethodInput>());
}

/** Declarations of `irrigation.pathways`. */
export function irrigationPathwaysUncertainInputs(): UncertainInput<IrrigationMethodInput>[] {
  const rows: Row<IrrigationMethodInput>[] = [
    ...sprinklerRows<IrrigationMethodInput>(),
    ['applicationRate', ['applicationRate'], 'Irrigation application rate', 'm/s', 'site'],
  ];
  return declareRows<IrrigationMethodInput>('irrigation', rows);
}
