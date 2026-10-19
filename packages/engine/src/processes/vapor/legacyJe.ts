import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { millingtonQuirkDeff } from '../vadose/index.js';
import { crackRadius, jeAlpha, permeabilityFromConductivity, soilGasFlow } from './building.js';
import { sourceVapor, type SourceVaporInput } from './source.js';
import { checkNonNeg, checkPos } from './units.js';
import { legacyJeUncertainInputs } from './uncertain.js';

/**
 * Legacy Johnson and Ettinger (1991) model, soil, soil gas or groundwater source to indoor air, no
 * degradation. SI throughout. Layers are listed from the source upward.
 */

export interface SoilLayer {
  /** Thickness, m. */
  thickness: number;
  /** Total porosity. */
  porosity: number;
  /** Water-filled porosity. */
  moisture: number;
}

export interface VaporChemical {
  /** Diffusion coefficient in air, m^2/s. */
  Da: number;
  /** Diffusion coefficient in water, m^2/s. */
  Dw: number;
  /** Dimensionless Henry's constant. */
  H: number;
}

export type SoilGasFlowSpec =
  | { Qsoil: number }
  | {
      /** Indoor-outdoor pressure difference, Pa. */
      dP: number;
      /** Floor-wall seam length, m. */
      Xcrack: number;
      /** Depth of the cracks below grade, m. */
      Zcrack: number;
      /** Air viscosity, Pa s (default 1.8e-5, DEFAULT ruling 6). */
      mu?: number;
      /** Soil vapor permeability, m^2. */
      kv?: number;
      /** Hydraulic conductivity of the soil around the foundation, m/s, to estimate k_v. */
      hydraulicConductivity?: number;
    };

export interface LegacyBuilding {
  /** Enclosed volume V_B, m^3. */
  volume: number;
  /** Air exchange rate, 1/s. */
  airExchangeRate: number;
  /** Area in contact with soil A_B, m^2. */
  floorArea: number;
  /** Crack fraction eta. */
  crackFraction: number;
  /** The foundation as a soil layer (its own Millington-Quirk coefficient, RISC5 choice). */
  foundation: SoilLayer;
  soilGas: SoilGasFlowSpec;
}

export interface LegacyJeInput {
  chemical: VaporChemical;
  /** Clean soil layers above the source, from the source upward (the lens included). */
  layers: SoilLayer[];
  /** Capillary fringe, deepest layer, groundwater source only (entered, RISC5 choice). */
  capillaryFringe?: SoilLayer;
  building: LegacyBuilding;
  source: SourceVaporInput;
  /** User flag: the source is not under the building. */
  sourceNotUnderBuilding?: boolean;
}

export interface ProfilePoint {
  /** Height above the top of the source, m. */
  height: number;
  /** Vapor concentration, kg/m^3. */
  concentration: number;
}

export interface LegacyJeResult {
  /** Indoor air concentration, kg/m^3. */
  concentration: number;
  alpha: number;
  /** Receptor air concentration per unit source vapor concentration (equals alpha). */
  coefficient: number;
  alphaDiffusionOnly: number;
  /** Indoor concentration with the soil gas flow set to zero, kg/m^3. */
  concentrationDiffusionOnly: number;
  /** Mass entry rate Q_B C_in, kg/s. */
  entryRate: number;
  sourceVapor: number;
  DT: number;
  LT: number;
  QB: number;
  AB: number;
  Qsoil: number;
  xi: number;
  profile: ProfilePoint[];
  warnings: Warning[];
}

export const DEFAULT_AIR_VISCOSITY = 1.8e-5;
const MU_WATER = 1.0e-3;
const RHO_WATER = 1000;

export function layerDeff(l: SoilLayer, chem: VaporChemical): number {
  checkPos('layer thickness', l.thickness);
  return millingtonQuirkDeff({ thetaS: l.porosity, theta: l.moisture }, chem);
}

export interface BuildingTerms {
  QB: number;
  AB: number;
  Acrack: number;
  Lcrack: number;
  Dcrack: number;
  Qsoil: number;
}

/** Ventilation, crack geometry and soil gas flow of a legacy building. */
export function legacyBuildingTerms(b: LegacyBuilding, chem: VaporChemical): BuildingTerms {
  checkPos('building volume', b.volume);
  checkPos('air exchange rate', b.airExchangeRate);
  checkPos('floor area', b.floorArea);
  if (!Number.isFinite(b.crackFraction) || !(b.crackFraction > 0 && b.crackFraction <= 1)) {
    throw new RangeError(`crack fraction must be in (0, 1], got ${b.crackFraction}`);
  }
  const Lcrack = b.foundation.thickness;
  const Dcrack = layerDeff(b.foundation, chem);
  const Acrack = b.crackFraction * b.floorArea;
  let Qsoil: number;
  if ('Qsoil' in b.soilGas) {
    checkNonNeg('Qsoil', b.soilGas.Qsoil);
    Qsoil = b.soilGas.Qsoil;
  } else {
    const g = b.soilGas;
    const kv =
      g.kv ??
      (g.hydraulicConductivity !== undefined
        ? permeabilityFromConductivity(g.hydraulicConductivity, MU_WATER, RHO_WATER)
        : undefined);
    if (kv === undefined) throw new RangeError('soil gas flow needs kv or hydraulicConductivity');
    Qsoil = soilGasFlow({
      dP: g.dP,
      kv,
      mu: g.mu ?? DEFAULT_AIR_VISCOSITY,
      Xcrack: g.Xcrack,
      Zcrack: g.Zcrack,
      rcrack: crackRadius(b.crackFraction, b.floorArea, g.Xcrack),
    });
  }
  return {
    QB: b.volume * b.airExchangeRate,
    AB: b.floorArea,
    Acrack,
    Lcrack,
    Dcrack,
    Qsoil,
  };
}

