import { convert } from '../src/numerics/units.js';
import type {
  At123dRunInput,
  AttenuationFactorInput,
  BenchmarkScreenInput,
  DispersivityInput,
  DomenicoRunInput,
  EcosslScreenInput,
  HhrapProduceInput,
  HouseholdInput,
  IrrigationMethodInput,
  LegacyPlantInput,
  LittleInput,
  ParticulateBoxInput,
  ParticulatePef2002Input,
  ParticulatePefInput,
  ShowerInput,
  SprinklerMethodInput,
  TphTotalLevelInput,
  WexlerRunInput,
  DevaullInput,
  DominantLayerInput,
  EpaJeInput,
  JuryInput,
  LayeredInput,
  LegacyJeInput,
  LegacySurfaceWaterInput,
  ModernSurfaceWaterInput,
  OutdoorBoxInput,
  PviInput,
  SaturatedSourceInput,
  SsgVfInput,
  VadsatInput,
} from '../src/index.js';
import { handInput } from './saturatedHelpers.js';

/**
 * Plain runnable inputs used only to exercise the uncertain-input declarations (accessor contract and
 * a model run after each set). The numbers are test scaffolding, not data and not a validation.
 */

const DAY = 86400;
const YEAR = 365.25 * DAY;

const sand = { thetaS: 0.35, thetaR: 0.05, n: 2.68, Ks: 10 / DAY, rhoB: 1700, foc: 0.01 };
const loam = { thetaS: 0.4, thetaR: 0.05, n: 1.6, Ks: 0.25 / DAY, rhoB: 1600, foc: 0.004 };
const silt = { thetaS: 0.45, thetaR: 0.07, n: 1.4, Ks: 0.1 / DAY, rhoB: 1500, foc: 0.006 };
const vadoseChem = {
  M: 0.078,
  S: 1.75,
  H: 0.228,
  Koc: 0.059,
  Da: 8.8e-6,
  Dw: 9.8e-10,
  mu: 0.001 / DAY,
};

export const vadsatBase: VadsatInput = {
  q: 0.2 / YEAR,
  depthToSource: 4,
  above: sand,
  lens: { ...sand, n: 2, thetaR: 0.15, Ks: 1 / DAY, thickness: 0.2 },
  source: { ...sand, thickness: 3, length: 10, width: 10, F: 5e-6, decayRate: 1e-9 },
  below: { ...sand, thickness: 2.8 },
  chemical: vadoseChem,
  alphaL: 0.3,
  duration: 10 * YEAR,
  seriesStep: YEAR / 2,
  depths: [0.5, 1.5, 2.5],
};

export const layeredBase: LayeredInput = {
  q: 0.2 / YEAR,
  above: [
    { ...loam, thickness: 1.5 },
    { ...silt, thickness: 0.3 },
  ],
  source: { ...loam, thickness: 1, length: 10, width: 8, F: 20e-6, decayRate: 1e-10 },
  below: [
    { ...loam, thickness: 4 },
    { ...sand, thickness: 3 },
    { ...silt, thickness: 3 },
  ],
  chemical: vadoseChem,
  alphaL: 0.5,
  duration: 30 * YEAR,
  seriesStep: YEAR,
  depths: [0.5, 1.5],
};

/** Four layers on each side, so every declared layer slot is present. */
export const layeredWideBase: LayeredInput = {
  ...layeredBase,
  above: [
    { ...loam, thickness: 0.5 },
    { ...silt, thickness: 0.3 },
    { ...sand, thickness: 0.4 },
    { ...loam, thickness: 0.6 },
  ],
  below: [
    { ...loam, thickness: 1 },
    { ...sand, thickness: 1 },
    { ...silt, thickness: 1 },
    { ...loam, thickness: 1 },
  ],
};

export const saturatedTwoRegionBase: SaturatedSourceInput = handInput('A');
export const saturatedExponentialBase: SaturatedSourceInput = {
  ...handInput('A'),
  sourceDecayRate: 1e-10,
};

const vaporChem = { Da: 8.8e-6, Dw: 9.8e-10, H: 0.228 };
const vaporLayer = { thickness: 1.2, porosity: 0.35, moisture: 0.1 };
const building = {
  volume: 200,
  airExchangeRate: 0.45 / 3600,
  floorArea: 100,
  crackFraction: 0.001,
  foundation: { thickness: 0.1, porosity: 0.25, moisture: 0.05 },
  soilGas: { Qsoil: 5e-5 },
};
const soilSource = {
  kind: 'soil' as const,
  F: 5e-6,
  rhoB: 1600,
  kd: 3e-4,
  theta: 0.1,
  thetaA: 0.25,
  H: 0.228,
  M: 0.078,
  S: 1.75,
};

