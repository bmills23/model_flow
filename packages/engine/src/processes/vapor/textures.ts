/**
 * Soil texture presets for the modern EPA Johnson and Ettinger method: the 12 SCS classes with the
 * class-average values EPA tabulates (epa2004je Appendix C soil lookup table and Table 10; the same
 * values appear in Version 6.0, epa2017je Table 13). They are presets only: every value can be
 * overwritten, and `stratumFromTexture` then tags it as `user`.
 *
 * The table below is written as EPA prints it (cm, cm/h, 1/cm, g/cm^3); conversion to SI happens once,
 * when the presets are built.
 */

export type SoilTextureCode =
  'C' | 'CL' | 'L' | 'LS' | 'S' | 'SC' | 'SCL' | 'SI' | 'SIC' | 'SICL' | 'SIL' | 'SL';

export interface SoilTexture {
  code: SoilTextureCode;
  name: string;
  /** Saturated hydraulic conductivity, m/s. */
  saturatedConductivity: number;
  /** van Genuchten alpha_1, 1/m. */
  alpha1: number;
  /** van Genuchten N. */
  N: number;
  /** van Genuchten M = 1 - 1/N. */
  M: number;
  /** Total porosity (saturated water content). */
  porosity: number;
  /** Residual water content. */
  residualMoisture: number;
  /** Mean grain diameter, m. */
  grainDiameter: number;
  /** Dry bulk density, kg/m^3. */
  bulkDensity: number;
  /** Default water-filled porosity of the unsaturated zone. */
  moisture: number;
}

// code, name, Ks cm/h, alpha_1 1/cm, N, M, n, theta_r, grain diameter cm, bulk density g/cm^3, theta_w
const RAW: readonly [
  SoilTextureCode,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
][] = [
  ['C', 'Clay', 0.61, 0.01496, 1.253, 0.2019, 0.459, 0.098, 0.0092, 1.43, 0.215],
  ['CL', 'Clay loam', 0.34, 0.01581, 1.416, 0.2938, 0.442, 0.079, 0.016, 1.48, 0.168],
  ['L', 'Loam', 0.5, 0.01112, 1.472, 0.3207, 0.399, 0.061, 0.02, 1.59, 0.148],
  ['LS', 'Loamy sand', 4.38, 0.03475, 1.746, 0.4273, 0.39, 0.049, 0.04, 1.62, 0.076],
  ['S', 'Sand', 26.78, 0.03524, 3.177, 0.6852, 0.375, 0.053, 0.044, 1.66, 0.054],
  ['SC', 'Sandy clay', 0.47, 0.03342, 1.208, 0.1722, 0.385, 0.117, 0.025, 1.63, 0.197],
  ['SCL', 'Sandy clay loam', 0.55, 0.02109, 1.33, 0.2481, 0.384, 0.063, 0.029, 1.63, 0.146],
  ['SI', 'Silt', 1.82, 0.00658, 1.679, 0.4044, 0.489, 0.05, 0.0046, 1.35, 0.167],
  ['SIC', 'Silty clay', 0.4, 0.01622, 1.321, 0.243, 0.481, 0.111, 0.0039, 1.38, 0.216],
  ['SICL', 'Silty clay loam', 0.46, 0.00839, 1.521, 0.3425, 0.482, 0.09, 0.0056, 1.37, 0.198],
  ['SIL', 'Silt loam', 0.76, 0.00506, 1.663, 0.3987, 0.439, 0.065, 0.011, 1.49, 0.18],
  ['SL', 'Sandy loam', 1.6, 0.02667, 1.449, 0.3099, 0.387, 0.039, 0.03, 1.62, 0.103],
];

