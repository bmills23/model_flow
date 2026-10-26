import { DEFAULT_FORM as HOUSEHOLD } from '../household/form';
import { DEFAULT_FORM as PLANTS_ECO } from '../plantsEco/form';
import { SITE_FIELDS, type SiteField } from '../report/siteValues';
import { applyTexture as saturatedTexture, DEFAULT_FORM as SATURATED } from '../saturated/form';
import { DEFAULT_FORM as SURFACE_WATER } from '../surfaceWater/inputs';
import { DEFAULT_FORM as TRANSPORT } from '../transport/form';
import { applyTexture as vadoseTexture, DEFAULT_FORM as VADOSE } from '../vadose/form';
import {
  applyTexture as vaporTexture,
  DEFAULT_FORM as VAPOR,
  type TextureChoice,
} from '../vapor/form';
import { chain, type Chain } from './chain';
import { provenanceOf, sameNumber, strongest, texturePreset, type Provenance } from './provenance';
import {
  TEMPLATE_STRIPPED,
  type GuidedFormKey,
  type GuidedForms,
  type GuidedSite,
  type GuidedState,
} from './state';

/**
 * Step 3a, site properties: the site values each chosen model reads, gathered into a few groups. One
 * field stands for every form key it describes (the source length is the same length for the transport,
 * leaching and saturated models; a soil property is the same for every layer of a soil column), so
 * typing it once writes every bound template. The keys and their `when` rules are those of
 * `SITE_FIELDS` (`report/siteValues.ts`); the fields that another step sets are named in `NON_VALUES`.
 * Pure: every function takes the guided state and returns a new one or a view of it.
 */

type Form = Record<string, unknown>;

export type PropertyGroupId =
  | 'source'
  | 'unsaturated'
  | 'saturatedSoil'
  | 'aquifer'
  | 'building'
  | 'water'
  | 'household'
  | 'produce';

export interface PropertyGroup {
  id: PropertyGroupId;
  label: string;
  intro: string;
}

export const PROPERTY_GROUPS: readonly PropertyGroup[] = [
  {
    id: 'source',
    label: 'Source area',
    intro: 'The size of the contaminated area and the water that passes through it.',
  },
  {
    id: 'unsaturated',
    label: 'Unsaturated zone',
    intro: 'The soil between the ground surface and the water table.',
  },
  {
    id: 'saturatedSoil',
    label: 'Soil below the water table',
    intro: 'The contaminated soil below the water table and how far the water table moves in it.',
  },
  {
    id: 'aquifer',
    label: 'Aquifer and well',
    intro: 'How groundwater moves away from the source, and where the well is.',
  },
  {
    id: 'building',
    label: 'Building',
    intro: 'The building that vapor enters and its foundation.',
  },
  {
    id: 'water',
    label: 'Water body',
    intro: 'The stream that groundwater flows to.',
  },
  {
    id: 'household',
    label: 'Household water use',
    intro: 'Showering and garden watering with water from the well.',
  },
  {
    id: 'produce',
    label: 'Homegrown produce',
    intro: 'The garden soil and the plants grown in it.',
  },
];

/** One form key a field writes. `optional` says when the run reads the value but a blank is allowed. */
export interface Binding {
  model: GuidedFormKey;
  /** A `SITE_FIELDS` key of the model: `a`, `a.b`, or `list[].field` for every entry of a list. */
  key: string;
  optional?: true | ((form: Form) => boolean);
  /** A further condition of use, where the screen reads the value under a choice `SITE_FIELDS` does not name. */
  when?: (form: Form) => boolean;
}

export interface PropertyField {
  id: string;
  group: PropertyGroupId;
  label: string;
  unit: string;
  bindings: readonly Binding[];
  /** Each entry of the bound list gets its own box (a layer thickness); one binding only. */
  perItem?: boolean;
  hint?: string;
}

const b = (model: GuidedFormKey, key: string, optional?: Binding['optional']): Binding =>
  optional === undefined ? { model, key } : { model, key, optional };

const field = (
  id: string,
  group: PropertyGroupId,
  label: string,
  unit: string,
  bindings: readonly Binding[],
  extra: Pick<PropertyField, 'perItem' | 'hint'> = {},
): PropertyField => ({ id, group, label, unit, bindings, ...extra });

const unless =
  (key: string, value: unknown) =>
  (form: Form): boolean =>
    form[key] !== value;
const always = true as const;

/** Every layer of the leaching model's column: the source layer, the layers above it and below it. */
const vadoseLayers = (name: string): Binding[] => [
  b('vadose', `source.${name}`),
  b('vadose', `above[].${name}`),
  b('vadose', `below[].${name}`),
];

