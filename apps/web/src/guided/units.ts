import type { SourceValueKey } from './state';

/**
 * Step 3b units. A source concentration is typed in the unit the lab reported and stored with that
 * unit; the Run reads it through `sourceNumber`, in the unit the models take: mg/L for water, mg/kg for
 * soil and mg/m3 for soil gas and air.
 */

export type UnitClass = 'water' | 'soil' | 'air';

export const unitClassOf = (medium: SourceValueKey): UnitClass => {
  if (medium === 'groundwater' || medium === 'surfaceWater') return 'water';
  if (medium === 'soilGas' || medium === 'indoorAir' || medium === 'outdoorAir') return 'air';
  return 'soil';
};

/** Each unit with its factor to the model unit of its class. */
const FACTORS: Record<UnitClass, Record<string, number>> = {
  water: { 'ng/L': 1e-6, 'ug/L': 1e-3, 'mg/L': 1 },
  soil: { 'ug/kg': 1e-3, 'mg/kg': 1, 'g/kg': 1e3 },
  air: { 'ng/m3': 1e-6, 'ug/m3': 1e-3, 'mg/m3': 1 },
};

export const MODEL_UNIT: Record<UnitClass, string> = {
  water: 'mg/L',
  soil: 'mg/kg',
  air: 'mg/m3',
};

export const unitsFor = (medium: SourceValueKey): string[] =>
  Object.keys(FACTORS[unitClassOf(medium)]);

/** The unit a column starts with: the model unit, so a value typed without a unit choice is read as is. */
export const defaultUnit = (medium: SourceValueKey): string => MODEL_UNIT[unitClassOf(medium)];

const SPELLINGS: Record<string, string> = {
  'ug/l': 'ug/L',
  'µg/l': 'ug/L',
  'μg/l': 'ug/L',
  'mg/l': 'mg/L',
  'ng/l': 'ng/L',
  ppb: 'ug/L',
  'mg/kg': 'mg/kg',
  'ug/kg': 'ug/kg',
  'µg/kg': 'ug/kg',
  'μg/kg': 'ug/kg',
  'g/kg': 'g/kg',
  ppm: 'mg/kg',
  'ug/m3': 'ug/m3',
  'µg/m3': 'ug/m3',
  'μg/m3': 'ug/m3',
  'mg/m3': 'mg/m3',
  'ng/m3': 'ng/m3',
};

/**
 * A spreadsheet's spelling of a unit read as one of the units offered for the medium, or null. "ppb" is
 * read as ug/L only for water and as ug/kg for soil; "ppm" as mg/L for water and mg/kg for soil.
 */
export function normalizeUnit(text: string, medium: SourceValueKey): string | null {
  const cls = unitClassOf(medium);
  const key = text.trim().toLowerCase().replace(/\s+/g, '').replace(/\^/g, '').replace(/³/g, '3');
  let unit = SPELLINGS[key];
  if (unit === undefined) return null;
  if (cls === 'soil' && key === 'ppb') unit = 'ug/kg';
  if (cls === 'water' && key === 'ppm') unit = 'mg/L';
  return unit in FACTORS[cls] ? unit : null;
}

export type ValueClass =
  { kind: 'blank' } | { kind: 'nd' } | { kind: 'number'; value: number } | { kind: 'invalid' };

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/**
 * What a typed 3b value is. "ND" (not detected) is a valid answer; a number must be above zero (a
 * chemical that is not there is "ND", not zero); anything else is not usable.
 */
export function classifyValue(text: string): ValueClass {
  const t = text.trim();
  if (t === '') return { kind: 'blank' };
  if (t.toLowerCase() === 'nd') return { kind: 'nd' };
  if (!NUMBER.test(t)) return { kind: 'invalid' };
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? { kind: 'number', value: v } : { kind: 'invalid' };
}

/**
 * The concentration in the model unit: the number converted, 0 for ND (not detected: the chemical adds
 * nothing from this medium), or null when the value is blank, unreadable or the unit is not one for the
 * medium.
 */
export function sourceNumber(text: string, unit: string, medium: SourceValueKey): number | null {
  const c = classifyValue(text);
  if (c.kind === 'nd') return 0;
  if (c.kind !== 'number') return null;
  const f = FACTORS[unitClassOf(medium)][unit];
  return f === undefined ? null : c.value * f;
}
