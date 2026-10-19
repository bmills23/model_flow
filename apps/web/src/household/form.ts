import { PARTICULATE_DEFAULTS } from '@model-flow/engine';

/**
 * The household screen form. Every field is a string so a half-typed number never throws. Only values
 * a primary source supports are prefilled (the soil screening guidance wind erosion defaults); the
 * chemical, the shower and sprinkler geometry and the household factor are entered.
 */
export interface HouseholdForm {
  /** CAS-style id the risk and cleanup screens key chemicals by; needed only to send results on. */
  chemicalId: string;
  chemicalName: string;
  waterConcentration: string; // mg/L
  soilConcentration: string; // mg/kg
  henry: string; // dimensionless
  molecularWeight: string; // g/mol
  /** Henry constant in atm m3/mol, for the RSL volatility criterion (the dimensionless one is above). */
  henryAtm: string;
  vaporPressure: string; // mm Hg
  /** 'auto' applies the criterion to the two fields above; the others override its verdict. */
  volatileOverride: VolatileOverride;
  householdFactor: string; // L water per m3 air
  filmGas: string; // cm/h, blank with filmLiquid blank = RISC5 choice (warned)
  filmLiquid: string; // cm/h
  showerDropletDiameter: string; // mm
  showerFallTime: string; // s
  showerFlow: string; // L/min
  showerMinutes: string; // min
  stallVolume: string; // m3
  ventilation: string; // m3/min
  postShowerMinutes: string; // min
  sprayDropletDiameter: string; // mm
  sprayFallTime: string; // s
  sprinklerFlow: string; // L/min
  applicationRate: string; // mm/h, optional (handoff to plant uptake)
  alsoPotable: boolean;
  windSpeed: string; // m/s
  mixingHeight: string; // m
  boxLength: string; // m
  boxWidth: string; // m
  vegetativeCover: string;
  meanWind: string; // m/s
  thresholdWind: string; // m/s
  fx: string;
  qOverC: string; // g/(m2 s) per kg/m3, blank = each method's guidance default
  pm10Flux: string; // g/(m2 s), blank = wind erosion flux
  showerMethod: ShowerChoice;
  particulateMethod: ParticulateChoice;
  /** Where the tap water concentration comes from: the entered value or the held transport well series. */
  showerWaterSource: ShowerWaterSource;
  /** Where the irrigation water concentration comes from. */
  irrigationWaterSource: IrrigationWaterSource;
}

export type ShowerWaterSource = 'entered' | 'well';
export type IrrigationWaterSource = 'entered' | 'well' | 'surface';

/** Registered method id of each choice, the origin carried onto the exposure point concentration. */
export const SHOWER_ORIGIN: Record<ShowerChoice, string> = {
  legacy: 'shower.fc-1986',
  little: 'shower.little-1992',
  rsl: 'shower.rsl-household',
};
export const PARTICULATE_ORIGIN: Record<ParticulateChoice, string> = {
  box: 'particulate.box-emission',
  pef1996: 'particulate.ssg-pef-1996',
  pef2002: 'particulate.ssg-pef-2002',
};
export const SPRINKLER_ORIGIN = 'irrigation.sprinkler-fc';

export type VolatileOverride = 'auto' | 'volatile' | 'nonvolatile';
export type ShowerChoice = 'legacy' | 'little' | 'rsl';
export type ParticulateChoice = 'box' | 'pef1996' | 'pef2002';

export const DEFAULT_FORM: HouseholdForm = {
  chemicalId: '',
  chemicalName: '',
  waterConcentration: '',
  soilConcentration: '',
  henry: '',
  molecularWeight: '',
  henryAtm: '',
  vaporPressure: '',
  volatileOverride: 'auto',
  householdFactor: '',
  filmGas: '',
  filmLiquid: '',
  showerDropletDiameter: '',
  showerFallTime: '',
  showerFlow: '',
  showerMinutes: '',
  stallVolume: '',
  ventilation: '',
  postShowerMinutes: '',
  sprayDropletDiameter: '',
  sprayFallTime: '',
  sprinklerFlow: '',
  applicationRate: '',
  alsoPotable: false,
  windSpeed: '',
  mixingHeight: '',
  boxLength: '',
  boxWidth: '',
  vegetativeCover: String(PARTICULATE_DEFAULTS.vegetativeCover),
  meanWind: String(PARTICULATE_DEFAULTS.meanWind),
  thresholdWind: String(PARTICULATE_DEFAULTS.thresholdWind),
  fx: String(PARTICULATE_DEFAULTS.fx),
  qOverC: '',
  pm10Flux: '',
  showerMethod: 'little',
  particulateMethod: 'pef1996',
  showerWaterSource: 'entered',
  irrigationWaterSource: 'entered',
};

export type Reader = (key: keyof HouseholdForm, label: string, opts?: ReadOpts) => number;
interface ReadOpts {
  min?: 'pos' | 'nonneg';
}

/** Collects errors while reading fields; a failed read returns NaN so the caller can stop cleanly. */
export function makeReader(form: HouseholdForm, errors: string[]): Reader {
  return (key, label, opts) => {
    const raw = String(form[key]).trim();
    if (raw === '') {
      errors.push(`${label} is required`);
      return NaN;
    }
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      errors.push(`${label} must be a number`);
      return NaN;
    }
    if ((opts?.min ?? 'pos') === 'pos' && !(v > 0)) {
      errors.push(`${label} must be above 0`);
      return NaN;
    }
    if (opts?.min === 'nonneg' && v < 0) {
      errors.push(`${label} must not be negative`);
      return NaN;
    }
    return v;
  };
}

export const isBlank = (form: HouseholdForm, key: keyof HouseholdForm): boolean =>
  String(form[key]).trim() === '';