export const PROPERTY_FIELDS: readonly PropertyField[] = [
  // source area
  field('srcLength', 'source', 'Source length along the groundwater flow', 'm', [
    b('transport', 'srcLength'),
    b('vadose', 'srcLength'),
    b('saturated', 'srcLength'),
  ]),
  field('srcWidth', 'source', 'Source width across the flow', 'm', [
    b('transport', 'srcWidth'),
    b('vadose', 'srcWidth'),
    b('saturated', 'srcWidth'),
    b('surfaceWater', 'sourceWidth', unless('reachMode', 'domenico')),
  ]),
  field('srcThicknessBelow', 'source', 'Source thickness below the water table', 'm', [
    b('transport', 'srcDepth'),
    b('saturated', 'srcThickness'),
  ]),
  field('srcThicknessAbove', 'source', 'Source thickness above the water table', 'm', [
    b('vadose', 'source.thickness'),
  ]),
  field('infiltration', 'source', 'Infiltration through the source', 'cm/yr', [
    b('vadose', 'infiltration'),
    b('saturated', 'infiltration'),
  ]),
  field('srcDecay', 'source', 'Source decay rate', '1/d', [
    b('vadose', 'srcDecay'),
    b('saturated', 'srcDecay'),
  ]),
  field(
    'tphMolarMass',
    'source',
    'Molar mass of the total petroleum hydrocarbons',
    'g/mol',
    [
      b('vadose', 'srcMT', always),
      b('saturated', 'MT', always),
      b('vapor', 'tphMolarMass', always),
    ],
    { hint: 'Used only for a chemical with a TPH total in step 3b.' },
  ),

  // unsaturated zone
  field('porosity', 'unsaturated', 'Total porosity', '', [
    ...vadoseLayers('thetaS'),
    b('vapor', 'layers[].porosity'),
  ]),
  field('waterFilled', 'unsaturated', 'Water-filled porosity', '', [
    b('vapor', 'layers[].moisture'),
  ]),
  field('thetaR', 'unsaturated', 'Residual water content', '', vadoseLayers('thetaR')),
  field('vgN', 'unsaturated', 'van Genuchten n', '', vadoseLayers('n')),
  field('ks', 'unsaturated', 'Saturated hydraulic conductivity', 'm/d', vadoseLayers('Ks')),
  field('bulkDensity', 'unsaturated', 'Dry bulk density', 'g/cm3', [
    ...vadoseLayers('rhoB'),
    b('vapor', 'layers[].bulkDensity'),
  ]),
  field('foc', 'unsaturated', 'Organic carbon fraction', '', [
    ...vadoseLayers('foc'),
    b('vapor', 'layers[].foc'),
  ]),
  field(
    'vadoseAboveThickness',
    'unsaturated',
    'Leaching model: layers from the ground surface to the source',
    'm',
    [b('vadose', 'above[].thickness')],
    { perItem: true },
  ),
  field(
    'vadoseBelowThickness',
    'unsaturated',
    'Leaching model: layers from the source down to the water table',
    'm',
    [b('vadose', 'below[].thickness')],
    { perItem: true },
  ),
  field(
    'vaporLayerThickness',
    'unsaturated',
    'Soil column under the building, from the ground surface down',
    'm',
    [b('vapor', 'layers[].thickness')],
    { perItem: true },
  ),
  field('unsatAlphaL', 'unsaturated', 'Longitudinal dispersivity in the unsaturated zone', 'm', [
    b('vadose', 'alphaL'),
  ]),
  field('temperature', 'unsaturated', 'Soil temperature', 'deg C', [b('vapor', 'temperature')]),
  field(
    'capHeight',
    'unsaturated',
    'Capillary zone thickness',
    'm',
    [b('vapor', 'capHeight', always)],
    {
      hint: 'Blank: the modern method takes it from the deepest layer, the legacy method has none.',
    },
  ),
  field('capPorosity', 'unsaturated', 'Capillary zone porosity', '', [
    b('vapor', 'capPorosity', always),
  ]),
  field('capMoisture', 'unsaturated', 'Capillary zone water-filled porosity', '', [
    b('vapor', 'capMoisture', always),
  ]),

  // soil below the water table
  field('hMin', 'saturatedSoil', 'Saturated thickness of the source at low water', 'm', [
    b('saturated', 'hMin'),
  ]),
  field('dh', 'saturatedSoil', 'Rise of the water table', 'm', [b('saturated', 'dh')]),
  field('fractionHigh', 'saturatedSoil', 'Fraction of the year at high water', '', [
    b('saturated', 'fractionHigh'),
  ]),
  field('satPorosity', 'saturatedSoil', 'Total porosity', '', [b('saturated', 'porosity')]),
  field('satBulkDensity', 'saturatedSoil', 'Dry bulk density', 'g/cm3', [b('saturated', 'rhoB')]),
  field('satThetaR', 'saturatedSoil', 'Residual water content', '', [b('saturated', 'thetaR')]),
  field('satN', 'saturatedSoil', 'van Genuchten n', '', [b('saturated', 'n')]),
  field('satFoc', 'saturatedSoil', 'Organic carbon fraction', '', [b('saturated', 'foc')]),

  // aquifer and well
  field('K', 'aquifer', 'Hydraulic conductivity of the aquifer', 'm/d', [
    b('transport', 'K'),
    b('saturated', 'K'),
  ]),
  field('gradient', 'aquifer', 'Hydraulic gradient', 'm/m', [
    b('transport', 'gradient'),
    b('saturated', 'gradient'),
  ]),
  field('velocity', 'aquifer', 'Seepage velocity', 'm/yr', [b('transport', 'velocityYr')]),
  field('aquiferPorosity', 'aquifer', 'Effective porosity of the aquifer', '', [
    b('transport', 'porosity'),
  ]),
  field('aquiferThickness', 'aquifer', 'Aquifer thickness', 'm', [b('transport', 'thickness')]),
  field(
    'aquiferWidth',
    'aquifer',
    'Aquifer width',
    'm',
    [{ ...b('transport', 'width', always), when: (x) => x['thicknessMode'] === 'finite' }],
    { hint: 'Blank: the aquifer has no side walls.' },
  ),
  field('retardation', 'aquifer', 'Retardation factor', '', [b('transport', 'retardation')]),
  field('aquiferFoc', 'aquifer', 'Organic carbon fraction of the aquifer', '', [
    b('transport', 'foc'),
  ]),
  field('aquiferBulkDensity', 'aquifer', 'Dry bulk density of the aquifer', 'kg/L', [
    b('transport', 'bulkDensity'),
  ]),
  field('alphaL', 'aquifer', 'Longitudinal dispersivity', 'm', [
    b('transport', 'alphaLOverride', unless('dispLaw', 'entered')),
  ]),
  field('alphaT', 'aquifer', 'Transverse dispersivity', 'm', [
    b('transport', 'alphaTOverride', unless('dispLaw', 'entered')),
  ]),
  field('alphaV', 'aquifer', 'Vertical dispersivity', 'm', [
    b('transport', 'alphaVOverride', unless('dispLaw', 'entered')),
  ]),
  field('rx', 'aquifer', 'Well distance downgradient of the source', 'm', [b('transport', 'rx')]),
  field('ry', 'aquifer', 'Well distance across the flow', 'm', [b('transport', 'ry')]),
  field('rDepth', 'aquifer', 'Well depth below the water table', 'm', [b('transport', 'rDepth')]),
  field('screenTop', 'aquifer', 'Top of the well screen below the water table', 'm', [
    b('transport', 'screenTop'),
  ]),
  field('screenBottom', 'aquifer', 'Bottom of the well screen below the water table', 'm', [
    b('transport', 'screenBottom'),
  ]),

  // building
  field('floorDepth', 'building', 'Depth of the floor below grade', 'm', [
    b('vapor', 'floorDepth'),
  ]),
  field('floorArea', 'building', 'Floor area', 'm2', [b('vapor', 'floorArea')]),
  field('volume', 'building', 'Enclosed volume', 'm3', [b('vapor', 'volume')]),
  field('airExchange', 'building', 'Air exchange rate', '1/h', [b('vapor', 'airExchange')]),
  field('crackFraction', 'building', 'Crack fraction of the floor', '', [
    b('vapor', 'crackFraction'),
  ]),
  field('foundationThickness', 'building', 'Foundation thickness', 'm', [
    b('vapor', 'foundationThickness'),
  ]),
  field('foundationPorosity', 'building', 'Porosity in the foundation cracks', '', [
    b('vapor', 'foundationPorosity'),
  ]),
  field('foundationMoisture', 'building', 'Water-filled porosity in the foundation cracks', '', [
    b('vapor', 'foundationMoisture'),
  ]),
  field('dP', 'building', 'Indoor-outdoor pressure difference', 'Pa', [b('vapor', 'dP')]),
  field('kv', 'building', 'Soil vapor permeability', 'cm2', [b('vapor', 'kv')]),
  field('seam', 'building', 'Crack seam length', 'm', [b('vapor', 'seam')]),
  field('qsoil', 'building', 'Soil gas flow into the building', 'L/min', [b('vapor', 'qsoil')]),
  field('viscosity', 'building', 'Air viscosity, legacy method', 'g/(cm s)', [
    b('vapor', 'viscosity'),
  ]),
  field('viscosityModern', 'building', 'Air viscosity, modern method', 'g/(cm s)', [
    b('vapor', 'viscosityModern'),
  ]),
  field('dvAerobicDepth', 'building', 'Depth of the aerobic layer', 'm', [
    b('vapor', 'dvAerobicDepth'),
  ]),
  field('dvO2Percent', 'building', 'Oxygen at the base of the foundation', '% by volume', [
    b('vapor', 'dvO2Percent'),
  ]),
  field('dvDa', 'building', 'Diffusion coefficient of oxygen in air', 'cm2/s', [
    b('vapor', 'dvDa'),
  ]),
  field('dvDw', 'building', 'Diffusion coefficient of oxygen in water', 'cm2/s', [
    b('vapor', 'dvDw'),
  ]),
  field('dvH', 'building', "Henry's law constant of oxygen, dimensionless", '', [
    b('vapor', 'dvH'),
  ]),
  field(
    'dvTotalHc',
    'building',
    'Total hydrocarbon vapor at the source',
    'mg/m3',
    [b('vapor', 'dvTotalHc', always)],
    { hint: 'Blank: each chemical alone uses up the oxygen.' },
  ),

  // water body
  field('crossSection', 'water', 'River cross-section', 'm2', [b('surfaceWater', 'crossSection')]),
  field('lakeVolume', 'water', 'Lake volume', 'm3', [b('surfaceWater', 'volume')]),
  field('upstreamFlow', 'water', 'Upstream flow', 'm3/d', [b('surfaceWater', 'upstreamFlow')]),
  field(
    'background',
    'water',
    'Upstream background concentration',
    'mg/L',
    [b('surfaceWater', 'background')],
    { hint: 'The same background for every chemical.' },
  ),
  field('mixingFraction', 'water', 'Mixing fraction', '', [b('surfaceWater', 'mixingFraction')]),
  field('waterDecay', 'water', 'Decay rate in the water', '1/d', [b('surfaceWater', 'decay')], {
    hint: 'The same rate for every chemical.',
  }),
  field('bedConductivity', 'water', 'Stream bed conductivity', 'm/d', [
    b('surfaceWater', 'bedConductivity'),
  ]),
  field('bedGradient', 'water', 'Stream bed gradient', 'm/m', [b('surfaceWater', 'gradient')]),
  field('dischargeFlow', 'water', 'Groundwater discharge to the stream', 'm3/d', [
    b('surfaceWater', 'flow'),
  ]),
  field('dischargeThickness', 'water', 'Discharge thickness', 'm', [
    b('surfaceWater', 'thickness'),
  ]),
  field('reachLength', 'water', 'Reach length', 'm', [b('surfaceWater', 'reachLength')]),
  field('bankX', 'water', 'Distance from the source to the stream bank', 'm', [
    b('surfaceWater', 'bankX'),
  ]),
  field('sedimentFoc', 'water', 'Organic carbon fraction of the sediment', '', [
    b('surfaceWater', 'foc'),
  ]),
  field(
    'downstream',
    'water',
    'River receptor distance downstream',
    'm',
    [b('surfaceWater', 'downstream', always)],
    { hint: 'Blank: no downstream receptor.' },
  ),

  // household water use
  field('showerDropletDiameter', 'household', 'Shower droplet diameter', 'mm', [
    b('household', 'showerDropletDiameter', isRsl),
  ]),
  field('showerFallTime', 'household', 'Shower droplet fall time', 's', [
    b('household', 'showerFallTime', isRsl),
  ]),
  field('showerFlow', 'household', 'Shower water flow', 'L/min', [
    b('household', 'showerFlow', isRsl),
  ]),
  field('showerMinutes', 'household', 'Shower duration', 'min', [
    b('household', 'showerMinutes', isRsl),
  ]),
  field('stallVolume', 'household', 'Shower stall volume', 'm3', [
    b('household', 'stallVolume', isRsl),
  ]),
  field('ventilation', 'household', 'Shower stall ventilation', 'm3/min', [
    b('household', 'ventilation', unless('showerMethod', 'little')),
  ]),
  field('postShowerMinutes', 'household', 'Time in the stall after the water is off', 'min', [
    b('household', 'postShowerMinutes', always),
  ]),
  field('householdFactor', 'household', 'Household transfer factor', 'L water per m3 air', [
    b('household', 'householdFactor', unless('showerMethod', 'rsl')),
  ]),
  field(
    'filmGas',
    'household',
    'Gas film reference coefficient',
    'cm/h',
    [b('household', 'filmGas', always)],
    { hint: 'Enter both film coefficients, or leave both blank for the RISC5 choice.' },
  ),
  field('filmLiquid', 'household', 'Liquid film reference coefficient', 'cm/h', [
    b('household', 'filmLiquid', always),
  ]),
  field('sprayDropletDiameter', 'household', 'Sprinkler droplet diameter', 'mm', [
    b('household', 'sprayDropletDiameter'),
  ]),
  field('sprayFallTime', 'household', 'Sprinkler droplet fall time', 's', [
    b('household', 'sprayFallTime'),
  ]),
  field('sprinklerFlow', 'household', 'Sprinkler flow', 'L/min', [b('household', 'sprinklerFlow')]),
  field('applicationRate', 'household', 'Watering rate', 'mm/h', [
    b('household', 'applicationRate', always),
  ]),
  field('windSpeed', 'household', 'Wind speed', 'm/s', [b('household', 'windSpeed')]),
  field('mixingHeight', 'household', 'Mixing height', 'm', [b('household', 'mixingHeight')]),
  field('boxLength', 'household', 'Length of the area watered', 'm', [
    b('household', 'boxLength', unless('particulateMethod', 'box')),
  ]),
  field('boxWidth', 'household', 'Width of the area watered', 'm', [
    b('household', 'boxWidth', unless('particulateMethod', 'box')),
  ]),
  field('qOverC', 'household', 'Dispersion factor Q/C', 'g/(m2 s) per kg/m3', [
    b('household', 'qOverC', always),
  ]),
  field('pm10Flux', 'household', 'Dust (PM10) flux', 'g/(m2 s)', [
    b('household', 'pm10Flux', always),
  ]),

  // homegrown produce
  field('produceBulkDensity', 'produce', 'Garden soil dry bulk density', 'kg/L', [
    b('plantsEco', 'bulkDensity'),
  ]),
  field('produceWaterFilled', 'produce', 'Garden soil water-filled porosity', '', [
    b('plantsEco', 'waterFilledPorosity', isModernUptake),
  ]),
  field('produceFoc', 'produce', 'Garden soil organic carbon fraction', '', [
    b('plantsEco', 'foc'),
  ]),
  field('moistureFraction', 'produce', 'Moisture fraction of the fresh produce', '', [
    b('plantsEco', 'moistureFraction', unless('uptake', 'modern')),
  ]),
  field('transpiration', 'produce', 'Transpiration rate', 'L/d', [
    b('plantsEco', 'transpiration', isModernUptake),
  ]),
  field('conductance', 'produce', 'Leaf conductance', 'm/d', [
    b('plantsEco', 'conductance', isModernUptake),
  ]),
  field('leafArea', 'produce', 'Leaf area', 'm2', [b('plantsEco', 'leafArea', isModernUptake)]),
  field('plantMass', 'produce', 'Plant mass', 'kg', [b('plantsEco', 'plantMass', isModernUptake)]),
  field('kLeafAir', 'produce', 'Leaf-air partition coefficient', 'm3/kg', [
    b('plantsEco', 'kLeafAir', isModernUptake),
  ]),
  field('lossRate', 'produce', 'Loss rate by growth dilution and metabolism', '1/d', [
    b('plantsEco', 'lossRate', isModernUptake),
  ]),
  field('growthPeriod', 'produce', 'Growing period', 'd', [b('plantsEco', 'growthPeriod', always)]),
  field('tphThetaA', 'produce', 'Garden soil air-filled porosity, for TPH', '', [
    b('plantsEco', 'tphThetaA', always),
  ]),
];