export const SOIL_TEXTURES: Readonly<Record<SoilTextureCode, SoilTexture>> = Object.fromEntries(
  RAW.map(([code, name, ksCmH, a1, N, M, n, thr, dCm, rho, thw]) => [
    code,
    {
      code,
      name,
      saturatedConductivity: (ksCmH * 1e-2) / 3600,
      alpha1: a1 * 100,
      N,
      M,
      porosity: n,
      residualMoisture: thr,
      grainDiameter: dCm * 1e-2,
      bulkDensity: rho * 1000,
      moisture: thw,
    },
  ]),
) as Record<SoilTextureCode, SoilTexture>;

export function soilTexture(code: SoilTextureCode): SoilTexture {
  const t = SOIL_TEXTURES[code];
  if (!t) throw new RangeError(`unknown soil texture class "${code}"`);
  return t;
}

export interface CapillaryZone {
  /** Height of the capillary zone above the water table, m. */
  height: number;
  /** Water-filled porosity at the air-entry head. */
  moisture: number;
  /** Total porosity. */
  porosity: number;
}

/**
 * Capillary zone of a texture: water-filled porosity from the van Genuchten curve at the air-entry
 * head h = 1 / alpha_1, theta_r + (theta_s - theta_r) / [1 + (alpha_1 h)^N]^M = theta_r + (theta_s -
 * theta_r) 2^-M; height from the mean grain diameter, h_cz = 0.15 / (0.2 d) with h_cz and d in cm
 * (the simplified capillary-rise form EPA uses for groundwater between 5 and 25 deg C), i.e.
 * 7.5e-5 / d with both in metres.
 */
export function capillaryZone(t: SoilTexture): CapillaryZone {
  return {
    height: 7.5e-5 / t.grainDiameter,
    moisture: t.residualMoisture + (t.porosity - t.residualMoisture) * Math.pow(2, -t.M),
    porosity: t.porosity,
  };
}

export type StratumField =
  'porosity' | 'moisture' | 'bulkDensity' | 'saturatedConductivity' | 'residualMoisture' | 'vgM';

export interface Stratum {
  /** Thickness, m. */
  thickness: number;
  /** Total porosity. */
  porosity: number;
  /** Water-filled porosity. */
  moisture: number;
  /** Dry bulk density, kg/m^3. */
  bulkDensity: number;
  /** Organic carbon fraction. */
  foc: number;
  /** Saturated hydraulic conductivity, m/s (for the soil vapor permeability estimate). */
  saturatedConductivity?: number;
  /** Residual water content (for the relative air permeability). */
  residualMoisture?: number;
  /** van Genuchten M (for the relative air permeability). */
  vgM?: number;
  /** Texture class the values came from, if any (the capillary zone height uses it). */
  texture?: SoilTextureCode;
  /** Where each preset-capable value came from. */
  provenance?: Partial<Record<StratumField, 'preset' | 'user'>>;
}

export interface StratumOverrides {
  porosity?: number;
  moisture?: number;
  bulkDensity?: number;
  saturatedConductivity?: number;
  residualMoisture?: number;
  vgM?: number;
}

/** A stratum from a texture preset; any overridden value is tagged `user`, the rest `preset`. */
export function stratumFromTexture(
  code: SoilTextureCode,
  thickness: number,
  foc: number,
  overrides: StratumOverrides = {},
): Stratum {
  const t = soilTexture(code);
  const preset: Required<StratumOverrides> = {
    porosity: t.porosity,
    moisture: t.moisture,
    bulkDensity: t.bulkDensity,
    saturatedConductivity: t.saturatedConductivity,
    residualMoisture: t.residualMoisture,
    vgM: t.M,
  };
  const provenance: Partial<Record<StratumField, 'preset' | 'user'>> = {};
  const values = { ...preset };
  for (const k of Object.keys(preset) as StratumField[]) {
    const o = overrides[k];
    if (o !== undefined) {
      values[k] = o;
      provenance[k] = 'user';
    } else {
      provenance[k] = 'preset';
    }
  }
  return { thickness, foc, texture: code, provenance, ...values };
}
