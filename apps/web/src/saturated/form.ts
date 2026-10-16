import {
  convert,
  type FluctuationSchedule,
  type HydraulicModel,
  type SaturatedChemical,
  type SaturatedSourceInput,
} from '@model-flow/engine';

/** Every field is kept as the typed string, in the units the person types. */
export interface SaturatedForm {
  // source geometry and water table
  srcLength: string; // m, along the flow
  srcWidth: string; // m
  srcThickness: string; // m, total thickness H_s
  hMin: string; // m, minimum saturated thickness (low water)
  dh: string; // m, fluctuation height
  fractionHigh: string; // fraction of the year at high water
  schedule: FluctuationSchedule;
  // soil
  porosity: string;
  rhoB: string; // g/cm3
  foc: string;
  thetaR: string;
  n: string;
  hydraulicModel: 'default' | HydraulicModel;
  // aquifer and infiltration
  K: string; // m/d
  gradient: string; // m/m
  infiltration: string; // cm/yr
  // chemical
  F: string; // mg/kg
  M: string; // g/mol
  S: string; // mg/L
  H: string;
  Koc: string; // mL/g
  tphOn: boolean;
  FT: string; // mg/kg
  MT: string; // g/mol
  srcDecay: string; // 1/d, modern method only
  // run and display
  horizonYr: string;
  method: 'legacy' | 'modern' | 'both';
}

/**
 * Hand case A of the methods note (docs/methods/saturated-soil-source.md, "Fixtures"): a 10 m by
 * 10 m, 2 m thick benzene source in a hydrocarbon mixture with the water table rising 1 m from
 * 0.5 m saturated for a quarter of the year. The benzene properties are the RISC4 chemical
 * database values used by the Table R-7 vadose fixture; they are test inputs, not a database.
 */
export const DEFAULT_FORM: SaturatedForm = {
  srcLength: '10',
  srcWidth: '10',
  srcThickness: '2',
  hMin: '0.5',
  dh: '1',
  fractionHigh: '0.25',
  schedule: 'annual-mean',
  porosity: '0.3',
  rhoB: '1.7',
  foc: '0.002',
  thetaR: '0.05',
  n: '1.5',
  hydraulicModel: 'default',
  K: '5',
  gradient: '0.01',
  infiltration: '20',
  F: '50',
  M: '78',
  S: '1750',
  H: '0.228',
  Koc: '59',
  tphOn: true,
  FT: '5000',
  MT: '100',
  srcDecay: '0',
  horizonYr: '10',
  method: 'both',
};

/** The published hand-calculation values of case A, for the worked-example panel. */
export const CASE_A = {
  initialMassKg: 17,
  depletionDays: 1763.1226,
  seasonalDepletionDays: 1737.23,
  gammaPerYear: 0.20716087,
};

export interface SaturatedScenario {
  /** Engine input for the modern method (carries the source decay); the legacy run drops it. */
  input: SaturatedSourceInput;
}

export type ScenarioResult =
  { ok: true; scenario: SaturatedScenario } | { ok: false; errors: string[] };

const G_TO_KG = 1e-3;
const DAY = convert(1, 'd', 's');

function num(s: string): number {
  return s.trim() === '' ? NaN : Number(s);
}

export function isCaseA(f: SaturatedForm): boolean {
  const inputs = (x: SaturatedForm) =>
    JSON.stringify({ ...x, method: '', schedule: '', hydraulicModel: '', horizonYr: '' });
  return inputs(f) === inputs(DEFAULT_FORM);
}