function isRsl(form: Form): boolean {
  return form['showerMethod'] === 'rsl';
}
function isModernUptake(form: Form): boolean {
  return form['uptake'] === 'modern';
}

const CHEMICAL = 'A chemical value: step 3c fills it for each chemical from the database.';
const SOURCE = 'A source concentration: step 3b holds it for each chemical.';
const SOURCE_OR_RUN =
  'The source strength: step 3b holds it for each chemical, or the model before this one feeds it when step 3d runs.';
const TPH = 'The total petroleum hydrocarbons in soil: step 3b holds it for each chemical.';
const RUN = 'A run setting: step 3d sets it for every model at once.';
const LOADING = 'The source loading: the source duration of step 3d sets it.';
const UPSTREAM = 'Taken from the model before this one in the chain when step 3d runs.';
const EXPOSURE = 'An exposure factor of the receptor: step 4 sets it.';
const TARGET = 'A target: step 5 sets it.';

/** The site fields of each model that another step sets, with the reason in plain words. */
export const NON_VALUES: Readonly<Record<GuidedFormKey, Readonly<Record<string, string>>>> = {
  transport: {
    halfLifeYr: CHEMICAL,
    c0: SOURCE_OR_RUN,
    massRate: SOURCE_OR_RUN,
    pulseYr: LOADING,
    'steps[].start': LOADING,
    'steps[].end': LOADING,
    'steps[].factor': LOADING,
    timeYr: RUN,
  },
  vadose: { mu: CHEMICAL, srcF: SOURCE, srcFT: TPH, durationYr: RUN },
  saturated: { F: SOURCE, FT: TPH, horizonYr: RUN },
  vapor: {
    soilConc: SOURCE,
    tph: TPH,
    soilGas: SOURCE,
    cgw: SOURCE_OR_RUN,
    dvKw: CHEMICAL,
    dvMassRatio: CHEMICAL,
  },
  surfaceWater: { groundwaterConcentration: UPSTREAM, durationYr: RUN, solubility: CHEMICAL },
  household: { waterConcentration: UPSTREAM, soilConcentration: SOURCE },
  plantsEco: {
    soilConcentration: SOURCE,
    userBcf: CHEMICAL,
    tscf: CHEMICAL,
    'custom.abovegroundExposed.gPerKgDay': EXPOSURE,
    'custom.abovegroundExposed.loss': EXPOSURE,
    'custom.abovegroundExposed.homegrown': EXPOSURE,
    'custom.abovegroundProtected.gPerKgDay': EXPOSURE,
    'custom.abovegroundProtected.loss': EXPOSURE,
    'custom.abovegroundProtected.homegrown': EXPOSURE,
    'custom.root.gPerKgDay': EXPOSURE,
    'custom.root.loss': EXPOSURE,
    'custom.root.homegrown': EXPOSURE,
    tphTotal: TPH,
    tphTargetHi: TARGET,
  },
};