export const legacyJeBase: LegacyJeInput = {
  chemical: vaporChem,
  layers: [vaporLayer, { ...vaporLayer, thickness: 0.8, moisture: 0.15 }],
  building,
  source: soilSource,
};
export const legacyJeGroundwaterBase: LegacyJeInput = {
  ...legacyJeBase,
  capillaryFringe: { thickness: 0.3, porosity: 0.4, moisture: 0.35 },
  source: { kind: 'groundwater', cgw: 1e-3, H: 0.228, S: 1.75, x: 1 },
};
export const dominantLayerBase: DominantLayerInput = {
  chemical: vaporChem,
  layer1: vaporLayer,
  layer2: { ...vaporLayer, thickness: 0.5, rate: 1e-6 },
  layer3: { ...vaporLayer, thickness: 0.4 },
  receptor: { kind: 'indoor', building },
  source: { kind: 'soilGas', csg: 0.02 },
};

const epaChem = { Da: 8.8e-6, Dw: 9.8e-10, henryAtm: 5.6e-3, koc: 0.059, M: 0.078, S: 1.75 };
export const epaJeBase: EpaJeInput = {
  chemical: epaChem,
  temperature: 283.15,
  strata: [
    {
      thickness: 1,
      porosity: 0.38,
      moisture: 0.1,
      bulkDensity: 1650,
      foc: 0.01,
      saturatedConductivity: 1e-5,
      residualMoisture: 0.05,
      vgM: 0.5,
    },
    {
      thickness: 2,
      porosity: 0.38,
      moisture: 0.1,
      bulkDensity: 1650,
      foc: 0.01,
      saturatedConductivity: 1e-5,
      residualMoisture: 0.05,
      vgM: 0.5,
    },
  ],
  floorDepth: 1.8,
  building: {
    foundation: 'basementSlab',
    floorLength: 10,
    floorWidth: 10,
    depthBelowGrade: 1.8,
    mixingHeight: 2.44,
    airExchangeRate: 0.25 / 3600,
    foundationThickness: 0.1,
    crackWidth: 0.001,
    crackFraction: 0.0005,
    soilGas: { Qsoil: 5e-5 },
  },
  source: { kind: 'soil', F: 1e-6, bottomDepth: 4, FT: 1e-3, MT: 0.1 },
  finiteSource: { exposureDuration: 9.5e8 },
};

export const devaullBase: DevaullInput = {
  chemical: vaporChem,
  layer: { thickness: 3, porosity: 0.35, moisture: 0.1 },
  degradationRate: 0.73 / 3600,
  foundation: { h: 1e-4, soilGasVelocity: 1e-7 },
  building: { mixingHeight: 2.44, airExchangeRate: 0.45 / 3600 },
  source: { kind: 'soilGas', csg: 0.02 },
  oxygen: { mode: 'entered', aerobicDepth: 1 },
};
export const devaullCoupledBase: DevaullInput = {
  ...devaullBase,
  oxygen: {
    mode: 'fastReaction',
    Da: 1.8e-5,
    Dw: 2.1e-9,
    H: 32,
    atmosphericConcentration: 0.28,
    massRatio: 3.1,
    respiration: 1e-9,
    totalHydrocarbonVapor: 0.02,
  },
};

export const attenuationBase: AttenuationFactorInput = {
  medium: 'groundwater',
  concentration: 1e-3,
  H: 0.228,
  depthBelowFoundation: 3,
};
export const pviBase: PviInput = {
  separation: 3,
  smallestBuildingDimension: 9,
  soilBenzene: 1e-6,
  soilTph: 1e-5,
  groundwaterBenzene: 1e-3,
  groundwaterTph: 1e-2,
  ethanolFraction: 0.1,
};
export const juryBase: JuryInput = {
  chemical: vaporChem,
  soil: { porosity: 0.434, moisture: 0.15, bulkDensity: 1500, kd: 3.42e-4 },
  coverThickness: 0.5,
  layerThickness: 2,
  initialConcentration: 1.5,
  boundaryLayerThickness: 0.005,
  decayRate: 1e-9,
};
export const outdoorBoxBase: OutdoorBoxInput = {
  box: { length: 10, width: 4, height: 2, windSpeed: 2.25 },
  flux: 3.7e-9,
};
export const ssgVfBase: SsgVfInput = {
  chemical: vaporChem,
  soil: { porosity: 0.434, moisture: 0.15, bulkDensity: 1500, kd: 3.42e-4 },
  qOverC: 0.0239,
  exposureTime: 9.5e8,
  sourceDepth: 3,
};

