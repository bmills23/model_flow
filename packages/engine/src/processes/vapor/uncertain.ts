import { pathInput, type UncertainInput } from '../../registry/index.js';
import type { LegacyJeInput } from './legacyJe.js';
import type { DominantLayerInput } from './dominantLayer.js';
import type { EpaJeInput } from './epaJe.js';
import type { DevaullInput } from './devaull.js';
import type { AttenuationFactorInput } from './attenuationFactor.js';
import type { PviInput } from './pviScreen.js';
import type { JuryInput } from './jury.js';

/**
 * Uncertain-input declarations of the vapor methods (uncertainty note, ruling 2, and the PVIScreen
 * sampling M6 deferred to M10). Ids are `vapor.<name>`. An input of the other variant of a union
 * (source kind, soil gas flow specification, oxygen mode) or of a layer the base input does not carry
 * reads NaN and refuses a set. Molar masses, the foundation type and the user flags are not declared.
 */

export type Cat = 'site' | 'transport' | 'chemical';
type Path = readonly (string | number)[];
type Bounds = readonly [number, number];

const NN: Bounds = [0, Number.POSITIVE_INFINITY];
const FRAC: Bounds = [0, 1];

/** One declaration: id suffix, path, label, unit, category, bounds, guard. */
export type Row<I> = readonly [
  id: string,
  path: Path,
  label: string,
  unit: string,
  category: Cat,
  bounds?: Bounds | undefined,
  when?: ((input: I) => boolean) | undefined,
];

export function declareRows<I>(prefix: string, rows: readonly Row<I>[]): UncertainInput<I>[] {
  return rows.map(([id, path, label, unit, category, bounds, when]) =>
    pathInput<I>({
      id: `${prefix}.${id}`,
      label,
      unit,
      category,
      bounds: bounds ?? NN,
      path,
      ...(when !== undefined ? { when } : {}),
    }),
  );
}