export type SoilTypeId = 'unsaturated' | 'saturated';

/** A soil type choice: the layers (or form) it fills, by the path of each object it fills. */
export interface SoilTypeControl {
  id: SoilTypeId;
  group: PropertyGroupId;
  places: readonly { model: GuidedFormKey; path: string }[];
}

export const SOIL_TYPES: readonly SoilTypeControl[] = [
  {
    id: 'unsaturated',
    group: 'unsaturated',
    places: [
      { model: 'vadose', path: 'source' },
      { model: 'vadose', path: 'above[]' },
      { model: 'vadose', path: 'below[]' },
      { model: 'vapor', path: 'layers[]' },
    ],
  },
  { id: 'saturated', group: 'saturatedSoil', places: [{ model: 'saturated', path: '' }] },
];

// templates

const SCREEN_DEFAULTS: Readonly<Record<GuidedFormKey, unknown>> = {
  transport: TRANSPORT,
  vadose: VADOSE,
  saturated: SATURATED,
  vapor: VAPOR,
  surfaceWater: SURFACE_WATER,
  household: HOUSEHOLD,
  plantsEco: PLANTS_ECO,
};

/**
 * A model's template before anyone edits it: the screen's default form without the fields a chemical or
 * a source concentration fills. The transport template takes its retardation from each chemical's Kd
 * (organic carbon fraction times the chemical's Koc), since one retardation factor cannot stand for
 * every chemical of the project.
 */