const mgPerL = (x: number): number => convert(x, 'mg/L', 'kg/m3');
export const surfaceLegacyBase: LegacySurfaceWaterInput = {
  body: { type: 'river', crossSection: 5, reachLength: 100 },
  upstreamFlow: 10 / DAY,
  background: 0,
  mixingFraction: 0.5,
  decay: 1e-7,
  reach: { kind: 'entered', length: 100 },
  discharge: { kind: 'darcy', bedConductivity: 10 / DAY, thickness: 5, gradient: 0.05 },
  times: [0, 1e8],
  groundwaterConcentrations: [mgPerL(5), mgPerL(5)],
  sediment: { fractionOrganicCarbon: 0.01, koc: 0.059 },
};
export const surfaceModernBase: ModernSurfaceWaterInput = {
  body: { type: 'river', crossSection: 5, reachLength: 100 },
  upstreamFlow: 10 / DAY,
  background: 0,
  mixingFraction: 0.5,
  decay: 1e-7,
  bank: {
    kind: 'discharge',
    times: [0, 1e8],
    discharge: [1e-7, 1e-7],
    groundwaterFlow: 1e-4,
  },
  initialConcentration: 1e-4,
  downstream: { distance: 500 },
  sediment: { fractionOrganicCarbon: 0.01, koc: 0.059 },
};

/** A lake with a fixed discharge, a Domenico reach and a Kd-based sediment. */
export const surfaceLegacyLakeBase: LegacySurfaceWaterInput = {
  ...surfaceLegacyBase,
  body: { type: 'lake', volume: 1e5 },
  reach: { kind: 'domenico', sourceWidth: 20, distance: 100, transverseDispersivity: 3 },
  discharge: { kind: 'flow', flow: 1e-4 },
  sediment: { fractionOrganicCarbon: 0.01, kd: 3e-4 },
};
export const surfaceModernLakeBase: ModernSurfaceWaterInput = {
  ...surfaceModernBase,
  body: { type: 'lake', volume: 1e5 },
  sediment: { fractionOrganicCarbon: 0.01, kd: 3e-4 },
};

const dpFlow = { dP: 4, Xcrack: 40, Zcrack: 1.8, kv: 1e-11 };
const wideLayers = [
  vaporLayer,
  { ...vaporLayer, thickness: 0.8, moisture: 0.15 },
  { ...vaporLayer, thickness: 0.5 },
  { ...vaporLayer, thickness: 0.4, moisture: 0.12 },
];
/** Soil gas flow from a pressure difference (permeability entered), four layers, soil gas source. */
export const legacyJeDpBase: LegacyJeInput = {
  ...legacyJeBase,
  layers: wideLayers,
  building: { ...building, soilGas: dpFlow },
  source: { kind: 'soilGas', csg: 0.02 },
};
export const legacyJeConductivityBase: LegacyJeInput = {
  ...legacyJeBase,
  building: {
    ...building,
    soilGas: { dP: 4, Xcrack: 40, Zcrack: 1.8, hydraulicConductivity: 1e-5 },
  },
};
export const dominantLayerDpBase: DominantLayerInput = {
  ...dominantLayerBase,
  receptor: { kind: 'indoor', building: { ...building, soilGas: dpFlow } },
  source: soilSource,
};
export const dominantLayerGroundwaterBase: DominantLayerInput = {
  ...dominantLayerBase,
  source: { kind: 'groundwater', cgw: 1e-3, H: 0.228, S: 1.75, x: 1 },
};
export const dominantLayerConductivityBase: DominantLayerInput = {
  ...dominantLayerBase,
  receptor: {
    kind: 'indoor',
    building: {
      ...building,
      soilGas: { dP: 4, Xcrack: 40, Zcrack: 1.8, hydraulicConductivity: 1e-5 },
    },
  },
};

const wideStratum = epaJeBase.strata[0]!;
export const epaJeWideBase: EpaJeInput = {
  ...epaJeBase,
  strata: [
    { ...wideStratum, thickness: 0.5 },
    { ...wideStratum, thickness: 0.5 },
    { ...wideStratum, thickness: 0.5 },
    { ...wideStratum, thickness: 0.5 },
  ],
  building: { ...epaJeBase.building, soilGas: { ratio: 0.003 } },
  source: { kind: 'soilGas', csg: 0.02 },
};
const { finiteSource: _dropped, ...epaNoFinite } = epaJeBase;
void _dropped;
export const epaJeDpBase: EpaJeInput = {
  ...epaNoFinite,
  building: { ...epaJeBase.building, soilGas: { dP: 4, kv: 1e-11, Xcrack: 40 } },
  source: { kind: 'groundwater', cgw: 1e-3, x: 1 },
};

