import {
  SOIL_TEXTURES,
  convert,
  type HydraulicModel,
  type LayeredInput,
  type VadoseChemical,
  type VadsatInput,
  type VadsatLayer,
  type VadsatSoil,
} from '@model-flow/engine';
import type { TextureChoice } from '../vapor/form';

/** One soil layer in the units the person types. Every field is kept as the typed string. */
export interface LayerForm {
  texture: TextureChoice; // preset the hydraulic values were filled from; custom = entered by hand
  thickness: string; // m
  thetaS: string; // total porosity
  thetaR: string; // residual water content
  n: string; // van Genuchten n
  Ks: string; // m/d
  rhoB: string; // g/cm3
  foc: string; // organic carbon fraction
}

export interface VadoseForm {
  infiltration: string; // cm/yr
  // chemical
  chemicalId: string; // database row the properties were filled from; blank = entered by hand
  M: string; // g/mol
  S: string; // mg/L
  H: string; // dimensionless
  Koc: string; // mL/g
  Da: string; // cm2/s
  Dw: string; // cm2/s
  mu: string; // 1/d, decay of the dissolved chemical below the source
  // source
  source: LayerForm;
  srcLength: string; // m
  srcWidth: string; // m
  srcF: string; // mg/kg
  tphOn: boolean;
  srcFT: string; // mg/kg
  srcMT: string; // g/mol
  srcDecay: string; // 1/d
  // profile, from the ground surface down above the source and from the source base down below it
  above: LayerForm[];
  below: LayerForm[];
  // run and display
  durationYr: string;
  alphaL: string; // m, blank = regression at the water-table depth
  hydraulicModel: 'default' | HydraulicModel;
  method: 'legacy' | 'modern';
  scale: 'linear' | 'log';
  measure: 'concentration' | 'flux';
}

const soil = (over: Partial<LayerForm> = {}): LayerForm => ({
  texture: 'custom',
  thickness: '3',
  thetaS: '0.35',
  thetaR: '0.05',
  n: '2.68',
  Ks: '10',
  rhoB: '1.7',
  foc: '0.01',
  ...over,
});

/**
 * The Table R-7 validation case (arcadis2001, as reproduced in RISC5 Appendix R): a benzene source
 * in a TPH mixture under a 4 m cover that includes a 0.2 m lens, 2.8 m above the water table.
 * Benzene properties come from the RISC4 chemical database (spence2001) and are fixture inputs.
 */
export const DEFAULT_FORM: VadoseForm = {
  infiltration: '20',
  M: '78',
  S: '1750',
  H: '0.228',
  chemicalId: '',
  Koc: '59',
  Da: '0.088',
  Dw: '9.8e-6',
  mu: '0.001',
  source: soil({ thickness: '3' }),
  srcLength: '10',
  srcWidth: '10',
  srcF: '500',
  tphOn: true,
  srcFT: '5000',
  srcMT: '100',
  srcDecay: '0',
  above: [soil({ thickness: '3.8' }), soil({ thickness: '0.2', thetaR: '0.15', n: '2', Ks: '1' })],
  below: [soil({ thickness: '2.8' })],
  durationYr: '10',
  alphaL: '',
  hydraulicModel: 'default',
  method: 'legacy',
  scale: 'linear',
  measure: 'concentration',
};

export const R7_PUBLISHED = {
  sourceMgPerL: 224,
  sourceTolerance: 0.01,
  yearTenMgPerL: 10.8,
  yearTenTolerance: 0.03,
  citations: ['arcadis2001', 'spence2001'] as const,
};

/** True while the inputs (not the display choices) are those of the Table R-7 case. */
export function isR7Case(f: VadoseForm): boolean {
  const inputs = (x: VadoseForm) =>
    JSON.stringify({ ...x, method: '', scale: '', measure: '', hydraulicModel: x.hydraulicModel });
  return inputs(f) === inputs(DEFAULT_FORM);
}

const sig6 = (x: number): string => String(Number(x.toPrecision(6)));

/**
 * Fills the porosity, residual water content, van Genuchten n, saturated conductivity and bulk
 * density of a layer from a texture preset (the class averages the vapor screen uses). Thickness and
 * organic carbon are the site's own and are kept. Every filled value stays editable.
 */