export function blankTemplate<K extends GuidedFormKey>(model: K): NonNullable<GuidedForms[K]> {
  const t = structuredClone(SCREEN_DEFAULTS[model]) as Form;
  for (const k of TEMPLATE_STRIPPED[model]) delete t[k];
  if (model === 'transport') t['retardMode'] = 'kd';
  return t as unknown as NonNullable<GuidedForms[K]>;
}

const templateOf = (g: GuidedState, model: GuidedFormKey): Form =>
  (g.forms[model] as unknown as Form | undefined) ?? (blankTemplate(model) as unknown as Form);

/**
 * The models step 3a describes: the chain's models when step 2 has no problem. The produce model is
 * left out for ecological receptors, whose screening compares benchmarks and reads no site value here.
 */
export function activeModels(g: GuidedState): GuidedFormKey[] {
  return activeOf(chain(g.site));
}

function activeOf(c: Chain): GuidedFormKey[] {
  if (c.problems.length > 0) return [];
  const produce = c.paths.some((p) => p.path === 'produce');
  return c.models.filter((m) => m !== 'plantsEco' || produce);
}

/**
 * The template as the Run will read it: the choices the earlier steps make, so a field's `when` sees
 * them (the indoor air method from step 2, the stream linked to the transport run, household water
 * from the well).
 */
