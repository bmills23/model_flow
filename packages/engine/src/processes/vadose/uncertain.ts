import { pathInput, type UncertainInput } from '../../registry/index.js';

/**
 * Uncertain-input declarations of the vadose methods (uncertainty note, ruling 2). Ids are
 * `vadose.<path>`; an input of a layer or optional block the base input does not carry reads NaN and
 * refuses a set (see `pathInput`). Molar mass is a constant of the chemical, not declared.
 */

const NON_NEGATIVE = [0, Number.POSITIVE_INFINITY] as const;
const FRACTION = [0, 1] as const;
const VG_N = [1, Number.POSITIVE_INFINITY] as const;

type Soil = readonly [key: string, label: string, unit: string, bounds: readonly [number, number]];

const SOIL_FIELDS: readonly Soil[] = [
  ['thetaS', 'saturated water content', '1', FRACTION],
  ['thetaR', 'residual water content', '1', FRACTION],
  ['n', 'van Genuchten n', '1', VG_N],
  ['Ks', 'saturated hydraulic conductivity', 'm/s', NON_NEGATIVE],
  ['rhoB', 'dry bulk density', 'kg/m^3', NON_NEGATIVE],
  ['foc', 'organic carbon fraction', '1', FRACTION],
];

/** The soil properties (and optionally the thickness) of one layer at `path`. */
export function vadoseLayerInputs<I>(
  idPrefix: string,
  labelPrefix: string,
  path: readonly (string | number)[],
  thickness: boolean,
  when?: (input: I) => boolean,
): UncertainInput<I>[] {
  const out: UncertainInput<I>[] = [];
  const base = { category: 'site' as const, ...(when !== undefined ? { when } : {}) };
  if (thickness) {
    out.push(
      pathInput<I>({
        ...base,
        id: `${idPrefix}.thickness`,
        label: `${labelPrefix} thickness`,
        unit: 'm',
        bounds: NON_NEGATIVE,
        path: [...path, 'thickness'],
      }),
    );
  }
  for (const [key, label, unit, bounds] of SOIL_FIELDS) {
    out.push(
      pathInput<I>({
        ...base,
        id: `${idPrefix}.${key}`,
        label: `${labelPrefix} ${label}`,
        unit,
        bounds,
        path: [...path, key],
      }),
    );
  }
  return out;
}

/** Chemical properties shared by the legacy and modern vadose inputs (path `chemical`). */
export function vadoseChemicalInputs<I>(): UncertainInput<I>[] {
  const c = (
    key: string,
    label: string,
    unit: string,
    bounds: readonly [number, number] = NON_NEGATIVE,
  ): UncertainInput<I> =>
    pathInput<I>({
      id: `vadose.chemical.${key}`,
      label,
      unit,
      category: 'chemical',
      bounds,
      path: ['chemical', key],
    });
  return [
    c('Koc', 'Organic carbon partition coefficient', 'm^3/kg'),
    c('H', "Dimensionless Henry's constant", '1'),
    c('S', 'Aqueous solubility', 'kg/m^3'),
    c('Da', 'Diffusion coefficient in air', 'm^2/s'),
    c('Dw', 'Diffusion coefficient in water', 'm^2/s'),
    c('mu', 'Dissolved-phase decay rate below the source', '1/s'),
  ];
}

function sourceInputs<I>(): UncertainInput<I>[] {
  const s = (
    key: string,
    label: string,
    unit: string,
    category: 'site' | 'chemical',
    bounds: readonly [number, number] = NON_NEGATIVE,
  ): UncertainInput<I> =>
    pathInput<I>({
      id: `vadose.source.${key}`,
      label: `Source ${label}`,
      unit,
      category,
      bounds,
      path: ['source', key],
    });
  return [
    s('F', 'chemical mass fraction in soil', 'kg/kg', 'site', FRACTION),
    s('length', 'plan length', 'm', 'site'),
    s('width', 'plan width', 'm', 'site'),
    s('decayRate', 'decay rate', '1/s', 'chemical'),
  ];
}

const alphaL = <I>(): UncertainInput<I> =>
  pathInput<I>({
    id: 'vadose.alphaL',
    label: 'Longitudinal dispersivity',
    unit: 'm',
    category: 'transport',
    bounds: NON_NEGATIVE,
    path: ['alphaL'],
  });

/** Declarations of `vadose.vadsat`. */
export function vadsatUncertainInputs<
  I extends { lens?: unknown; alphaL?: number; depthToSource: number },
>(): UncertainInput<I>[] {
  return [
    pathInput<I>({
      id: 'vadose.infiltration',
      label: 'Infiltration (Darcy flux)',
      unit: 'm/s',
      category: 'site',
      bounds: NON_NEGATIVE,
      path: ['q'],
    }),
    pathInput<I>({
      id: 'vadose.depthToSource',
      label: 'Depth to the top of the source',
      unit: 'm',
      category: 'site',
      bounds: NON_NEGATIVE,
      path: ['depthToSource'],
    }),
    ...vadoseLayerInputs<I>('vadose.above', 'Soil above the source', ['above'], false),
    ...vadoseLayerInputs<I>('vadose.lens', 'Lens', ['lens'], true, (i) => i.lens !== undefined),
    ...vadoseLayerInputs<I>('vadose.source', 'Source soil', ['source'], true),
    ...sourceInputs<I>(),
    ...vadoseLayerInputs<I>('vadose.below', 'Soil below the source', ['below'], true),
    ...vadoseChemicalInputs<I>(),
    alphaL<I>(),
  ];
}

/** Layers declared on each side of the source for the layered method; a base with fewer reads NaN. */
export const LAYERED_DECLARED_LAYERS = 4;

/** Declarations of `vadose.layered`. */
export function layeredUncertainInputs<I>(): UncertainInput<I>[] {
  const out: UncertainInput<I>[] = [
    pathInput<I>({
      id: 'vadose.infiltration',
      label: 'Infiltration (Darcy flux)',
      unit: 'm/s',
      category: 'site',
      bounds: NON_NEGATIVE,
      path: ['q'],
    }),
  ];
  for (let k = 0; k < LAYERED_DECLARED_LAYERS; k++) {
    out.push(
      ...vadoseLayerInputs<I>(
        `vadose.above${k}`,
        `Layer ${k + 1} above the source`,
        ['above', k],
        true,
      ),
    );
  }
  out.push(...vadoseLayerInputs<I>('vadose.source', 'Source soil', ['source'], true));
  out.push(...sourceInputs<I>());
  for (let k = 0; k < LAYERED_DECLARED_LAYERS; k++) {
    out.push(
      ...vadoseLayerInputs<I>(
        `vadose.below${k}`,
        `Layer ${k + 1} below the source`,
        ['below', k],
        true,
      ),
    );
  }
  out.push(...vadoseChemicalInputs<I>(), alphaL<I>());
  return out;
}
