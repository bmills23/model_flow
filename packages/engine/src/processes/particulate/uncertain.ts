import type { UncertainInput } from '../../registry/index.js';
import { declareRows, type Row } from '../vapor/uncertain.js';
import type {
  ParticulateBoxInput,
  ParticulatePef2002Input,
  ParticulatePefInput,
} from './methods.js';

/**
 * Uncertain-input declarations of the particulate methods (uncertainty note, ruling 2). Ids are
 * `particulate.<name>`. The wind erosion inputs, the entered flux and the entered Q/C read NaN when the
 * base leaves them to the guidance defaults and `set` refuses; a caller samples only inputs whose base
 * value is finite. The station name and the volatility flag are not declared.
 */

const COVER = [0, 1] as const;

function windRows<I extends ParticulateBoxInput | ParticulatePefInput>(): Row<I>[] {
  return [
    [
      'wind.vegetativeCover',
      ['wind', 'vegetativeCover'],
      'Vegetative cover fraction',
      '1',
      'site',
      COVER,
    ],
    ['wind.meanWind', ['wind', 'meanWind'], 'Mean annual wind speed', 'm/s', 'transport'],
    [
      'wind.thresholdWind',
      ['wind', 'thresholdWind'],
      'Threshold wind speed at 7 m',
      'm/s',
      'transport',
    ],
    ['wind.fx', ['wind', 'fx'], 'Wind erosion function F(x)', '1', 'transport'],
  ];
}

const SOIL_ROW = [
  'soilConcentration',
  ['soilConcentration'],
  'Surface soil concentration',
  'kg/kg',
  'site',
] as const;

/** Declarations of `particulate.box-emission`. */
export function particulateBoxUncertainInputs(): UncertainInput<ParticulateBoxInput>[] {
  type I = ParticulateBoxInput;
  const rows: Row<I>[] = [
    SOIL_ROW,
    ['flux', ['flux'], 'Entered PM10 emission flux', 'kg/(m^2 s)', 'transport'],
    ...windRows<I>(),
    ['box.length', ['box', 'length'], 'Box length along the wind', 'm', 'site'],
    ['box.width', ['box', 'width'], 'Box width across the wind', 'm', 'site'],
    ['box.height', ['box', 'height'], 'Mixing height', 'm', 'transport'],
    ['box.windSpeed', ['box', 'windSpeed'], 'Wind speed', 'm/s', 'transport'],
  ];
  return declareRows<I>('particulate', rows);
}

function pefRows<I extends ParticulatePefInput>(): Row<I>[] {
  return [
    SOIL_ROW,
    ['qOverC', ['qOverC'], 'Dispersion factor Q/C', 'g/(m^2 s) per kg/m^3', 'transport'],
    ...windRows<I>(),
  ];
}

/** Declarations of `particulate.ssg-pef-1996`. */
export function pef1996UncertainInputs(): UncertainInput<ParticulatePefInput>[] {
  return declareRows<ParticulatePefInput>('particulate', pefRows<ParticulatePefInput>());
}

/** Declarations of `particulate.ssg-pef-2002`. */
export function pef2002UncertainInputs(): UncertainInput<ParticulatePef2002Input>[] {
  const rows: Row<ParticulatePef2002Input>[] = [
    ...pefRows<ParticulatePef2002Input>(),
    ['areaAcres', ['areaAcres'], 'Source area for the Q/C regression', 'acre', 'site'],
  ];
  return declareRows<ParticulatePef2002Input>('particulate', rows);
}