function runView(model: GuidedFormKey, form: Form, site: GuidedSite, c: Chain): Form {
  if (model === 'vapor') {
    const method = site.indoorModel === 'oxygenLimited' ? 'devaull' : site.indoorModel;
    const from = c.paths.find((p) => p.path === 'building')?.source;
    const source =
      from === 'soilGas' ? 'soilGas' : from === 'groundwater' ? 'groundwater' : form['source'];
    return { ...form, method, source };
  }
  if (model === 'surfaceWater') return { ...form, linked: true };
  if (model === 'household') {
    return { ...form, showerWaterSource: 'well', irrigationWaterSource: 'well' };
  }
  return form;
}

// paths through a form

const isObject = (v: unknown): v is Form =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

interface Place {
  value: unknown;
  parent: Form;
  base: unknown;
  /** The list entry the place sits in, when the key goes through a list. */
  item: { index: number; item: Form } | null;
}

/** Every place a key reaches in a form, with the blank start's value at the same place. */
function placesOf(form: Form, base: Form, key: string): Place[] {
  let hits: { cur: unknown; parent: Form; base: unknown; item: Place['item'] }[] = [
    { cur: form, parent: form, base, item: null },
  ];
  for (const seg of key.split('.')) {
    const next: typeof hits = [];
    for (const h of hits) {
      if (seg.endsWith('[]')) {
        const name = seg.slice(0, -2);
        const list = isObject(h.cur) ? h.cur[name] : undefined;
        const baseList = isObject(h.base) ? h.base[name] : undefined;
        if (!Array.isArray(list)) continue;
        list.forEach((entry, index) => {
          if (!isObject(entry)) return;
          const bse = Array.isArray(baseList) ? baseList[index] : undefined;
          next.push({ cur: entry, parent: entry, base: bse, item: { index, item: entry } });
        });
      } else if (isObject(h.cur)) {
        next.push({
          cur: h.cur[seg],
          parent: h.cur,
          base: isObject(h.base) ? h.base[seg] : undefined,
          item: h.item,
        });
      }
    }
    hits = next;
  }
  return hits.map((h) => ({ value: h.cur, parent: h.parent, base: h.base, item: h.item }));
}