export const devaullSoilBase: DevaullInput = { ...devaullBase, source: soilSource };
export const devaullGroundwaterBase: DevaullInput = {
  ...devaullBase,
  source: { kind: 'groundwater', cgw: 1e-3, H: 0.228, S: 1.75, x: 1 },
};

// M1 groundwater, M7 shower, irrigation and particulate, M9 plant uptake, eco and TPH bases.

const gwSteps = [
  { start: 0, end: 1e6, rate: 1e-6 },
  { start: 1e6, end: 2e6, rate: 2e-6 },
  { start: 2e6, end: 3e6, rate: 3e-6 },
  { start: 3e6, end: Infinity, rate: 4e-6 },
];
export const at123dBase: At123dRunInput = {
  aquifer: {
    velocity: 1e-6,
    porosity: 0.3,
    retardation: 1.5,
    decayRate: 1e-9,
    dx: 1e-6,
    dy: 2e-7,
    dz: 5e-8,
    thickness: 10,
  },
  source: { x1: -1, x2: 1, y1: -2, y2: 2, z1: 1, z2: 2 },
  loading: gwSteps,
  time: 1e7,
  points: [{ x: 20, y: 0, z: 1.5 }],
};

const gwConc = [
  { start: 0, end: 1e6, concentration: 1 },
  { start: 1e6, end: 2e6, concentration: 0.5 },
  { start: 2e6, end: 3e6, concentration: 0.25 },
  { start: 3e6, end: 4e6, concentration: 0.1 },
];
export const wexlerBase: WexlerRunInput = {
  params: {
    velocity: 1e-6,
    retardation: 1.5,
    decayRate: 1e-9,
    dx: 1e-6,
    dy: 2e-7,
    dz: 5e-8,
    c0: 1,
    patch: { y1: 1, y2: 3, z1: 0.5, z2: 1 },
  },
  width: 10,
  thickness: 5,
  time: 1e7,
  loading: gwConc,
  points: [{ x: 5, y: 2, z: 0.7 }],
};
export const domenicoBase: DomenicoRunInput = {
  params: {
    velocity: 1e-6,
    retardation: 1.5,
    decayRate: 1e-9,
    alphaL: 3,
    alphaT: 0.3,
    alphaV: 0.03,
    c0: 1,
    sourceWidth: 10,
    sourceThickness: 2,
  },
  time: 1e7,
  loading: gwConc,
  points: [{ x: 20, y: 0, z: 1 }],
};
export const dispersivityBase: DispersivityInput = { distance: 50 };

export const showerBase: ShowerInput = {
  waterConcentration: 1e-3,
  henry: 0.2,
  molecularWeight: 78,
  dropletDiameter: 1e-3,
  fallTime: 1,
  waterFlow: 1e-4,
  showerTime: 600,
  stallVolume: 2,
  filmReferences: { gasCmPerH: 3000, liquidCmPerH: 20 },
  temperature: {
    calibrationK: 293.15,
    waterK: 313.15,
    viscosityCalibration: 1,
    viscosityWater: 0.65,
  },
};
export const littleBase: LittleInput = { ...showerBase, gasFlow: 1e-3, postShowerTime: 300 };
export const householdBase: HouseholdInput = {
  waterConcentration: 1e-3,
  transferFactorLPerM3: 0.5,
  volatile: true,
};

const sprinkler = {
  henry: 0.2,
  molecularWeight: 78,
  dropletDiameter: 2e-3,
  fallTime: 2,
  sprinklerFlow: 2e-4,
  filmReferences: { gasCmPerH: 3000, liquidCmPerH: 20 },
  temperature: {
    calibrationK: 293.15,
    waterK: 303.15,
    viscosityCalibration: 1,
    viscosityWater: 0.8,
  },
};
export const sprinklerBase: SprinklerMethodInput = {
  waterConcentration: 1e-3,
  sprinkler,
  box: { height: 2, windSpeed: 2, length: 10, width: 5 },
};
export const irrigationBase: IrrigationMethodInput = {
  waterConcentration: 1e-3,
  sprinkler,
  box: { height: 2, windSpeed: 2, length: 10, width: 5 },
  applicationRate: 1e-8,
  chemical: 'benzene',
};