function at(root: unknown, path: Path): unknown {
  let cur: unknown = root;
  for (const k of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

/** Guard: the object at `path` has the string `field` equal to one of `values`. */
export function fieldIs<I>(path: Path, field: string, ...values: string[]): (input: I) => boolean {
  return (i) => {
    const o = at(i, path) as Record<string, unknown> | undefined;
    return o !== undefined && values.includes(o[field] as string);
  };
}

/** Guard: the object at `path` exists. */
export function exists<I>(path: Path): (input: I) => boolean {
  return (i) => at(i, path) !== undefined;
}

/** Guard: the object at `path` has the own key `key`. */
export function hasKey<I>(path: Path, key: string): (input: I) => boolean {
  return (i) => {
    const o = at(i, path);
    return o !== null && typeof o === 'object' && key in (o as object);
  };
}

/** Maximum layers (or strata) declared for the methods that take a list. */
export const VAPOR_DECLARED_LAYERS = 4;

export function chemicalRows<I>(path: Path): Row<I>[] {
  return [
    ['chemical.Da', [...path, 'Da'], 'Diffusion coefficient in air', 'm^2/s', 'chemical'],
    ['chemical.Dw', [...path, 'Dw'], 'Diffusion coefficient in water', 'm^2/s', 'chemical'],
    ['chemical.H', [...path, 'H'], "Dimensionless Henry's constant", '1', 'chemical'],
  ];
}

/** Thickness, porosity and moisture of a soil layer at `path`. */
export function layerRows<I>(
  id: string,
  label: string,
  path: Path,
  when?: (input: I) => boolean,
): Row<I>[] {
  return [
    [`${id}.thickness`, [...path, 'thickness'], `${label} thickness`, 'm', 'site', NN, when],
    [`${id}.porosity`, [...path, 'porosity'], `${label} total porosity`, '1', 'site', FRAC, when],
    [
      `${id}.moisture`,
      [...path, 'moisture'],
      `${label} water-filled porosity`,
      '1',
      'site',
      FRAC,
      when,
    ],
  ];
}

/** The source of the three shared source kinds (soil, soil gas, groundwater) at `path`. */
export function sourceRows<I>(path: Path): Row<I>[] {
  const soil = fieldIs<I>(path, 'kind', 'soil');
  const soilOrWater = fieldIs<I>(path, 'kind', 'soil', 'groundwater');
  const gas = fieldIs<I>(path, 'kind', 'soilGas');
  const water = fieldIs<I>(path, 'kind', 'groundwater');
  return [
    ['source.F', [...path, 'F'], 'Soil concentration', 'kg/kg', 'site', FRAC, soil],
    ['source.rhoB', [...path, 'rhoB'], 'Source soil bulk density', 'kg/m^3', 'site', NN, soil],
    [
      'source.kd',
      [...path, 'kd'],
      'Source soil partition coefficient',
      'm^3/kg',
      'chemical',
      NN,
      soil,
    ],
    [
      'source.theta',
      [...path, 'theta'],
      'Source soil water-filled porosity',
      '1',
      'site',
      FRAC,
      soil,
    ],
    [
      'source.thetaA',
      [...path, 'thetaA'],
      'Source soil air-filled porosity',
      '1',
      'site',
      FRAC,
      soil,
    ],
    [
      'source.H',
      [...path, 'H'],
      "Source dimensionless Henry's constant",
      '1',
      'chemical',
      NN,
      soilOrWater,
    ],
    [
      'source.S',
      [...path, 'S'],
      'Source aqueous solubility',
      'kg/m^3',
      'chemical',
      NN,
      soilOrWater,
    ],
    ['source.csg', [...path, 'csg'], 'Soil gas concentration', 'kg/m^3', 'site', NN, gas],
    ['source.cgw', [...path, 'cgw'], 'Groundwater concentration', 'kg/m^3', 'site', NN, water],
    ['source.x', [...path, 'x'], 'Mole fraction in the mixture', '1', 'chemical', FRAC, water],
  ];
}

/** The legacy building (volume, exchange, floor, cracks, foundation, soil gas flow) at `path`. */
export function legacyBuildingRows<I>(path: Path, when?: (input: I) => boolean): Row<I>[] {
  const flow = [...path, 'soilGas'];
  const q = (key: string) =>
    when === undefined ? hasKey<I>(flow, key) : (i: I) => when(i) && hasKey<I>(flow, key)(i);
  return [
    ['building.volume', [...path, 'volume'], 'Enclosed space volume', 'm^3', 'site', NN, when],
    [
      'building.airExchangeRate',
      [...path, 'airExchangeRate'],
      'Air exchange rate',
      '1/s',
      'site',
      NN,
      when,
    ],
    [
      'building.floorArea',
      [...path, 'floorArea'],
      'Floor area in contact with soil',
      'm^2',
      'site',
      NN,
      when,
    ],
    [
      'building.crackFraction',
      [...path, 'crackFraction'],
      'Crack fraction',
      '1',
      'site',
      FRAC,
      when,
    ],
    ...layerRows<I>('building.foundation', 'Foundation', [...path, 'foundation'], when),
    [
      'building.Qsoil',
      [...flow, 'Qsoil'],
      'Soil gas flow into the building',
      'm^3/s',
      'transport',
      NN,
      q('Qsoil'),
    ],
    [
      'building.dP',
      [...flow, 'dP'],
      'Indoor-outdoor pressure difference',
      'Pa',
      'site',
      [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
      q('dP'),
    ],
    [
      'building.Xcrack',
      [...flow, 'Xcrack'],
      'Floor-wall seam length',
      'm',
      'site',
      NN,
      q('Xcrack'),
    ],
    [
      'building.Zcrack',
      [...flow, 'Zcrack'],
      'Depth of the cracks below grade',
      'm',
      'site',
      NN,
      q('Zcrack'),
    ],
    ['building.kv', [...flow, 'kv'], 'Soil vapor permeability', 'm^2', 'transport', NN, q('kv')],
    [
      'building.hydraulicConductivity',
      [...flow, 'hydraulicConductivity'],
      'Hydraulic conductivity around the foundation',
      'm/s',
      'transport',
      NN,
      q('hydraulicConductivity'),
    ],
  ];
}

/** Declarations of `vapor.je-1991`. */
export function legacyJeUncertainInputs(): UncertainInput<LegacyJeInput>[] {
  type I = LegacyJeInput;
  const rows: Row<I>[] = [
    ...chemicalRows<I>(['chemical']),
    ...layerRows<I>(
      'capillaryFringe',
      'Capillary fringe',
      ['capillaryFringe'],
      exists(['capillaryFringe']),
    ),
  ];
  for (let k = 0; k < VAPOR_DECLARED_LAYERS; k++) {
    rows.push(...layerRows<I>(`layer${k}`, `Layer ${k + 1}`, ['layers', k]));
  }
  rows.push(...legacyBuildingRows<I>(['building']), ...sourceRows<I>(['source']));
  return declareRows<I>('vapor', rows);
}

/** Declarations of `vapor.dominant-layer-1998`. */
export function dominantLayerUncertainInputs(): UncertainInput<DominantLayerInput>[] {
  type I = DominantLayerInput;
  const indoor = fieldIs<I>(['receptor'], 'kind', 'indoor');
  const rows: Row<I>[] = [
    ...chemicalRows<I>(['chemical']),
    ...layerRows<I>('layer1', 'Layer 1', ['layer1']),
    ...layerRows<I>('layer2', 'Degrading layer', ['layer2']),
    ['layer2.rate', ['layer2', 'rate'], 'Degrading layer first-order rate', '1/s', 'chemical'],
    ...layerRows<I>('layer3', 'Layer 3', ['layer3']),
    ...legacyBuildingRows<I>(['receptor', 'building'], indoor),
    ...sourceRows<I>(['source']),
  ];
  return declareRows<I>('vapor', rows);
}

/** Declarations of `vapor.je-epa`. */
export function epaJeUncertainInputs(): UncertainInput<EpaJeInput>[] {
  type I = EpaJeInput;
  const soil = fieldIs<I>(['source'], 'kind', 'soil');
  const gas = fieldIs<I>(['source'], 'kind', 'soilGas');
  const water = fieldIs<I>(['source'], 'kind', 'groundwater');
  const b = ['building'];
  const flow = ['building', 'soilGas'];
  const rows: Row<I>[] = [
    ['chemical.Da', ['chemical', 'Da'], 'Diffusion coefficient in air', 'm^2/s', 'chemical'],
    ['chemical.Dw', ['chemical', 'Dw'], 'Diffusion coefficient in water', 'm^2/s', 'chemical'],
    [
      'chemical.henryAtm',
      ['chemical', 'henryAtm'],
      "Henry's constant at 25 deg C",
      'atm m^3/mol',
      'chemical',
    ],
    [
      'chemical.koc',
      ['chemical', 'koc'],
      'Organic carbon partition coefficient',
      'm^3/kg',
      'chemical',
    ],
    ['chemical.S', ['chemical', 'S'], 'Aqueous solubility', 'kg/m^3', 'chemical'],
    ['temperature', ['temperature'], 'Soil or groundwater temperature', 'K', 'site'],
    ['floorDepth', ['floorDepth'], 'Depth to the bottom of the enclosed space floor', 'm', 'site'],
  ];
  for (let k = 0; k < VAPOR_DECLARED_LAYERS; k++) {
    const p = ['strata', k];
    const id = `stratum${k}`;
    const label = `Stratum ${k + 1}`;
    rows.push(
      ...layerRows<I>(id, label, p),
      [`${id}.bulkDensity`, [...p, 'bulkDensity'], `${label} dry bulk density`, 'kg/m^3', 'site'],
      [`${id}.foc`, [...p, 'foc'], `${label} organic carbon fraction`, '1', 'site', FRAC],
      [
        `${id}.saturatedConductivity`,
        [...p, 'saturatedConductivity'],
        `${label} saturated hydraulic conductivity`,
        'm/s',
        'site',
      ],
      [
        `${id}.residualMoisture`,
        [...p, 'residualMoisture'],
        `${label} residual water content`,
        '1',
        'site',
        FRAC,
      ],
      [`${id}.vgM`, [...p, 'vgM'], `${label} van Genuchten m`, '1', 'site', FRAC],
    );
  }
  rows.push(
    ['building.floorLength', [...b, 'floorLength'], 'Floor length', 'm', 'site'],
    ['building.floorWidth', [...b, 'floorWidth'], 'Floor width', 'm', 'site'],
    [
      'building.depthBelowGrade',
      [...b, 'depthBelowGrade'],
      'Depth below grade to the base of the foundation',
      'm',
      'site',
    ],
    ['building.mixingHeight', [...b, 'mixingHeight'], 'Enclosed space mixing height', 'm', 'site'],
    ['building.airExchangeRate', [...b, 'airExchangeRate'], 'Air exchange rate', '1/s', 'site'],
    [
      'building.foundationThickness',
      [...b, 'foundationThickness'],
      'Foundation thickness',
      'm',
      'site',
    ],
    ['building.crackFraction', [...b, 'crackFraction'], 'Crack fraction', '1', 'site', FRAC],
    ['building.crackWidth', [...b, 'crackWidth'], 'Crack width', 'm', 'site'],
    [
      'building.Qsoil',
      [...flow, 'Qsoil'],
      'Soil gas flow into the building',
      'm^3/s',
      'transport',
      NN,
      hasKey<I>(flow, 'Qsoil'),
    ],
    [
      'building.ratio',
      [...flow, 'ratio'],
      'Ratio of soil gas flow to building ventilation',
      '1',
      'transport',
      NN,
      hasKey<I>(flow, 'ratio'),
    ],
    [
      'building.dP',
      [...flow, 'dP'],
      'Indoor-outdoor pressure difference',
      'Pa',
      'site',
      [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
      hasKey<I>(flow, 'dP'),
    ],
    [
      'building.kv',
      [...flow, 'kv'],
      'Soil vapor permeability',
      'm^2',
      'transport',
      NN,
      hasKey<I>(flow, 'kv'),
    ],
    [
      'building.Xcrack',
      [...flow, 'Xcrack'],
      'Floor-wall seam length',
      'm',
      'site',
      NN,
      hasKey<I>(flow, 'Xcrack'),
    ],
    ['source.F', ['source', 'F'], 'Soil concentration', 'kg/kg', 'site', FRAC, soil],
    [
      'source.bottomDepth',
      ['source', 'bottomDepth'],
      'Depth to the bottom of the contamination',
      'm',
      'site',
      NN,
      soil,
    ],
    ['source.csg', ['source', 'csg'], 'Soil gas concentration', 'kg/m^3', 'site', NN, gas],
    ['source.cgw', ['source', 'cgw'], 'Groundwater concentration', 'kg/m^3', 'site', NN, water],
    ['source.x', ['source', 'x'], 'Mole fraction in the mixture', '1', 'chemical', FRAC, water],
    [
      'finiteSource.exposureDuration',
      ['finiteSource', 'exposureDuration'],
      'Exposure interval of the finite source',
      's',
      'site',
      NN,
      exists<I>(['finiteSource']),
    ],
  );
  return declareRows<I>('vapor', rows);
}

/** Declarations of `vapor.devaull-2007`. */
export function devaullUncertainInputs(): UncertainInput<DevaullInput>[] {
  type I = DevaullInput;
  const entered = fieldIs<I>(['oxygen'], 'mode', 'entered');
  const modeled = fieldIs<I>(['oxygen'], 'mode', 'fastReaction', 'coupled');
  const ox = (key: string, label: string, unit: string, bounds?: Bounds): Row<I> => [
    `oxygen.${key}`,
    ['oxygen', key],
    label,
    unit,
    'chemical',
    bounds,
    modeled,
  ];
  const rows: Row<I>[] = [
    ...chemicalRows<I>(['chemical']),
    ...layerRows<I>('layer', 'Column', ['layer']),
    [
      'degradationRate',
      ['degradationRate'],
      'Water-phase first-order degradation rate',
      '1/s',
      'chemical',
    ],
    ['foundation.h', ['foundation', 'h'], 'Foundation mass transfer coefficient', 'm/s', 'site'],
    [
      'foundation.soilGasVelocity',
      ['foundation', 'soilGasVelocity'],
      'Soil gas flow per unit foundation area',
      'm/s',
      'transport',
    ],
    [
      'building.mixingHeight',
      ['building', 'mixingHeight'],
      'Enclosed space mixing height',
      'm',
      'site',
    ],
    [
      'building.airExchangeRate',
      ['building', 'airExchangeRate'],
      'Air exchange rate',
      '1/s',
      'site',
    ],
    ...sourceRows<I>(['source']),
    [
      'oxygen.aerobicDepth',
      ['oxygen', 'aerobicDepth'],
      'Aerobic layer thickness',
      'm',
      'site',
      NN,
      entered,
    ],
    ox('Da', 'Oxygen diffusion coefficient in air', 'm^2/s'),
    ox('Dw', 'Oxygen diffusion coefficient in water', 'm^2/s'),
    ox('H', "Oxygen dimensionless Henry's constant", '1'),
    ox('atmosphericConcentration', 'Oxygen concentration at the base of the foundation', 'kg/m^3'),
    ox('massRatio', 'Oxygen consumed per mass of hydrocarbon degraded', '1'),
    ox('respiration', 'Baseline respiration rate', 'kg/(m^3 s)'),
    ox('totalHydrocarbonVapor', 'Total hydrocarbon vapor concentration at the source', 'kg/m^3'),
  ];
  return declareRows<I>('vapor', rows);
}

/** Declarations of `vapor.attenuation-factor-2015`. */
export function attenuationUncertainInputs(): UncertainInput<AttenuationFactorInput>[] {
  type I = AttenuationFactorInput;
  const rows: Row<I>[] = [
    ['concentration', ['concentration'], 'Concentration in the medium', 'kg/m^3', 'site'],
    ['H', ['H'], "Dimensionless Henry's constant at the groundwater temperature", '1', 'chemical'],
    [
      'depthBelowFoundation',
      ['depthBelowFoundation'],
      'Depth of the source below the foundation',
      'm',
      'site',
    ],
  ];
  return declareRows<I>('vapor', rows);
}

/** Declarations of `vapor.pvi-screen-2015` (the PVIScreen sampling M6 deferred). */
export function pviUncertainInputs(): UncertainInput<PviInput>[] {
  type I = PviInput;
  const rows: Row<I>[] = [
    [
      'separation',
      ['separation'],
      'Vertical separation to clean, biologically active soil',
      'm',
      'site',
    ],
    [
      'smallestBuildingDimension',
      ['smallestBuildingDimension'],
      'Shortest side of the building footprint',
      'm',
      'site',
    ],
    [
      'ethanolFraction',
      ['ethanolFraction'],
      'Ethanol volume fraction of the fuel',
      '1',
      'site',
      FRAC,
    ],
    ['soilBenzene', ['soilBenzene'], 'Soil benzene concentration', 'kg/kg', 'site', FRAC],
    ['soilTph', ['soilTph'], 'Soil TPH concentration', 'kg/kg', 'site', FRAC],
    [
      'groundwaterBenzene',
      ['groundwaterBenzene'],
      'Groundwater benzene concentration',
      'kg/m^3',
      'site',
    ],
    ['groundwaterTph', ['groundwaterTph'], 'Groundwater TPH concentration', 'kg/m^3', 'site'],
  ];
  return declareRows<I>('vapor', rows);
}

/** Soil rows shared by the Jury method (prefix `vapor`) and the SSG volatilization factor. */
export function jurySoilRows<I>(path: Path): Row<I>[] {
  return [
    ['soil.porosity', [...path, 'porosity'], 'Total porosity', '1', 'site', FRAC],
    ['soil.moisture', [...path, 'moisture'], 'Water-filled porosity', '1', 'site', FRAC],
    ['soil.bulkDensity', [...path, 'bulkDensity'], 'Dry bulk density', 'kg/m^3', 'site'],
    ['soil.kd', [...path, 'kd'], 'Soil-water partition coefficient', 'm^3/kg', 'chemical'],
  ];
}

/** Declarations of `vapor.jury-bam`. */
export function juryUncertainInputs(): UncertainInput<JuryInput>[] {
  type I = JuryInput;
  const rows: Row<I>[] = [
    ...chemicalRows<I>(['chemical']),
    ...jurySoilRows<I>(['soil']),
    ['coverThickness', ['coverThickness'], 'Clean cover thickness', 'm', 'site'],
    ['layerThickness', ['layerThickness'], 'Contaminated layer thickness', 'm', 'site'],
    [
      'initialConcentration',
      ['initialConcentration'],
      'Initial total concentration',
      'kg/m^3',
      'site',
    ],
    [
      'boundaryLayerThickness',
      ['boundaryLayerThickness'],
      'Stagnant air boundary layer thickness',
      'm',
      'transport',
    ],
    ['decayRate', ['decayRate'], 'First-order degradation rate', '1/s', 'chemical'],
  ];
  return declareRows<I>('vapor', rows);
}