/** The form with `fn` applied to every object the path reaches (`only`: one entry of a list). */
function updateAt(obj: Form, segs: readonly string[], fn: (o: Form) => Form, only?: number): Form {
  if (segs.length === 0) return fn(obj);
  const [seg, ...rest] = segs as [string, ...string[]];
  if (seg.endsWith('[]')) {
    const name = seg.slice(0, -2);
    const list = obj[name];
    if (!Array.isArray(list)) return obj;
    return {
      ...obj,
      [name]: list.map((e: unknown, i) =>
        isObject(e) && (only === undefined || i === only) ? updateAt(e, rest, fn) : e,
      ),
    };
  }
  const child = obj[seg];
  if (!isObject(child)) return obj;
  return { ...obj, [seg]: updateAt(child, rest, fn, only) };
}

const splitPath = (path: string): string[] => (path === '' ? [] : path.split('.'));

function writeKey(form: Form, key: string, value: string, only?: number): Form {
  const segs = key.split('.');
  const last = segs.pop()!;
  return updateAt(form, segs, (o) => ({ ...o, [last]: value }), only);
}

// views

const SITE_INDEX = new Map<string, SiteField>();
for (const [model, fields] of Object.entries(SITE_FIELDS)) {
  for (const f of fields ?? []) SITE_INDEX.set(`${model}:${f.key}`, f);
}
const siteField = (bd: Binding): SiteField | undefined => SITE_INDEX.get(`${bd.model}:${bd.key}`);

const isOptional = (bd: Binding, view: Form): boolean =>
  bd.optional === undefined ? false : bd.optional === true ? true : bd.optional(view);

export interface PropertyItemView {
  index: number;
  label: string;
  value: string;
  tag: Provenance;
}

export interface PropertyFieldView {
  field: PropertyField;
  /** The value shown: the first place in use. */
  value: string;
  /** True when the places the field stands for hold different values. */
  mixed: boolean;
  tag: Provenance;
  needed: boolean;
  /** One entry per list item for a per-item field; null otherwise. */
  items: PropertyItemView[] | null;
}

export interface SoilTypeView {
  id: SoilTypeId;
  /** The soil type every filled layer has, `custom` for none, or '' when the layers differ. */
  value: TextureChoice | '';
}

export interface PropertyGroupView {
  id: PropertyGroupId;
  label: string;
  intro: string;
  soilType: SoilTypeView | null;
  fields: PropertyFieldView[];
}

