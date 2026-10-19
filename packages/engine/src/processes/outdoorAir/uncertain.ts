import type { UncertainInput } from '../../registry/index.js';
import { chemicalRows, declareRows, jurySoilRows, type Row } from '../vapor/uncertain.js';
import type { OutdoorBoxInput } from './box.js';
import type { SsgVfInput } from './ssgVf.js';

/**
 * Uncertain-input declarations of the outdoor air methods (uncertainty note, ruling 2). Ids are
 * `outdoorAir.<name>`.
 */

/** Declarations of `outdoorAir.box`. */
export function outdoorBoxUncertainInputs(): UncertainInput<OutdoorBoxInput>[] {
  type I = OutdoorBoxInput;
  const rows: Row<I>[] = [
    ['box.length', ['box', 'length'], 'Box length along the wind', 'm', 'site'],
    ['box.width', ['box', 'width'], 'Box width across the wind', 'm', 'site'],
    ['box.height', ['box', 'height'], 'Mixing (breathing zone) height', 'm', 'transport'],
    ['box.windSpeed', ['box', 'windSpeed'], 'Wind speed', 'm/s', 'transport'],
    ['flux', ['flux'], 'Area flux over the footprint', 'kg/(m^2 s)', 'transport'],
  ];
  return declareRows<I>('outdoorAir', rows);
}

/** Declarations of `outdoorAir.ssg-vf-1996`. */
export function ssgVfUncertainInputs(): UncertainInput<SsgVfInput>[] {
  type I = SsgVfInput;
  const rows: Row<I>[] = [
    ...chemicalRows<I>(['chemical']),
    ...jurySoilRows<I>(['soil']),
    ['qOverC', ['qOverC'], 'Dispersion factor Q/C', 'm/s', 'transport'],
    ['exposureTime', ['exposureTime'], 'Exposure interval', 's', 'site'],
    ['sourceDepth', ['sourceDepth'], 'Source depth for the mass-limit factor', 'm', 'site'],
  ];
  return declareRows<I>('outdoorAir', rows);
}
