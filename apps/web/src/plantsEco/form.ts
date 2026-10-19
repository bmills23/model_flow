import type { EfhAgeGroup, ProduceClass } from '@model-flow/engine';

export type UptakeChoice = 'legacy' | 'modern';
export type IntakeMode = 'efh' | 'custom';
export type TphSet = 'tphcwg' | 'madep';

/** One produce class of a user-entered intake. Blank intake means the class is not eaten. */
export interface CustomIntake {
  /** g fresh weight per kg body weight per day. */
  gPerKgDay: string;
  /** Preparation loss fraction, blank is 0. */
  loss: string;
  /** Fraction homegrown, no default. */
  homegrown: string;
}

export interface BenchmarkRow {
  receptor: string;
  /** mg/kg dry weight in soil. */
  value: string;
  citation: string;
}

/** One surrogate receptor of the site-specific wildlife dose panel. Every number is text, as typed. */
export interface WildlifeRowForm {
  group: 'avian' | 'mammalian';
  surrogate: string;
  /** Eco-SSL document table and page the row was prefilled from; blank for a user row. */
  table: string;
  page: string;
  /** Toxicity reference value, mg per kg body weight per day. */
  trv: string;
  /** Food ingestion rate, kg dry weight per kg body weight per day. */
  fir: string;
  /** Soil as a proportion of the diet, 0 to 1. */
  ps: string;
  /** Area use factor, 0 to 1. */
  auf: string;
  /** Soil-to-food uptake form: ratio Bi = a C, ln ln Bi = a ln S + b, affine Bi = a C + b. */
  form: 'ratio' | 'ln' | 'affine';
  a: string;
  b: string;
  /** Diet concentration factor, blank is 1. */
  cdiet: string;
  /** Eco-SSL printed in the document for this surrogate, mg/kg dry weight (blank for a user row). */
  printed: string;
}

export interface TphFractionRow {
  label: string;
  family: 'aliphatic' | 'aromatic';
  /** Mass fraction of the total TPH, kg/kg. */
  massFraction: string;
  /** RSL surrogate record id or blank (unmapped). */
  surrogate: string;
  /** Level of this fraction alone for a hazard quotient of one, mg/kg (from the cleanup screen). */
  level: string;
}

export interface PlantsEcoForm {
  chemicalId: string;
  chemicalName: string;
  /** Soil concentration, mg/kg dry weight. */
  soilConcentration: string;

  // chemical properties (RSL values prefilled on selection, editable)
  logKow: string;
  koc: string;
  /** Soil-water Kd in L/kg; blank means Koc times foc. */
  kd: string;
  ionizable: boolean;
  inorganic: boolean;
  /** User bioconcentration factor for an inorganic (kg/kg; fresh weight for the legacy method, dry weight for the modern). */
  userBcf: string;

  // soil
  bulkDensity: string;
  waterFilledPorosity: string;
  foc: string;

  // uptake method
  uptake: UptakeChoice;
  tscf: string;
  transpiration: string;
  conductance: string;
  leafArea: string;
  plantMass: string;
  kLeafAir: string;
  lossRate: string;
  growthPeriod: string;
  moistureFraction: string;

  // intake
  intakeMode: IntakeMode;
  ageGroup: EfhAgeGroup;
  custom: Record<ProduceClass, CustomIntake>;

  // ecology
  benchmarks: BenchmarkRow[];

  // wildlife dose panel
  wildlifeRows: WildlifeRowForm[];

  // TPH
  tphSet: TphSet;
  tphTotal: string;
  tphTargetHi: string;
  tphThetaA: string;
  tphFractions: TphFractionRow[];
}

const emptyIntake = (): CustomIntake => ({ gPerKgDay: '', loss: '', homegrown: '' });

export const DEFAULT_FORM: PlantsEcoForm = {
  chemicalId: '',
  chemicalName: '',
  soilConcentration: '',
  logKow: '',
  koc: '',
  kd: '',
  ionizable: false,
  inorganic: false,
  userBcf: '',
  bulkDensity: '',
  waterFilledPorosity: '',
  foc: '',
  uptake: 'modern',
  tscf: '',
  transpiration: '',
  conductance: '',
  leafArea: '',
  plantMass: '',
  kLeafAir: '',
  lossRate: '',
  growthPeriod: '',
  moistureFraction: '',
  intakeMode: 'efh',
  ageGroup: '20 to 39',
  custom: {
    abovegroundExposed: emptyIntake(),
    abovegroundProtected: emptyIntake(),
    root: emptyIntake(),
  },
  benchmarks: [],
  wildlifeRows: [],
  tphSet: 'tphcwg',
  tphTotal: '',
  tphTargetHi: '1',
  tphThetaA: '',
  tphFractions: [],
};

export const CLASS_LABELS: Record<ProduceClass, string> = {
  abovegroundExposed: 'Above-ground, exposed',
  abovegroundProtected: 'Above-ground, protected',
  root: 'Root',
};

export type Fail = { ok: false; errors: string[] };
export type Section<T> = ({ ok: true } & T) | Fail;

export type NumberKey = {
  [K in keyof PlantsEcoForm]: PlantsEcoForm[K] extends string ? K : never;
}[keyof PlantsEcoForm];

export interface ReadOpts {
  /** pos: above 0 (default); nonneg: 0 allowed; unit: within [0, 1]; unitOpen: [0, 1); any: any number. */
  min?: 'pos' | 'nonneg' | 'unit' | 'unitOpen' | 'any';
}

/** Reads a number from text; a failed read adds an error and returns NaN. */
export function readNumber(raw: string, label: string, errors: string[], opts?: ReadOpts): number {
  const t = raw.trim();
  if (t === '') {
    errors.push(`${label} is required`);
    return NaN;
  }
  const v = Number(t);
  if (!Number.isFinite(v)) {
    errors.push(`${label} must be a number`);
    return NaN;
  }
  const min = opts?.min ?? 'pos';
  if (min === 'pos' && !(v > 0)) errors.push(`${label} must be above 0`);
  else if (min === 'nonneg' && v < 0) errors.push(`${label} must not be negative`);
  else if (min === 'unit' && (v < 0 || v > 1)) errors.push(`${label} must be between 0 and 1`);
  else if (min === 'unitOpen' && (v < 0 || v >= 1))
    errors.push(`${label} must be at least 0 and below 1`);
  else return v;
  return NaN;
}

/** A blank optional entry is undefined; anything else is read like a required number. */
export function readOptional(
  raw: string,
  label: string,
  errors: string[],
  opts?: ReadOpts,
): number | undefined {
  if (raw.trim() === '') return undefined;
  const v = readNumber(raw, label, errors, opts);
  return Number.isNaN(v) ? undefined : v;
}
