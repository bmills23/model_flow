import type { RunInputRow } from '../project/runInputs';
import { FOUNDATIONS, TEXTURE_OPTIONS, type VaporForm } from './form';
import type { OutdoorForm } from './outdoor';

/** The words of each indoor air method, as the vapor screen names them. */
export const VAPOR_METHOD_WORDS = {
  legacy: 'Legacy Johnson and Ettinger',
  modern: 'Modern EPA',
  devaull: 'Oxygen-limited (DeVaull)',
} as const;

const SOURCE_WORDS: Record<VaporForm['source'], { medium: string; label: string; unit: string }> = {
  soil: { medium: 'Soil', label: 'Source concentration in soil', unit: 'mg/kg' },
  soilGas: { medium: 'Soil gas', label: 'Source concentration in soil gas', unit: 'mg/m3' },
  groundwater: {
    medium: 'Groundwater',
    label: 'Source concentration in groundwater',
    unit: 'mg/L',
  },
};

const typed = (v: string, unit = ''): string => `${v.trim()}${unit === '' ? '' : ` ${unit}`}`;

/**
 * The inputs of a vapor intrusion run, as the vapor screen showed them when its air concentrations were
 * sent to the exposure and risk screen: the source (and its medium, or the screen that fed it), the
 * chemical properties the run used, the soil column, the building and, when outdoor air was sent, the
 * outdoor box. Values are the form's own text with their units.
 */
export function vaporRunInputs(args: {
  form: VaporForm;
  outdoor: OutdoorForm;
  method: keyof typeof VAPOR_METHOD_WORDS;
  /** The label of the result of another screen the source was taken from, or null for the entered source. */
  fedBy: string | null;
  /** True when outdoor air was sent with the indoor air. */
  withOutdoor: boolean;
}): RunInputRow[] {
  const { form: f, outdoor: o } = args;
  const rows: RunInputRow[] = [];
  const add = (label: string, value: string): void => {
    rows.push({ label, value });
  };
  add('Indoor air method', VAPOR_METHOD_WORDS[args.method]);
  const src = SOURCE_WORDS[f.source];
  if (args.fedBy !== null) {
    add('Source', `fed by another screen's result (${args.fedBy})`);
  } else {
    add('Source medium', src.medium);
    add(
      src.label,
      typed(
        f.source === 'soil' ? f.soilConc : f.source === 'soilGas' ? f.soilGas : f.cgw,
        src.unit,
      ),
    );
    if (f.source === 'soil' && f.tphOn) {
      add('Total petroleum hydrocarbon in soil', typed(f.tph, 'mg/kg'));
      add('Total petroleum hydrocarbon molar mass', typed(f.tphMolarMass, 'g/mol'));
    }
  }
  add('Molar mass', typed(f.M, 'g/mol'));
  add('Solubility', typed(f.S, 'mg/L'));
  add("Henry's constant", typed(f.H));
  add('Organic carbon partition coefficient', typed(f.Koc, 'mL/g'));
  add('Diffusion in air', typed(f.Da, 'cm2/s'));
  add('Diffusion in water', typed(f.Dw, 'cm2/s'));
  add('Soil temperature', typed(f.temperature, 'deg C'));
  add('Depth of the foundation floor below grade', typed(f.floorDepth, 'm'));
  f.layers.forEach((l, i) => {
    const texture = TEXTURE_OPTIONS.find((t) => t.value === l.texture)?.label ?? l.texture;
    add(
      `Soil layer ${i + 1}, ${l.name.trim() || 'unnamed'}`,
      `${typed(l.thickness, 'm')} thick, ${texture}, porosity ${typed(l.porosity)}, moisture ${typed(l.moisture)}, bulk density ${typed(l.bulkDensity, 'g/cm3')}, organic carbon ${typed(l.foc)}`,
    );
  });
  add('Foundation', FOUNDATIONS.find((x) => x.value === f.foundation)?.label ?? f.foundation);
  add('Floor area', typed(f.floorArea, 'm2'));
  add('Building volume', typed(f.volume, 'm3'));
  add('Air exchange rate', typed(f.airExchange, '1/h'));
  add('Fraction of the floor that is crack', typed(f.crackFraction));
  add('Foundation thickness', typed(f.foundationThickness, 'm'));
  if (f.soilGasMode === 'entered') {
    add('Soil gas flow into the building', typed(f.qsoil, 'L/min'));
  } else {
    add('Indoor to outdoor pressure difference', typed(f.dP, 'Pa'));
    add('Soil vapor permeability', typed(f.kv, 'cm2'));
    add('Crack seam length', typed(f.seam, 'm'));
    if (f.soilGasMode === 'default') {
      add(
        'Soil gas flow into the building (modern method)',
        'the method default ratio to the building air flow',
      );
    }
  }
  if (args.method === 'devaull') {
    add(
      'Aerobic biodegradation rate in water',
      f.dvKw.trim() === '' ? 'none (not degrading)' : typed(f.dvKw, '1/h'),
    );
    add('Oxygen at the base of the foundation', typed(f.dvO2Percent, '% by volume'));
    add('Oxygen needed per mass of chemical', typed(f.dvMassRatio, 'g/g'));
  }
  if (args.withOutdoor) {
    add('Outdoor wind speed', typed(o.windSpeed, 'm/s'));
    add('Outdoor mixing height', typed(o.mixingHeight, 'm'));
    add('Outdoor box length along the wind', typed(o.boxLength, 'm'));
    add('Outdoor box width', typed(o.boxWidth, 'm'));
  }
  return rows;
}
