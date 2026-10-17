import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { crackRadius, jeAlpha, permeabilityFromConductivity, soilGasFlow } from './building.js';
import { henryAtTemperature } from './henry.js';
import { sourceVapor } from './source.js';
import {
  capillaryZone,
  soilTexture,
  type CapillaryZone,
  type Stratum,
  type SoilTextureCode,
} from './textures.js';
import { T_REF, atmToDimensionlessHenry, checkNonNeg, checkPos } from './units.js';
import type { ProfilePoint } from './legacyJe.js';

/**
 * Modern EPA implementation of the Johnson and Ettinger model: the equations of the 2004 guide
 * (epa2004je sections 2.2 to 2.8) with the Version 6.0 foundation types and defaults (epa2017je).
 * SI throughout. Strata are listed from grade downward; the floor lies at `floorDepth`; the source
 * (top of soil contamination, water table or soil gas sample point) lies at the base of the strata.
 */

export type FoundationType =
  'slabOnGrade' | 'basementSlab' | 'basementDirt' | 'crawlSlab' | 'crawlDirt';

export interface EpaChemical {
  /** Diffusion coefficient in air, m^2/s. */
  Da: number;
  /** Diffusion coefficient in water, m^2/s. */
  Dw: number;
  /** Henry's constant at 25 deg C, atm m^3/mol. */
  henryAtm: number;
  /** Organic carbon partition coefficient, m^3/kg (soil sources). */
  koc?: number;
  /** Molar mass, kg/mol (soil sources, residual test). */
  M?: number;
  /** Aqueous solubility, kg/m^3 (soil sources, residual test; groundwater warning). */
  S?: number;
  /** Boiling point data for the Henry temperature correction (all three or none). */
  thermo?: {
    /** Normal boiling point, K. */
    TB: number;
    /** Critical temperature, K. */
    TC: number;
    /** Enthalpy of vaporization at the normal boiling point, cal/mol. */
    dHvb: number;
  };
}

export type EpaSoilGasSpec =
  /** Soil gas flow into the building entered, m^3/s. */
  | { Qsoil: number }
  /** Ratio Q_soil / Q_B used as entered. */
  | { ratio: number }
  /** Cylinder-sink flow from the pressure difference and the permeability of the soil at the floor. */
  | {
      /** Indoor-outdoor pressure difference, Pa. */
      dP: number;
      /** Soil vapor permeability, m^2; estimated from the stratum at the floor when omitted. */
      kv?: number;
      /** Floor-wall seam length, m (default 2 (L + W)). */
      Xcrack?: number;
      /** Air viscosity, Pa s (default 1.75e-5, the value the guide prints at 10 deg C). */
      mu?: number;
    };

export interface EpaBuilding {
  foundation: FoundationType;
  /** Length and width of the enclosed space footprint, m. */
  floorLength: number;
  floorWidth: number;
  /** Depth below grade to the base of the foundation (L_F), m. */
  depthBelowGrade: number;
  /** Enclosed space mixing height, m. */
  mixingHeight: number;
  /** Air exchange rate, 1/s. */
  airExchangeRate: number;
  /** Foundation thickness, m (0 for a dirt floor). */
  foundationThickness: number;
  /** Fraction of the foundation area with cracks (slab types). */
  crackFraction?: number;
  /** Crack width, m; used with the seam length when no crack fraction is entered. */
  crackWidth?: number;
  /** Default (when omitted): ratio 0.003 at 0.45 exchanges per hour, scaled by 0.45 / ER. */
  soilGas?: EpaSoilGasSpec;
}

export type EpaSource =
  | {
      kind: 'soil';
      /** Chemical mass fraction in soil, kg/kg. */
      F: number;
      /** Depth below grade to the bottom of the contamination, m (finite source). */
      bottomDepth?: number;
      /** Total petroleum hydrocarbon fraction and molar mass (residual test). */
      FT?: number;
      MT?: number;
    }
  | { kind: 'soilGas'; csg: number }
  | { kind: 'groundwater'; cgw: number; x?: number };

export interface EpaJeInput {
  chemical: EpaChemical;
  /** Average soil or groundwater temperature, K. */
  temperature: number;
  /** Strata from grade down; the base of the last is the source depth. */
  strata: Stratum[];
  /** Depth below grade to the bottom of the enclosed space floor, m. */
  floorDepth: number;
  building: EpaBuilding;
  source: EpaSource;
  /**
   * Groundwater source: the capillary zone occupies the lowest `height` of the column. Defaults come
   * from the texture class of the deepest stratum; each value can be overridden.
   */
  capillary?: Partial<CapillaryZone>;
  /** Finite soil source: exposure interval in seconds (soil source with `bottomDepth` only). */
  finiteSource?: { exposureDuration: number };
  /** User flag: the source is not under the building. */
  sourceNotUnderBuilding?: boolean;
}