export interface PropertyView {
  groups: PropertyGroupView[];
  /** How many values a chosen model needs and nobody entered (each layer counts). */
  needed: number;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

interface Ctx {
  active: Set<GuidedFormKey>;
  forms: Map<GuidedFormKey, Form>;
  views: Map<GuidedFormKey, Form>;
  blanks: Map<GuidedFormKey, Form>;
}

function contextOf(g: GuidedState): Ctx {
  const c = chain(g.site);
  const active = activeOf(c);
  const forms = new Map<GuidedFormKey, Form>();
  const views = new Map<GuidedFormKey, Form>();
  const blanks = new Map<GuidedFormKey, Form>();
  for (const m of active) {
    const f = templateOf(g, m);
    forms.set(m, f);
    views.set(m, runView(m, f, g.site, c));
    blanks.set(m, blankTemplate(m) as unknown as Form);
  }
  return { active: new Set(active), forms, views, blanks };
}

interface TaggedPlace extends Place {
  tag: Provenance;
}

function fieldView(f: PropertyField, ctx: Ctx): PropertyFieldView | null {
  const tagged: TaggedPlace[] = [];
  let used = false;
  for (const bd of f.bindings) {
    if (!ctx.active.has(bd.model)) continue;
    const view = ctx.views.get(bd.model)!;
    const site = siteField(bd);
    if (site?.when !== undefined && !site.when(view)) continue;
    if (bd.when !== undefined && !bd.when(view)) continue;
    used = true;
    const required = !isOptional(bd, view);
    const name = bd.key.split('.').pop()!;
    for (const p of placesOf(ctx.forms.get(bd.model)!, ctx.blanks.get(bd.model)!, bd.key)) {
      const preset =
        site?.fromTexture === true ? texturePreset(bd.model, p.parent, name) : undefined;
      tagged.push({ ...p, tag: provenanceOf({ value: p.value, base: p.base, preset, required }) });
    }
  }
  if (!used) return null;
  const tags = tagged.map((p) => p.tag);
  const tag = strongest(tags);
  if (f.perItem === true) {
    const bd = f.bindings[0]!;
    const site = siteField(bd);
    const items = tagged.map((p, i) => {
      const item = p.item ?? { index: i, item: p.parent };
      const label =
        site === undefined
          ? `${f.label}, ${i + 1}`
          : typeof site.label === 'function'
            ? site.label(item)
            : site.label;
      return { index: item.index, label, value: text(p.value), tag: p.tag };
    });
    return {
      field: f,
      value: items[0]?.value ?? '',
      mixed: false,
      tag,
      needed: tags.includes('needed'),
      items,
    };
  }
  const values = tagged.map((p) => text(p.value));
  const first = values[0] ?? '';
  return {
    field: f,
    value: first,
    mixed: values.some((v) => !sameNumber(v, first)),
    tag,
    needed: tags.includes('needed'),
    items: null,
  };
}

/** The objects a soil type fills, among the chosen models. */
function soilObjects(s: SoilTypeControl, ctx: Ctx): Form[] {
  const out: Form[] = [];
  for (const p of s.places) {
    const form = ctx.forms.get(p.model);
    if (form === undefined) continue;
    if (p.path === '') out.push(form);
    else for (const pl of placesOf(form, {}, p.path)) if (isObject(pl.value)) out.push(pl.value);
  }
  return out;
}

export function propertyView(g: GuidedState): PropertyView {
  const ctx = contextOf(g);
  const groups: PropertyGroupView[] = [];
  let needed = 0;
  for (const group of PROPERTY_GROUPS) {
    const fields: PropertyFieldView[] = [];
    for (const f of PROPERTY_FIELDS) {
      if (f.group !== group.id) continue;
      const v = fieldView(f, ctx);
      if (v === null) continue;
      fields.push(v);
      needed +=
        v.items === null ? (v.needed ? 1 : 0) : v.items.filter((i) => i.tag === 'needed').length;
    }
    let soilType: SoilTypeView | null = null;
    const control = SOIL_TYPES.find((s) => s.group === group.id);
    if (control !== undefined) {
      const objs = soilObjects(control, ctx);
      if (objs.length > 0) {
        const textures = objs.map((o) => String(o['texture'] ?? 'custom'));
        const same = textures.every((t) => t === textures[0]);
        soilType = { id: control.id, value: same ? (textures[0] as TextureChoice) : '' };
      }
    }
    if (fields.length === 0 && soilType === null) continue;
    groups.push({ id: group.id, label: group.label, intro: group.intro, soilType, fields });
  }
  return { groups, needed };
}

/** True when step 2 is sound and no value a chosen model needs is blank. */
export function propertiesComplete(g: GuidedState): boolean {
  if (chain(g.site).problems.length > 0) return false;
  return propertyView(g).needed === 0;
}

function withForms(g: GuidedState, forms: Map<GuidedFormKey, Form>): GuidedState {
  const next: GuidedForms = { ...g.forms };
  for (const [m, f] of forms) (next as Record<string, unknown>)[m] = f;
  return { ...g, forms: next };
}

/**
 * Sets a field: every form key it stands for in the chosen models' templates, every layer of a list
 * (or, for a per-item field, the entry `index`). A model with no saved template starts from its blank.
 */
export function setProperty(
  g: GuidedState,
  fieldId: string,
  value: string,
  index?: number,
): GuidedState {
  const f = PROPERTY_FIELDS.find((x) => x.id === fieldId);
  if (f === undefined) return g;
  const active = new Set(activeModels(g));
  const changed = new Map<GuidedFormKey, Form>();
  for (const bd of f.bindings) {
    if (!active.has(bd.model)) continue;
    const form = changed.get(bd.model) ?? templateOf(g, bd.model);
    changed.set(bd.model, writeKey(form, bd.key, value, f.perItem === true ? index : undefined));
  }
  return changed.size === 0 ? g : withForms(g, changed);
}

/** Fills every layer of a soil type control with the soil type's values (`custom` keeps the values). */
export function setSoilType(g: GuidedState, id: SoilTypeId, texture: TextureChoice): GuidedState {
  const s = SOIL_TYPES.find((x) => x.id === id);
  if (s === undefined) return g;
  const active = new Set(activeModels(g));
  const changed = new Map<GuidedFormKey, Form>();
  for (const p of s.places) {
    if (!active.has(p.model)) continue;
    const form = changed.get(p.model) ?? templateOf(g, p.model);
    const fill = (o: Form): Form =>
      (p.model === 'vadose'
        ? vadoseTexture(o as never, texture)
        : p.model === 'vapor'
          ? vaporTexture(o as never, texture)
          : saturatedTexture(o as never, texture)) as unknown as Form;
    changed.set(p.model, updateAt(form, splitPath(p.path), fill));
  }
  return changed.size === 0 ? g : withForms(g, changed);
}
