import type { RunInputRow } from '../project/runInputs';
import { methodName } from '../project/runInputs';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { WellFeed } from '../transport/wellFeed';
import { volatileVerdict } from './compute';
import { PARTICULATE_ORIGIN, SHOWER_ORIGIN, type HouseholdForm } from './form';

/** Which of the household results the run sent: the shower air, the sprinkler spray air, the particulate air. */
export interface HouseholdSent {
  shower: boolean;
  spray: boolean;
  particulate: boolean;
}

/**
 * The inputs of a household run, as the household screen showed them when its air concentrations were
 * sent to the exposure and risk screen: the water and soil concentrations (a water concentration taken
 * from the well or surface water result is named as fed), the chemical properties, and the inputs of each
 * process that was sent. A field left blank is not listed.
 */
export function householdRunInputs(
  form: HouseholdForm,
  held: { well: WellFeed | null; surface: SurfaceWaterFeed | null },
  sent: HouseholdSent,
): RunInputRow[] {
  const rows: RunInputRow[] = [];
  const text = (label: string, value: string): void => {
    rows.push({ label, value });
  };
  const field = (label: string, v: string, unit = ''): void => {
    if (v.trim() !== '') text(label, `${v.trim()}${unit === '' ? '' : ` ${unit}`}`);
  };
  const entered = (): string =>
    form.waterConcentration.trim() === ''
      ? 'not entered'
      : `${form.waterConcentration.trim()} mg/L`;
  const waterNote = (source: 'entered' | 'well' | 'surface'): string => {
    if (source === 'well') {
      return held.well === null
        ? 'from the well result of the groundwater screen'
        : `fed by the well result of the groundwater screen (${held.well.label})`;
    }
    if (source === 'surface') {
      return held.surface === null
        ? 'from the surface water result'
        : `fed by the surface water result (${held.surface.label})`;
    }
    return entered();
  };
  if (sent.shower) {
    text('Shower method', methodName(SHOWER_ORIGIN[form.showerMethod]));
    text('Tap water concentration for the shower', waterNote(form.showerWaterSource));
  }
  if (sent.spray) {
    text('Irrigation water concentration for the sprinkler', waterNote(form.irrigationWaterSource));
  }
  if (sent.particulate) {
    text('Particulate method', methodName(PARTICULATE_ORIGIN[form.particulateMethod]));
    field('Soil concentration', form.soilConcentration, 'mg/kg');
  }
  field("Henry's constant", form.henry);
  field('Molecular weight', form.molecularWeight, 'g/mol');
  field("Henry's constant for the volatility test", form.henryAtm, 'atm m3/mol');
  field('Vapor pressure', form.vaporPressure, 'mm Hg');
  if (sent.shower && form.showerMethod === 'rsl') {
    text('Volatility', volatileVerdict(form).volatile ? 'volatile' : 'not volatile');
    field('Household transfer factor', form.householdFactor, 'L of water per m3 of air');
  }
  field('Gas film reference coefficient', form.filmGas, 'cm/h');
  field('Liquid film reference coefficient', form.filmLiquid, 'cm/h');
  if (sent.shower && form.showerMethod !== 'rsl') {
    field('Shower droplet diameter', form.showerDropletDiameter, 'mm');
    field('Shower droplet fall time', form.showerFallTime, 's');
    field('Shower water flow', form.showerFlow, 'L/min');
    field('Shower duration', form.showerMinutes, 'min');
    field('Shower stall volume', form.stallVolume, 'm3');
    if (form.showerMethod === 'little') {
      field('Stall ventilation', form.ventilation, 'm3/min');
      field('Time after the water is off', form.postShowerMinutes, 'min');
    }
  }
  if (sent.spray) {
    field('Sprinkler droplet diameter', form.sprayDropletDiameter, 'mm');
    field('Sprinkler droplet fall time', form.sprayFallTime, 's');
    field('Sprinkler flow', form.sprinklerFlow, 'L/min');
    field('Irrigation application rate', form.applicationRate, 'mm/h');
  }
  if (sent.spray || sent.particulate) {
    field('Outdoor wind speed', form.windSpeed, 'm/s');
    field('Outdoor mixing height', form.mixingHeight, 'm');
    field('Outdoor box length', form.boxLength, 'm');
    field('Outdoor box width', form.boxWidth, 'm');
  }
  if (sent.particulate) {
    field('Vegetative cover fraction', form.vegetativeCover);
    field('Mean annual wind speed', form.meanWind, 'm/s');
    field('Threshold wind speed', form.thresholdWind, 'm/s');
    field('Windblown dust function F(x)', form.fx);
    field('Dispersion factor Q/C', form.qOverC, 'g/(m2 s) per kg/m3');
    field('PM10 emission flux', form.pm10Flux, 'g/(m2 s)');
  }
  return rows;
}