export interface EpaJeResult {
  /** Indoor air concentration (infinite source, or the finite-source time average), kg/m^3. */
  concentration: number;
  /** Infinite-source attenuation coefficient. */
  alpha: number;
  /** Receptor air concentration per unit source vapor concentration. */
  coefficient: number;
  /** Infinite-source indoor concentration, kg/m^3. */
  concentrationInfinite: number;
  alphaDiffusionOnly: number;
  entryRate: number;
  sourceVapor: number;
  /** Dimensionless Henry's constant at the system temperature. */
  Hprime: number;
  /** Enthalpy of vaporization at the system temperature, cal/mol (undefined without boiling data). */
  dHvTS?: number;
  DT: number;
  /**
   * Thickness-weighted gas-referenced capacity of the column, (rho_b K_d + theta_w) / H' + theta_a, with no
   * sorption in a capillary zone (it carries no bulk density). The establishment time is L_T^2 R_g / D_T.
   */
  capacityRg: number;
  /** Source-building separation L_T, m. */
  LT: number;
  QB: number;
  AB: number;
  Acrack: number;
  eta: number;
  Dcrack: number;
  Qsoil: number;
  xi: number;
  A: number;
  /** Soil vapor permeability terms at the floor stratum (undefined if not computable). */
  permeability?: { ki: number; krg: number; kv: number; Ste: number };
  /** Diffusion coefficient of each layer between the floor and the source, floor first, m^2/s. */
  layerDeff: number[];
  finite?: {
    beta: number;
    psi: number;
    depletionTime: number;
    exposureDuration: number;
    depleted: boolean;
    averageAlpha?: number;
    massLimitConcentration: number;
  };
  profile: ProfilePoint[];
  warnings: Warning[];
}

/** Version 6.0 default ratio Q_soil / Q_B at the reference air exchange rate. */
export const DEFAULT_QSOIL_RATIO = 0.003;
/** Reference air exchange rate of the default ratio, 1/s (0.45 per hour). */
export const REFERENCE_AIR_EXCHANGE = 0.45 / 3600;
const DEFAULT_AIR_VISCOSITY = 1.75e-5;
/**
 * Millington and Quirk exponent as the EPA guide prints it (3.33, where the legacy methods use the
 * exact 10/3). The worked example's diffusion coefficients (5.54e-3 and 1.42e-2 cm^2/s) reproduce only
 * with 3.33; 10/3 gives 5.51e-3 and 1.41e-2.
 */
export const EPA_MQ_EXPONENT = 3.33;

/** Effective diffusion coefficient of a layer, referred to the gas phase, with EPA's exponent. */
export function epaLayerDeff(
  porosity: number,
  moisture: number,
  chem: { Da: number; Dw: number; H: number },
): number {
  if (!Number.isFinite(porosity) || !(porosity > 0 && porosity <= 1)) {
    throw new RangeError(`porosity must be in (0, 1], got ${porosity}`);
  }
  if (!Number.isFinite(moisture) || moisture < 0 || moisture > porosity) {
    throw new RangeError(`moisture must be in [0, porosity], got ${moisture}`);
  }
  checkPos('H', chem.H);
  checkNonNeg('Da', chem.Da);
  checkNonNeg('Dw', chem.Dw);
  const air = porosity - moisture;
  return (
    (chem.Da * Math.pow(air, EPA_MQ_EXPONENT) +
      (chem.Dw / chem.H) * Math.pow(moisture, EPA_MQ_EXPONENT)) /
    (porosity * porosity)
  );
}
/** Dynamic viscosity of water at 10 deg C, Pa s (0.01307 g/(cm s)), and density, kg/m^3 (0.999 g/cm^3). */
const MU_WATER_10C = 1.307e-3;
const RHO_WATER = 999;