function zcrackOf(b: LegacyBuilding): number | undefined {
  return 'Zcrack' in b.soilGas ? b.soilGas.Zcrack : undefined;
}

export function buildingWarnings(b: LegacyBuilding, LT: number, xi: number): Warning[] {
  const w: Warning[] = [];
  if (xi > 10) {
    w.push({
      code: 'vapor.advection-dominated',
      message: `crack Peclet number ${xi.toPrecision(3)} exceeds 10: entry is controlled by the soil gas flow, so the result is sensitive to the permeability and pressure difference`,
    });
  }
  const z = zcrackOf(b);
  if (z !== undefined && LT < z) {
    w.push({
      code: 'vapor.crack-depth',
      message: `the source lies within the foundation's zone of influence (L_T ${LT} m < crack depth ${z} m)`,
    });
  }
  return w;
}

export function jeLegacyIndoor(input: LegacyJeInput): LegacyJeResult {
  const { chemical: chem, building: bld } = input;
  if (input.capillaryFringe && input.source.kind !== 'groundwater') {
    throw new RangeError('a capillary fringe applies to a groundwater source only');
  }
  const layers = input.capillaryFringe ? [input.capillaryFringe, ...input.layers] : input.layers;
  if (layers.length === 0) throw new RangeError('at least one soil layer is required');
  const deffs = layers.map((l) => layerDeff(l, chem));
  let LT = 0;
  let resistance = 0;
  layers.forEach((l, i) => {
    LT += l.thickness;
    resistance += l.thickness / deffs[i]!;
  });
  const DT = LT / resistance;
  const src = sourceVapor(input.source);
  const t = legacyBuildingTerms(bld, chem);
  const a = jeAlpha({
    DT,
    AB: t.AB,
    QB: t.QB,
    LT,
    Qsoil: t.Qsoil,
    Lcrack: t.Lcrack,
    Dcrack: t.Dcrack,
    Acrack: t.Acrack,
  });
  const cvs = src.cvs;
  // Soil diffusion carries the whole entry rate: C_b = C_vs (1 - alpha / A).
  const cb = cvs * (1 - a.alpha / a.A);
  const profile: ProfilePoint[] = [{ height: 0, concentration: cvs }];
  let z = 0;
  let r = 0;
  layers.forEach((l, i) => {
    z += l.thickness;
    r += l.thickness / deffs[i]!;
    profile.push({ height: z, concentration: cvs - (cvs - cb) * (r / resistance) });
  });
  const warnings: Warning[] = [...src.warnings, ...buildingWarnings(bld, LT, a.xi)];
  if (input.sourceNotUnderBuilding) {
    warnings.push({
      code: 'vapor.lateral-offset',
      message:
        'the source is flagged as not under the building: the one-dimensional model does not apply (see the three-dimensional studies cited in the methods note)',
    });
  }
  return {
    concentration: a.alpha * cvs,
    alpha: a.alpha,
    coefficient: a.alpha,
    alphaDiffusionOnly: a.alphaDiffusionOnly,
    concentrationDiffusionOnly: a.alphaDiffusionOnly * cvs,
    entryRate: t.QB * a.alpha * cvs,
    sourceVapor: cvs,
    DT,
    LT,
    QB: t.QB,
    AB: t.AB,
    Qsoil: t.Qsoil,
    xi: a.xi,
    profile,
    warnings,
  };
}

export const vaporJe1991: MethodDescriptor<LegacyJeInput, LegacyJeResult> = {
  id: 'vapor.je-1991',
  process: 'vapor',
  kind: 'legacy',
  name: 'Johnson and Ettinger soil, soil gas or groundwater to indoor air',
  summary:
    'Steady one-dimensional diffusion through clean soil layers (and an entered capillary fringe for a groundwater source) coupled to advection and diffusion through foundation cracks and a well-mixed building, for an infinite source.',
  citations: ['johnsonettinger1991', 'millingtonquirk1961', 'epa1996ssg'],
  assumptions: [
    'Steady, one-dimensional vapor transport through homogeneous layers; the source extends under the whole building footprint.',
    'Infinite source: the source vapor concentration does not change with time; linked to a time-varying source the method is applied quasi-steadily.',
    'No sorption to building materials and no indoor background; no biodegradation.',
    'Henry constant as entered (25 deg C); foundation diffusion from the foundation layer itself.',
  ],
  risc5Choice:
    'RISC5 takes the crack diffusion coefficient from the foundation layer entered as a soil layer, enters the capillary fringe as a layer of given moisture, asks for hydraulic conductivity to estimate the vapor permeability, takes air exchanges per day, holds the source constant, and uses an air viscosity of 1.8e-4 g/(cm s).',
  validate: (input) => jeLegacyIndoor(input).warnings,
  uncertainInputs: legacyJeUncertainInputs(),
  run: jeLegacyIndoor,
};