export function toScenario(f: SaturatedForm): ScenarioResult {
  const errors: string[] = [];
  const need = (label: string, s: string, test: (v: number) => boolean, hint: string): number => {
    const v = num(s);
    if (!Number.isFinite(v) || !test(v)) {
      errors.push(`${label} ${hint}`);
      return NaN;
    }
    return v;
  };
  const pos = (v: number) => v > 0;
  const nonneg = (v: number) => v >= 0;

  const length = need('Source length', f.srcLength, pos, 'must be positive (m).');
  const width = need('Source width', f.srcWidth, pos, 'must be positive (m).');
  const thickness = need('Source thickness', f.srcThickness, pos, 'must be positive (m).');
  const hMin = need(
    'Minimum saturated thickness',
    f.hMin,
    (v) => v >= 0 && (!Number.isFinite(thickness) || v <= thickness),
    'must be zero or more and at most the source thickness (m).',
  );
  const dh = need('Water-table fluctuation', f.dh, nonneg, 'must be zero or more (m).');
  const fractionHigh = need(
    'Fraction of the year at high water',
    f.fractionHigh,
    (v) => v >= 0 && v <= 1,
    'must be between 0 and 1.',
  );

  const porosity = need(
    'Porosity',
    f.porosity,
    (v) => v > 0 && v <= 1,
    'must be above 0 and at most 1.',
  );
  const rhoB = convert(
    need('Bulk density', f.rhoB, pos, 'must be positive (g/cm3).'),
    'g/cm3',
    'kg/m3',
  );
  const foc = need(
    'Organic carbon fraction',
    f.foc,
    (v) => v >= 0 && v <= 1,
    'must be between 0 and 1.',
  );
  const thetaR = need(
    'Residual water content',
    f.thetaR,
    (v) => v >= 0 && (!Number.isFinite(porosity) || v < porosity),
    'must be zero or more and below the porosity.',
  );
  const n = need('van Genuchten n', f.n, (v) => v > 1, 'must be greater than 1.');

  const K = convert(
    need('Aquifer conductivity', f.K, pos, 'must be positive (m/d).'),
    'm/d',
    'm/s',
  );
  const gradient = need('Hydraulic gradient', f.gradient, nonneg, 'must be zero or more.');
  const infiltration = convert(
    need('Infiltration', f.infiltration, nonneg, 'must be zero or more (cm/yr).'),
    'cm/yr',
    'm/s',
  );

  const F = convert(
    need('Chemical in the source soil', f.F, nonneg, 'must be zero or more (mg/kg).'),
    'mg/kg',
    'kg/kg',
  );
  const chemical: SaturatedChemical = {
    F,
    M: need('Molar mass', f.M, pos, 'must be positive (g/mol).') * G_TO_KG,
    S: convert(need('Solubility', f.S, pos, 'must be positive (mg/L).'), 'mg/L', 'kg/m3'),
    H: need("Henry's constant", f.H, nonneg, 'must be zero or more (dimensionless).'),
    koc: convert(need('Koc', f.Koc, nonneg, 'must be zero or more (mL/g).'), 'mL/g', 'm3/kg'),
  };
  if (f.tphOn) {
    const FT = convert(
      need('TPH in the source soil', f.FT, pos, 'must be positive (mg/kg).'),
      'mg/kg',
      'kg/kg',
    );
    const MT = need('TPH molar mass', f.MT, pos, 'must be positive (g/mol).') * G_TO_KG;
    if (Number.isFinite(F) && Number.isFinite(FT) && F > FT) {
      errors.push('The chemical in the source soil cannot exceed the TPH in the source soil.');
    }
    chemical.FT = FT;
    chemical.MT = MT;
  }
  const decay = need('Source decay rate', f.srcDecay, nonneg, 'must be zero or more (1/d).') / DAY;
  const horizon = convert(
    need('Horizon', f.horizonYr, pos, 'must be positive (years).'),
    'yr',
    's',
  );

  if (errors.length > 0) return { ok: false, errors };

  const input: SaturatedSourceInput = {
    source: {
      length,
      width,
      thickness,
      minSaturatedThickness: hMin,
      fluctuation: dh,
      fractionHigh,
      schedule: f.schedule,
    },
    soil: {
      porosity,
      rhoB,
      foc,
      thetaR,
      n,
      ...(f.hydraulicModel === 'default' ? {} : { hydraulicModel: f.hydraulicModel }),
    },
    aquifer: { conductivity: K, gradient },
    infiltration,
    chemical,
    ...(decay > 0 ? { sourceDecayRate: decay } : {}),
    tEnd: horizon,
  };
  return { ok: true, scenario: { input } };
}