/** Version 6.0 residential building defaults (epa2017je Table 9; floor area 150 m^2, square). */
export function epaBuildingDefaults(foundation: FoundationType): EpaBuilding {
  const side = Math.sqrt(150);
  const base = {
    foundation,
    floorLength: side,
    floorWidth: side,
    airExchangeRate: REFERENCE_AIR_EXCHANGE,
  };
  switch (foundation) {
    case 'slabOnGrade':
      return {
        ...base,
        depthBelowGrade: 0.1,
        mixingHeight: 2.44,
        foundationThickness: 0.1,
        crackFraction: 0.001,
      };
    case 'basementSlab':
      return {
        ...base,
        depthBelowGrade: 2,
        mixingHeight: 3.66,
        foundationThickness: 0.1,
        crackFraction: 0.001,
      };
    case 'basementDirt':
      return {
        ...base,
        depthBelowGrade: 2,
        mixingHeight: 3.66,
        foundationThickness: 0,
        crackFraction: 1,
      };
    case 'crawlSlab':
      return {
        ...base,
        depthBelowGrade: 1,
        mixingHeight: 1.3,
        foundationThickness: 0.1,
        crackFraction: 0.001,
      };
    case 'crawlDirt':
      return {
        ...base,
        depthBelowGrade: 1,
        mixingHeight: 1.3,
        foundationThickness: 0,
        crackFraction: 1,
      };
  }
}

const isDirt = (f: FoundationType): boolean => f === 'basementDirt' || f === 'crawlDirt';

/** Relative air permeability (Parker et al. extension of van Genuchten): (1-S)^(1/2) (1-S^(1/M))^(2M). */
export function relativeAirPermeability(Ste: number, M: number): number {
  if (!Number.isFinite(Ste) || Ste < 0 || Ste > 1) {
    throw new RangeError(`effective saturation must be in [0, 1], got ${Ste}`);
  }
  checkPos('M', M);
  return Math.sqrt(1 - Ste) * Math.pow(1 - Math.pow(Ste, 1 / M), 2 * M);
}

/** Effective total fluid saturation S_te = (theta_w - theta_r) / (n - theta_r). */
export function effectiveSaturation(theta: number, thetaR: number, n: number): number {
  if (!(n > thetaR)) throw new RangeError('porosity must exceed the residual water content');
  return Math.min(1, Math.max(0, (theta - thetaR) / (n - thetaR)));
}

interface ColumnLayer {
  thickness: number;
  porosity: number;
  moisture: number;
  stratum?: Stratum;
}

function stratumPermeability(s: Stratum): { ki: number; krg: number; kv: number; Ste: number } {
  if (
    s.saturatedConductivity === undefined ||
    s.residualMoisture === undefined ||
    s.vgM === undefined
  ) {
    throw new RangeError(
      'estimating the soil vapor permeability needs the saturated conductivity, residual water content and van Genuchten M of the stratum at the floor (use a texture preset or enter kv)',
    );
  }
  const ki = permeabilityFromConductivity(s.saturatedConductivity, MU_WATER_10C, RHO_WATER);
  const Ste = effectiveSaturation(s.moisture, s.residualMoisture, s.porosity);
  const krg = relativeAirPermeability(Ste, s.vgM);
  return { ki, krg, kv: ki * krg, Ste };
}

/** Layers between the floor and the source, top (floor) first. */
function buildColumn(
  input: EpaJeInput,
  capillary: CapillaryZone | undefined,
): { layers: ColumnLayer[]; sourceDepth: number } {
  if (input.strata.length === 0) throw new RangeError('at least one soil stratum is required');
  let sourceDepth = 0;
  for (const s of input.strata) {
    checkPos('stratum thickness', s.thickness);
    sourceDepth += s.thickness;
  }
  checkPos('floorDepth', input.floorDepth);
  const hcz = capillary?.height ?? 0;
  if (!(input.floorDepth < sourceDepth - hcz)) {
    throw new RangeError(
      capillary
        ? `the top of the capillary zone (${sourceDepth - hcz} m below grade) must lie below the floor (${input.floorDepth} m)`
        : `the floor (${input.floorDepth} m) must lie above the source (${sourceDepth} m)`,
    );
  }
  const bottom = sourceDepth - hcz;
  const layers: ColumnLayer[] = [];
  let top = 0;
  for (const s of input.strata) {
    const lo = Math.max(top, input.floorDepth);
    const hi = Math.min(top + s.thickness, bottom);
    if (hi > lo) {
      layers.push({ thickness: hi - lo, porosity: s.porosity, moisture: s.moisture, stratum: s });
    }
    top += s.thickness;
  }
  if (capillary && hcz > 0) {
    layers.push({
      thickness: hcz,
      porosity: capillary.porosity,
      moisture: capillary.moisture,
    });
  }
  return { layers, sourceDepth };
}

