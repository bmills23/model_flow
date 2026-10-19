import type { UncertainInput } from '../../registry/index.js';
import { declareRows, type Row } from '../vapor/uncertain.js';
import type { HhrapProduceInput } from './hhrap.js';
import type { LegacyPlantInput } from './legacy.js';

/**
 * Uncertain-input declarations of the plant uptake methods (uncertainty note, ruling 2). Ids are
 * `plantUptake.<name>`. Optional blocks the base input omits (vapor air concentration, growing period,
 * irrigation use, user BCF) read NaN and `set` refuses on an absent parent; a caller samples only inputs
 * whose base value is finite. The produce class and the ionizable and inorganic flags are switches,
 * not parameters.
 */

const FRACTION = [0, 1] as const;
const ANY = [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY] as const;

/** Declarations of `plantUptake.trapp-matthies-1995`. */
export function legacyPlantUncertainInputs(): UncertainInput<LegacyPlantInput>[] {
  type I = LegacyPlantInput;
  const rows: Row<I>[] = [
    ['logKow', ['logKow'], 'Log octanol-water partition coefficient', '1', 'chemical', ANY],
    [
      'soil.concentration',
      ['soil', 'concentration_kg_per_kg'],
      'Soil concentration',
      'kg/kg',
      'site',
    ],
    [
      'soil.bulkDensity',
      ['soil', 'bulkDensity_kg_per_m3'],
      'Soil dry bulk density',
      'kg/m^3',
      'site',
    ],
    [
      'soil.waterFilledPorosity',
      ['soil', 'waterFilledPorosity'],
      'Water-filled porosity',
      '1',
      'site',
      FRACTION,
    ],
    ['soil.kd', ['soil', 'kd_m3_per_kg'], 'Soil-water partition coefficient', 'm^3/kg', 'chemical'],
    [
      'airConcentration',
      ['airConcentration_kg_per_m3'],
      'Gas-phase air concentration',
      'kg/m^3',
      'site',
    ],
    [
      'leaf.tscf',
      ['leaf', 'tscf'],
      'Transpiration stream concentration factor',
      '1',
      'chemical',
      FRACTION,
    ],
    [
      'leaf.transpiration',
      ['leaf', 'transpiration_m3_per_d'],
      'Transpiration rate',
      'm^3/d',
      'site',
    ],
    ['leaf.conductance', ['leaf', 'conductance_m_per_d'], 'Leaf conductance', 'm/d', 'transport'],
    ['leaf.area', ['leaf', 'leafArea_m2'], 'Leaf area', 'm^2', 'site'],
    ['leaf.mass', ['leaf', 'mass_kg'], 'Plant mass', 'kg', 'site'],
    [
      'leaf.kLeafAir',
      ['leaf', 'kLeafAir_m3_per_kg'],
      'Leaf-air partition coefficient',
      'm^3/kg',
      'chemical',
    ],
    [
      'leaf.lossRate',
      ['leaf', 'lossRate_per_d'],
      'Growth dilution and metabolism rate',
      '1/d',
      'chemical',
    ],
    ['growthPeriod', ['growthPeriod_d'], 'Growing period', 'd', 'site'],
    [
      'rootZoneWater',
      ['rootZoneWater_kg_per_m3'],
      'Root-zone water concentration',
      'kg/m^3',
      'site',
    ],
    [
      'irrigation.concentration',
      ['irrigation', 'input', 'concentration_mg_per_L'],
      'Irrigation water concentration',
      'mg/L',
      'site',
    ],
    [
      'irrigation.applicationRate',
      ['irrigation', 'input', 'applicationRate_L_per_m2_per_d'],
      'Irrigation application rate',
      'L/(m^2 d)',
      'site',
    ],
    [
      'irrigation.interceptionFraction',
      ['irrigation', 'interceptionFraction'],
      'Fraction of applied mass intercepted by the foliage',
      '1',
      'site',
      FRACTION,
    ],
    [
      'irrigation.plantedArea',
      ['irrigation', 'plantedArea_m2'],
      'Planted ground area',
      'm^2',
      'site',
    ],
    ['userBcf', ['userBcf'], 'User bioconcentration factor', '1', 'chemical'],
  ];
  return declareRows<I>('plantUptake', rows);
}

/** Declarations of `plantUptake.hhrap-2005`. */
export function hhrapPlantUncertainInputs(): UncertainInput<HhrapProduceInput>[] {
  type I = HhrapProduceInput;
  const rows: Row<I>[] = [
    ['logKow', ['logKow'], 'Log octanol-water partition coefficient', '1', 'chemical', ANY],
    ['kaw', ['kaw'], "Dimensionless Henry's constant", '1', 'chemical'],
    ['kd', ['kd_m3_per_kg'], 'Soil-water partition coefficient', 'm^3/kg', 'chemical'],
    ['soilConcentration', ['soilConcentration_kg_per_kg'], 'Soil concentration', 'kg/kg', 'site'],
    [
      'vaporAirConcentration',
      ['vaporAirConcentration_kg_per_m3'],
      'Vapor-phase air concentration',
      'kg/m^3',
      'site',
    ],
    ['userBr', ['userBr'], 'User plant-soil bioconcentration factor', 'kg/kg', 'chemical'],
  ];
  return declareRows<I>('plantUptake', rows);
}
