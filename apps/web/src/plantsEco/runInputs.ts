import type { RunInputRow } from '../project/runInputs';
import type { PlantsEcoForm } from './form';

/**
 * The inputs of a homegrown produce run, as the plants screen showed them when its plant factors were
 * sent to the exposure and risk screen: the soil concentration, the chemical properties, the soil, and
 * the inputs of the uptake method that made the factors. The method and the intake preset are listed by
 * the report beside these. A field left blank is not listed.
 */
export function produceRunInputs(form: PlantsEcoForm): RunInputRow[] {
  const rows: RunInputRow[] = [];
  const field = (label: string, v: string, unit = ''): void => {
    if (v.trim() !== '') rows.push({ label, value: `${v.trim()}${unit === '' ? '' : ` ${unit}`}` });
  };
  const text = (label: string, value: string): void => {
    rows.push({ label, value });
  };
  const modern = form.uptake === 'modern';
  field('Soil concentration', form.soilConcentration, 'mg/kg dry weight');
  field('Log of the octanol-water partition coefficient', form.logKow);
  if (form.kd.trim() !== '') {
    field('Soil-water partition coefficient', form.kd, 'L/kg');
  } else {
    field('Organic carbon partition coefficient', form.koc, 'L/kg');
    field('Fraction organic carbon in soil', form.foc);
  }
  text('Ionizable at the soil pH', form.ionizable ? 'yes' : 'no');
  if (form.inorganic) {
    text('Chemical type', 'inorganic');
    field('Bioconcentration factor', form.userBcf, 'kg/kg');
  }
  field('Soil dry bulk density', form.bulkDensity, 'kg/L');
  if (modern) {
    field('Moisture fraction of the fresh produce', form.moistureFraction);
  } else {
    field('Water-filled porosity', form.waterFilledPorosity);
    if (!form.inorganic) {
      field('Transpiration stream concentration factor', form.tscf);
      field('Transpiration rate', form.transpiration, 'L/d');
      field('Leaf conductance', form.conductance, 'm/d');
      field('Leaf area', form.leafArea, 'm2');
      field('Plant mass', form.plantMass, 'kg');
      field('Leaf-air partition coefficient', form.kLeafAir, 'm3/kg');
      field('Loss rate from growth dilution and metabolism', form.lossRate, '1/d');
      field('Growing period', form.growthPeriod, 'd');
    }
  }
  return rows;
}