function resolveCapillary(input: EpaJeInput): CapillaryZone {
  const deepest = input.strata[input.strata.length - 1]!;
  const base: Partial<CapillaryZone> = deepest.texture
    ? capillaryZone(soilTexture(deepest.texture))
    : {};
  const c = { ...base, ...(input.capillary ?? {}) };
  if (c.height === undefined || c.moisture === undefined || c.porosity === undefined) {
    throw new RangeError(
      'a groundwater source needs the capillary zone: use a texture class on the deepest stratum or enter its height, porosity and moisture',
    );
  }
  checkNonNeg('capillary zone height', c.height);
  return { height: c.height, moisture: c.moisture, porosity: c.porosity };
}

function expm1Over(xi: number): number {
  // (1 - e^-xi) / xi
  return xi < 1e-8 ? 1 - xi / 2 : -Math.expm1(-xi) / xi;
}

export function jeEpaIndoor(input: EpaJeInput): EpaJeResult {
  const warnings: Warning[] = [];
  const chem = input.chemical;
  const bld = input.building;
  const dirt = isDirt(bld.foundation);
  checkPos('temperature', input.temperature);
  for (const [k, v] of [
    ['floorLength', bld.floorLength],
    ['floorWidth', bld.floorWidth],
    ['mixingHeight', bld.mixingHeight],
    ['airExchangeRate', bld.airExchangeRate],
  ] as const) {
    checkPos(k, v);
  }
  checkPos('depthBelowGrade', bld.depthBelowGrade);
  if (input.floorDepth !== bld.depthBelowGrade) {
    throw new RangeError('floorDepth must equal the building depthBelowGrade');
  }
  if (input.source.kind !== 'groundwater' && input.capillary) {
    throw new RangeError('a capillary zone applies to a groundwater source only');
  }

  // Henry's constant at the system temperature.
  let Hprime: number;
  let dHvTS: number | undefined;
  if (chem.thermo) {
    const h = henryAtTemperature({
      HR: chem.henryAtm,
      dHvb: chem.thermo.dHvb,
      TB: chem.thermo.TB,
      TC: chem.thermo.TC,
      TS: input.temperature,
    });
    Hprime = h.Hprime;
    dHvTS = h.dHvTS;
  } else {
    checkPos('henryAtm', chem.henryAtm);
    Hprime = atmToDimensionlessHenry(chem.henryAtm, T_REF);
    if (Math.abs(input.temperature - T_REF) > 0.05) {
      warnings.push({
        code: 'vapor.henry-not-temperature-corrected',
        message: `no boiling point, critical temperature and enthalpy of vaporization were given, so Henry's constant stays at 25 deg C although the system temperature is ${(input.temperature - 273.15).toFixed(1)} deg C`,
      });
    }
  }

  // Soil column between the floor and the source.
  const capillary = input.source.kind === 'groundwater' ? resolveCapillary(input) : undefined;
  const { layers, sourceDepth } = buildColumn(input, capillary);
  const diffChem = { Da: chem.Da, Dw: chem.Dw, H: Hprime };
  const deffs = layers.map((l) => epaLayerDeff(l.porosity, l.moisture, diffChem));
  let LT = 0;
  let resistance = 0;
  layers.forEach((l, i) => {
    LT += l.thickness;
    resistance += l.thickness / deffs[i]!;
  });
  const DT = LT / resistance;
  let capacityRg = 0;
  layers.forEach((l) => {
    const sorbed =
      l.stratum && chem.koc !== undefined ? l.stratum.bulkDensity * chem.koc * l.stratum.foc : 0;
    capacityRg += (l.thickness / LT) * ((sorbed + l.moisture) / Hprime + (l.porosity - l.moisture));
  });
  const floorLayer = layers[0]!;
  const Dcrack = deffs[0]!;

  // Source vapor concentration.
  const srcStratum = input.strata[input.strata.length - 1]!;
  const src = input.source;
  let cvsResult;
  if (src.kind === 'soil') {
    if (chem.koc === undefined || chem.M === undefined || chem.S === undefined) {
      throw new RangeError('a soil source needs the chemical koc, molar mass and solubility');
    }
    cvsResult = sourceVapor({
      kind: 'soil',
      F: src.F,
      rhoB: srcStratum.bulkDensity,
      kd: chem.koc * srcStratum.foc,
      theta: srcStratum.moisture,
      thetaA: srcStratum.porosity - srcStratum.moisture,
      H: Hprime,
      M: chem.M,
      S: chem.S,
      ...(src.FT !== undefined && src.MT !== undefined ? { FT: src.FT, MT: src.MT } : {}),
    });
    warnings.push({
      code: 'vapor.soil-source-not-recommended',
      message:
        'a soil concentration source was removed from EPA Version 6.0 in line with its 2015 vapor intrusion guidance; soil gas or groundwater data are preferred',
    });
  } else if (src.kind === 'soilGas') {
    cvsResult = sourceVapor({ kind: 'soilGas', csg: src.csg });
  } else {
    cvsResult = sourceVapor({
      kind: 'groundwater',
      cgw: src.cgw,
      H: Hprime,
      ...(chem.S !== undefined ? { S: chem.S } : {}),
      ...(src.x !== undefined ? { x: src.x } : {}),
    });
  }
  warnings.push(...cvsResult.warnings);
  const cvs = cvsResult.cvs;

  // Building.
  const Lb = bld.depthBelowGrade;
  const footprint = bld.floorLength * bld.floorWidth;
  const AB = footprint + 2 * (bld.floorLength + bld.floorWidth) * Lb;
  const seam = 2 * (bld.floorLength + bld.floorWidth);
  const QB = footprint * bld.mixingHeight * bld.airExchangeRate;
  let eta: number;
  let Acrack: number;
  if (dirt) {
    eta = 1;
    Acrack = AB;
  } else {
    if (bld.crackFraction !== undefined) eta = bld.crackFraction;
    else if (bld.crackWidth !== undefined) {
      checkPos('crackWidth', bld.crackWidth);
      eta = (bld.crackWidth * seam) / AB;
    } else throw new RangeError('a slab foundation needs a crack fraction or a crack width');
    if (!Number.isFinite(eta) || !(eta > 0 && eta <= 1)) {
      throw new RangeError(`crack fraction must be in (0, 1], got ${eta}`);
    }
    Acrack = eta * AB;
  }

  let Qsoil = 0;
  let permeability: EpaJeResult['permeability'];
  if (!dirt) {
    const g = bld.soilGas;
    if (g === undefined) {
      Qsoil = DEFAULT_QSOIL_RATIO * (REFERENCE_AIR_EXCHANGE / bld.airExchangeRate) * QB;
    } else if ('Qsoil' in g) {
      checkNonNeg('Qsoil', g.Qsoil);
      Qsoil = g.Qsoil;
    } else if ('ratio' in g) {
      checkNonNeg('ratio', g.ratio);
      Qsoil = g.ratio * QB;
    } else {
      let kv = g.kv;
      if (kv === undefined) {
        if (!floorLayer.stratum) throw new RangeError('enter kv: no soil stratum at the floor');
        permeability = stratumPermeability(floorLayer.stratum);
        kv = permeability.kv;
      }
      const Xcrack = g.Xcrack ?? seam;
      Qsoil = soilGasFlow({
        dP: g.dP,
        kv,
        mu: g.mu ?? DEFAULT_AIR_VISCOSITY,
        Xcrack,
        Zcrack: Lb,
        rcrack: crackRadius(eta, AB, Xcrack),
      });
    }
  }
  if (!permeability && !dirt && floorLayer.stratum) {
    try {
      permeability = stratumPermeability(floorLayer.stratum);
    } catch {
      permeability = undefined;
    }
  }

  const a = jeAlpha({
    DT,
    AB,
    QB,
    LT,
    Qsoil,
    Lcrack: bld.foundationThickness,
    Dcrack,
    Acrack,
    ...(dirt ? { dirtFloor: true } : {}),
  });

  if (a.xi > 10 && !dirt) {
    warnings.push({
      code: 'vapor.advection-dominated',
      message: `crack Peclet number ${a.xi.toPrecision(3)} exceeds 10: entry is controlled by the soil gas flow, so the result is sensitive to the permeability and pressure difference`,
    });
  }
  if (LT < Lb) {
    warnings.push({
      code: 'vapor.crack-depth',
      message: `the source lies within the foundation's zone of influence (L_T ${LT} m < crack depth ${Lb} m)`,
    });
  }
  if (input.sourceNotUnderBuilding) {
    warnings.push({
      code: 'vapor.lateral-offset',
      message:
        'the source is flagged as not under the building: the one-dimensional model does not apply (see the three-dimensional studies cited in the methods note)',
    });
  }

  const concentrationInfinite = a.alpha * cvs;
  let concentration = concentrationInfinite;
  let finite: EpaJeResult['finite'];
  if (input.finiteSource) {
    if (src.kind !== 'soil' || src.bottomDepth === undefined) {
      throw new RangeError(
        'a finite source needs a soil source with the depth to the bottom of the contamination',
      );
    }
    const tau = input.finiteSource.exposureDuration;
    checkPos('exposureDuration', tau);
    const dHc = src.bottomDepth - sourceDepth;
    checkPos('contamination thickness', dHc);
    const rhoF = srcStratum.bulkDensity * src.F;
    const beta =
      1 + ((DT * AB) / LT) * (bld.foundationThickness / (Dcrack * Acrack)) * expm1Over(a.xi);
    const massLimit = (rhoF * dHc * AB) / (QB * tau);
    if (cvs > 0) {
      const psi = (DT * cvs) / (LT * LT * rhoF);
      const tauD = (Math.pow(dHc / LT + beta, 2) - beta * beta) / (2 * psi);
      const depleted = tauD < tau;
      let averageAlpha: number | undefined;
      if (depleted) {
        concentration = massLimit;
      } else {
        averageAlpha =
          ((rhoF * dHc * AB) / (QB * cvs * tau)) *
          (LT / dHc) *
          (Math.sqrt(beta * beta + 2 * psi * tau) - beta);
        concentration = averageAlpha * cvs;
      }
      finite = {
        beta,
        psi,
        depletionTime: tauD,
        exposureDuration: tau,
        depleted,
        ...(averageAlpha !== undefined ? { averageAlpha } : {}),
        massLimitConcentration: massLimit,
      };
    } else {
      concentration = 0;
      finite = {
        beta,
        psi: 0,
        depletionTime: Infinity,
        exposureDuration: tau,
        depleted: false,
        averageAlpha: 0,
        massLimitConcentration: massLimit,
      };
    }
  }

  // Vapor profile (infinite source), source first.
  const cb = cvs * (1 - a.alpha / a.A);
  const profile: ProfilePoint[] = [{ height: 0, concentration: cvs }];
  let z = 0;
  let r = 0;
  for (let i = layers.length - 1; i >= 0; i--) {
    z += layers[i]!.thickness;
    r += layers[i]!.thickness / deffs[i]!;
    profile.push({ height: z, concentration: cvs - (cvs - cb) * (r / resistance) });
  }

  return {
    concentration,
    alpha: a.alpha,
    coefficient: cvs > 0 ? concentration / cvs : a.alpha,
    concentrationInfinite,
    alphaDiffusionOnly: a.alphaDiffusionOnly,
    entryRate: QB * concentration,
    sourceVapor: cvs,
    Hprime,
    ...(dHvTS !== undefined ? { dHvTS } : {}),
    DT,
    capacityRg,
    LT,
    QB,
    AB,
    Acrack,
    eta,
    Dcrack,
    Qsoil,
    xi: a.xi,
    A: a.A,
    ...(permeability ? { permeability } : {}),
    layerDeff: deffs,
    ...(finite ? { finite } : {}),
    profile,
    warnings,
  };
}