export function applyTexture(layer: LayerForm, texture: TextureChoice): LayerForm {
  if (texture === 'custom') return { ...layer, texture };
  const t = SOIL_TEXTURES[texture];
  return {
    ...layer,
    texture,
    thetaS: sig6(t.porosity),
    thetaR: sig6(t.residualMoisture),
    n: sig6(t.N),
    Ks: sig6(convert(t.saturatedConductivity, 'm/s', 'm/d')),
    rhoB: sig6(t.bulkDensity / 1000),
  };
}

export type Side = 'above' | 'below';

export function addLayer(f: VadoseForm, side: Side): VadoseForm {
  const template = f[side][f[side].length - 1] ?? f.source;
  return { ...f, [side]: [...f[side], { ...template, thickness: '1' }] };
}

/** Removes one layer; the profile below the source always keeps at least one layer. */
export function removeLayer(f: VadoseForm, side: Side, index: number): VadoseForm {
  if (side === 'below' && f.below.length <= 1) return f;
  return { ...f, [side]: f[side].filter((_, k) => k !== index) };
}

export interface VadoseScenario {
  /** Run length, s. */
  duration: number;
  profileTimes: number[];
  hydraulicModel?: HydraulicModel | undefined;
  alphaL?: number | undefined;
  /** Legacy input, or null when the profile is beyond what the legacy method describes. */
  legacy: VadsatInput | null;
  legacyReason: string | null;
  modern: LayeredInput;
  /** Source plan size and thickness, m, for the groundwater coupling and the displays. */
  source: { length: number; width: number; thickness: number };
  /** Water-table depth below the base of the source, m. */
  waterTableDepth: number;
}

export type ScenarioResult =
  { ok: true; scenario: VadoseScenario } | { ok: false; errors: string[] };

const PROFILE_FRACTIONS = [0.1, 0.25, 0.5, 1];
const PROFILE_POINTS = 61;
/** cm2 to m2 (the engine converts quotients of simple units only). */
const CM2_TO_M2 = 1e-4;
/** g/mol to kg/mol and 1/d to 1/s (the engine's converter has no mole or reciprocal units). */
const G_TO_KG = 1e-3;
const DAY = convert(1, 'd', 's');

function num(s: string): number {
  return s.trim() === '' ? NaN : Number(s);
}

const SIDE_NAME: Record<Side, string> = { above: 'above the source', below: 'below the source' };

export function layerName(side: Side, index: number): string {
  return `Layer ${index + 1} ${SIDE_NAME[side]}`;
}