const windErosion = { vegetativeCover: 0.4, meanWind: 4, thresholdWind: 11, fx: 0.2 };
export const particulateBoxBase: ParticulateBoxInput = {
  soilConcentration: 1e-5,
  flux: 1e-12,
  wind: windErosion,
  box: { length: 20, width: 20, height: 2, windSpeed: 2 },
};
export const particulateBoxWindBase: ParticulateBoxInput = {
  soilConcentration: 1e-5,
  wind: windErosion,
  box: { length: 20, width: 20, height: 2, windSpeed: 2 },
};
export const pef1996Base: ParticulatePefInput = {
  soilConcentration: 1e-5,
  qOverC: 90,
  wind: windErosion,
};
export const pef2002Base: ParticulatePef2002Input = {
  soilConcentration: 1e-5,
  qOverC: 90,
  wind: windErosion,
  areaAcres: 2,
};

const leaf = {
  tscf: 0.5,
  transpiration_m3_per_d: 1e-3,
  conductance_m_per_d: 50,
  leafArea_m2: 0.05,
  mass_kg: 0.1,
  kLeafAir_m3_per_kg: 1e3,
  lossRate_per_d: 0.1,
};
export const legacyPlantBase: LegacyPlantInput = {
  logKow: 3,
  soil: {
    concentration_kg_per_kg: 1e-6,
    bulkDensity_kg_per_m3: 1500,
    waterFilledPorosity: 0.3,
    kd_m3_per_kg: 0.002,
  },
  airConcentration_kg_per_m3: 1e-9,
  produce: 'aboveground',
  leaf,
  growthPeriod_d: 60,
  rootZoneWater_kg_per_m3: 1e-6,
  irrigation: {
    input: { concentration_mg_per_L: 0.01, applicationRate_L_per_m2_per_d: 5, source: 'user' },
    interceptionFraction: 0.3,
    plantedArea_m2: 10,
  },
  userBcf: 0.1,
};
export const hhrapBase: HhrapProduceInput = {
  logKow: 3,
  kaw: 0.2,
  kd_m3_per_kg: 0.002,
  soilConcentration_kg_per_kg: 1e-6,
  vaporAirConcentration_kg_per_m3: 1e-9,
  produce: 'aboveground-exposed',
  userBr: 0.2,
};

export const ecosslBase: EcosslScreenInput = {
  soil_kg_per_kg: 1e-5,
  ssl: {
    plants: { status: 'value', value: 1e-4 },
    invertebrates: { status: 'value', value: 2e-4 },
    avian: { status: 'value', value: 3e-4 },
    mammalian: { status: 'value', value: 4e-4 },
  },
};
type Form = 'ratio' | 'affine' | 'ln';
const foodItems = (forms: readonly Form[]) =>
  forms.map((form, k) => ({
    name: `item${k}`,
    dietFraction: 0.2,
    model:
      form === 'ratio'
        ? { form, a: 0.5, cdiet: 1 }
        : form === 'affine'
          ? { form, a: 0.4, b: 2, cdiet: 1 }
          : { form, a: 0.6, b: 1 },
  }));
const wildlifeBase = (forms: readonly Form[]): BenchmarkScreenInput => ({
  soil_kg_per_kg: 1e-5,
  benchmarks: [1, 2, 3, 4].map((k) => ({
    receptor: `r${k}`,
    citation: 'user',
    value_kg_per_kg: k * 1e-4,
  })),
  wildlife: [
    {
      receptor: 'w1',
      food: {
        foodIngestion_kg_per_kg_d: 0.1,
        soilFraction: 0.05,
        areaUseFactor: 1,
        items: foodItems(forms),
        trv_kg_per_kg_d: 1e-4,
      },
    },
    {
      receptor: 'w2',
      food: {
        foodIngestion_kg_per_kg_d: 0.2,
        soilFraction: 0.1,
        areaUseFactor: 0.5,
        items: foodItems(forms),
        trv_kg_per_kg_d: 2e-4,
      },
    },
  ],
});
export const benchmarkBase = wildlifeBase(['ratio', 'affine', 'ln', 'ratio']);
export const benchmarkAltBase = wildlifeBase(['affine', 'ln', 'affine', 'ln']);

const tphSet = (n: number): TphTotalLevelInput['fractions'] =>
  Array.from({ length: n }, (_, k) => ({
    label: `f${k}`,
    family: k % 2 === 0 ? ('aliphatic' as const) : ('aromatic' as const),
    massFraction: 1 / n,
    surrogate: 'E1790668',
    levelKgPerKg: 1e-3 * (k + 1),
  }));
export const tphBase: TphTotalLevelInput = { fractions: tphSet(8), targetHazardIndex: 1 };
export const tphShortBase: TphTotalLevelInput = { fractions: tphSet(3) };