export type { SoilTextureCode };

export const vaporJeEpa: MethodDescriptor<EpaJeInput, EpaJeResult> = {
  id: 'vapor.je-epa',
  process: 'vapor',
  kind: 'modern',
  name: 'EPA Johnson and Ettinger soil, soil gas or groundwater to indoor air',
  summary:
    'The EPA implementation of the Johnson and Ettinger model: layered soil with texture presets, Henry constant at the soil temperature, a capillary zone from the van Genuchten curve, five foundation types, soil gas flow from a ratio or the soil permeability, and an optional finite soil source.',
  citations: [
    'epa2004je',
    'epa2017je',
    'johnsonettinger1991',
    'millingtonquirk1961',
    'vangenuchten1980',
  ],
  assumptions: [
    'Steady, one-dimensional vapor transport through homogeneous layers; the source extends under the whole building footprint.',
    'Infinite source unless a finite soil source is requested; linked to a time-varying source the method is applied quasi-steadily.',
    'No sorption to building materials, no indoor background and no biodegradation.',
    'The crack diffusion coefficient is that of the soil layer in contact with the floor; the source-building separation excludes the floor.',
    'The capillary zone is uncontaminated and its top must lie below the floor.',
  ],
  risc5Choice:
    'RISC5 holds Henry constant at 25 deg C, takes the crack diffusion coefficient from a foundation layer, enters the capillary fringe as a layer, and keeps the source infinite; this method follows EPA on each point.',
  validate: (input) => jeEpaIndoor(input).warnings,
  run: jeEpaIndoor,
};