export function toScenario(f: VadoseForm): ScenarioResult {
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

  const q = convert(
    need('Infiltration', f.infiltration, nonneg, 'must be zero or more (cm/yr).'),
    'cm/yr',
    'm/s',
  );

  const chemical: VadoseChemical = {
    M: need('Molar mass', f.M, pos, 'must be positive (g/mol).') * G_TO_KG,
    S: convert(need('Solubility', f.S, pos, 'must be positive (mg/L).'), 'mg/L', 'kg/m3'),
    H: need("Henry's constant", f.H, nonneg, 'must be zero or more (dimensionless).'),
    Koc: convert(need('Koc', f.Koc, nonneg, 'must be zero or more (mL/g).'), 'mL/g', 'm3/kg'),
    Da:
      need('Diffusion coefficient in air', f.Da, nonneg, 'must be zero or more (cm2/s).') *
      CM2_TO_M2,
    Dw:
      need('Diffusion coefficient in water', f.Dw, nonneg, 'must be zero or more (cm2/s).') *
      CM2_TO_M2,
    mu: need('Decay rate', f.mu, nonneg, 'must be zero or more (1/d).') / DAY,
  };

  const layer = (label: string, l: LayerForm, withThickness = true): VadsatLayer => {
    const thetaS = need(
      `${label}: porosity`,
      l.thetaS,
      (v) => v > 0 && v <= 1,
      'must be above 0 and at most 1.',
    );
    const thetaR = need(
      `${label}: residual water content`,
      l.thetaR,
      (v) => v >= 0 && (!Number.isFinite(thetaS) || v < thetaS),
      'must be zero or more and below the porosity.',
    );
    return {
      thickness: withThickness
        ? need(`${label}: thickness`, l.thickness, pos, 'must be positive (m).')
        : 1,
      thetaS,
      thetaR,
      n: need(`${label}: van Genuchten n`, l.n, (v) => v > 1, 'must be greater than 1.'),
      Ks: convert(
        need(`${label}: saturated conductivity`, l.Ks, pos, 'must be positive (m/d).'),
        'm/d',
        'm/s',
      ),
      rhoB: convert(
        need(`${label}: bulk density`, l.rhoB, pos, 'must be positive (g/cm3).'),
        'g/cm3',
        'kg/m3',
      ),
      foc: need(
        `${label}: organic carbon fraction`,
        l.foc,
        (v) => v >= 0 && v <= 1,
        'must be between 0 and 1.',
      ),
    };
  };

  const above = f.above.map((l, k) => layer(layerName('above', k), l));
  const below = f.below.map((l, k) => layer(layerName('below', k), l));
  if (below.length === 0) errors.push('Add at least one layer below the source.');
  const srcSoil = layer('Source', f.source);

  const length = need('Source length', f.srcLength, pos, 'must be positive (m).');
  const width = need('Source width', f.srcWidth, pos, 'must be positive (m).');
  const F = convert(
    need('Chemical in the source soil', f.srcF, nonneg, 'must be zero or more (mg/kg).'),
    'mg/kg',
    'kg/kg',
  );
  let FT: number | undefined;
  let MT: number | undefined;
  if (f.tphOn) {
    FT = convert(
      need('TPH in the source soil', f.srcFT, pos, 'must be positive (mg/kg).'),
      'mg/kg',
      'kg/kg',
    );
    MT = need('TPH molar mass', f.srcMT, pos, 'must be positive (g/mol).') * G_TO_KG;
    if (Number.isFinite(F) && Number.isFinite(FT) && F > FT) {
      errors.push('The chemical in the source soil cannot exceed the TPH in the source soil.');
    }
  }
  const decayRate =
    need('Source decay rate', f.srcDecay, nonneg, 'must be zero or more (1/d).') / DAY;

  const durationYr = need('Run length', f.durationYr, pos, 'must be positive (years).');
  const duration = convert(durationYr, 'yr', 's');
  const alphaL =
    f.alphaL.trim() === ''
      ? undefined
      : need('Longitudinal dispersivity', f.alphaL, pos, 'must be positive (m).');

  if (errors.length > 0) return { ok: false, errors };

  const source = {
    ...srcSoil,
    length,
    width,
    F,
    ...(FT !== undefined && MT !== undefined ? { FT, MT } : {}),
    decayRate,
  };
  const waterTableDepth = below.reduce((a, l) => a + l.thickness, 0);
  const profileTimes = PROFILE_FRACTIONS.map((x) => x * duration);
  const depths = Array.from(
    { length: PROFILE_POINTS },
    (_, k) => (waterTableDepth * k) / (PROFILE_POINTS - 1),
  );
  const model = f.hydraulicModel === 'default' ? undefined : f.hydraulicModel;
  const shared = {
    q,
    chemical,
    ...(model ? { hydraulicModel: model } : {}),
    ...(alphaL !== undefined ? { alphaL } : {}),
    depths,
    profileTimes,
    duration,
  };

  const modern: LayeredInput = { ...shared, above, source, below };

  // The legacy method describes one clean soil with an optional lens above the source and one soil
  // below it. With two layers above, the first is the clean soil and the second the lens.
  let legacy: VadsatInput | null = null;
  let legacyReason: string | null = null;
  const soilOf = (l: VadsatLayer): VadsatSoil => {
    const { thickness: _t, ...rest } = l;
    void _t;
    return rest;
  };
  if (above.length > 2) {
    legacyReason =
      'The legacy method describes a clean soil and one lens above the source; this profile has more than two layers above it.';
  } else if (below.length !== 1) {
    legacyReason =
      'The legacy method describes one layer below the source; this profile has more than one.';
  } else {
    const depthToSource = above.reduce((a, l) => a + l.thickness, 0);
    legacy = {
      ...shared,
      depthToSource,
      above: soilOf(above[0] ?? srcSoil),
      ...(above[1] ? { lens: above[1] } : {}),
      source,
      below: below[0]!,
    };
  }

  return {
    ok: true,
    scenario: {
      duration,
      profileTimes,
      hydraulicModel: model,
      alphaL,
      legacy,
      legacyReason,
      modern,
      source: { length, width, thickness: srcSoil.thickness },
      waterTableDepth,
    },
  };
}
