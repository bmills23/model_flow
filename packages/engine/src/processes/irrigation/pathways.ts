import type { Warning } from '../../registry/index.js';
import { checkNonNeg, checkPos } from '../vapor/units.js';
import { sprinklerAir, type SprinklerBox, type SprinklerInput } from './sprinkler.js';

/**
 * Irrigation pathways (`irrigation.pathways`): irrigation water feeds incidental ingestion and dermal
 * contact through the existing M4 kernels (the EPC is the water concentration; the irrigation exposure
 * factors are the caller's, no defaults), spray inhalation through the sprinkler box, and garden
 * vegetables through the M9 `IrrigationSource`. Linear in the water concentration.
 */
export interface IrrigationSource {
  origin: 'irrigation.pathways';
  /** kg/m^3 as a function of time, s (constant or the M1 well series). */
  waterConcentration: (t: number) => number;
  /** Water depth applied per unit time while irrigating, m/s. */
  applicationRate: number;
  /** Irrigation period within the year, days. */
  season?: { startDay: number; endDay: number };
  chemical: string;
}

export interface IrrigationSourceInput {
  waterConcentration: (t: number) => number;
  applicationRate: number;
  season?: { startDay: number; endDay: number };
  chemical: string;
}

export function irrigationSource(p: IrrigationSourceInput): IrrigationSource {
  checkPos('application rate', p.applicationRate);
  if (p.season) {
    checkNonNeg('season start day', p.season.startDay);
    checkNonNeg('season end day', p.season.endDay);
    if (p.season.endDay < p.season.startDay) {
      throw new RangeError('season end day must not be before the start day');
    }
  }
  return {
    origin: 'irrigation.pathways',
    waterConcentration: p.waterConcentration,
    applicationRate: p.applicationRate,
    ...(p.season ? { season: { ...p.season } } : {}),
    chemical: p.chemical,
  };
}

export interface IrrigationInput {
  sprinkler: SprinklerInput;
  box: SprinklerBox;
  /** m/s, passed to the M9 source. */
  applicationRate: number;
  season?: { startDay: number; endDay: number };
  chemical: string;
  /** The irrigation water is also the potable supply. */
  alsoPotable?: boolean;
}

export interface IrrigationEpcs {
  /** Incidental ingestion EPC, kg/m^3 (M4 pathway 8). */
  ingestion: number;
  /** Dermal contact EPC, kg/m^3 (M4 pathway 9). */
  dermal: number;
  /** Spray inhalation outdoor air, kg/m^3 (M4 pathway 7). */
  sprayAir: number;
  forPlants: IrrigationSource;
  warnings: Warning[];
}

export function irrigationEpcs(cw: number, p: IrrigationInput): IrrigationEpcs {
  checkNonNeg('water concentration', cw);
  const air = sprinklerAir(cw, p.sprinkler, p.box);
  const warnings = [...air.warnings];
  if (p.alsoPotable) {
    warnings.push({
      code: 'irrigation.potable-source',
      message:
        'The irrigation source is also the potable supply; the indoor drinking and bathing pathways will dominate the exposure.',
    });
  }
  return {
    ingestion: cw,
    dermal: cw,
    sprayAir: air.concentration,
    forPlants: irrigationSource({
      waterConcentration: () => cw,
      applicationRate: p.applicationRate,
      ...(p.season ? { season: p.season } : {}),
      chemical: p.chemical,
    }),
    warnings,
  };
}
