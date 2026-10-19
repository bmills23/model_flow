import { pathInput, type UncertainInput } from '../../registry/index.js';

/**
 * Uncertain-input declarations of the saturated soil source methods (uncertainty note, ruling 2).
 * Ids are `saturatedSource.<path>`. Molar mass is a constant of the chemical and the TPH pair is an
 * either-or block, so neither is declared; the horizon `tEnd` is a run setting, not a parameter.
 */

const NON_NEGATIVE = [0, Number.POSITIVE_INFINITY] as const;
const FRACTION = [0, 1] as const;
const VG_N = [1, Number.POSITIVE_INFINITY] as const;
const ANY = [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY] as const;

type Spec = readonly [
  path: readonly string[],
  label: string,
  unit: string,
  category: 'site' | 'transport' | 'chemical',
  bounds: readonly [number, number],
];

const COMMON: readonly Spec[] = [
  [['source', 'length'], 'Source plan length along the flow', 'm', 'site', NON_NEGATIVE],
  [['source', 'width'], 'Source plan width', 'm', 'site', NON_NEGATIVE],
  [['source', 'thickness'], 'Source thickness', 'm', 'site', NON_NEGATIVE],
  [
    ['source', 'minSaturatedThickness'],
    'Minimum saturated thickness (low water)',
    'm',
    'site',
    ANY,
  ],
  [['source', 'fluctuation'], 'Water table fluctuation height', 'm', 'site', NON_NEGATIVE],
  [['source', 'fractionHigh'], 'Fraction of the year at high water', '1', 'site', FRACTION],
  [['soil', 'porosity'], 'Porosity', '1', 'site', FRACTION],
  [['soil', 'rhoB'], 'Dry bulk density', 'kg/m^3', 'site', NON_NEGATIVE],
  [['soil', 'foc'], 'Organic carbon fraction', '1', 'site', FRACTION],
  [['soil', 'thetaR'], 'Residual water content', '1', 'site', FRACTION],
  [['soil', 'n'], 'van Genuchten n', '1', 'site', VG_N],
  [['aquifer', 'conductivity'], 'Aquifer hydraulic conductivity', 'm/s', 'transport', NON_NEGATIVE],
  [['aquifer', 'gradient'], 'Aquifer hydraulic gradient', '1', 'transport', NON_NEGATIVE],
  [['infiltration'], 'Infiltration (Darcy flux)', 'm/s', 'site', NON_NEGATIVE],
  [['chemical', 'F'], 'Total soil concentration', 'kg/kg', 'site', FRACTION],
  [['chemical', 'S'], 'Aqueous solubility', 'kg/m^3', 'chemical', NON_NEGATIVE],
  [['chemical', 'H'], "Dimensionless Henry's constant", '1', 'chemical', NON_NEGATIVE],
  [['chemical', 'koc'], 'Organic carbon partition coefficient', 'm^3/kg', 'chemical', NON_NEGATIVE],
];

function fromSpecs<I>(specs: readonly Spec[]): UncertainInput<I>[] {
  return specs.map(([path, label, unit, category, bounds]) =>
    pathInput<I>({
      id: `saturatedSource.${path.join('.')}`,
      label,
      unit,
      category,
      bounds,
      path,
    }),
  );
}

/** Declarations of `saturatedSource.two-region` (the legacy method has no source decay). */
export function twoRegionUncertainInputs<I>(): UncertainInput<I>[] {
  return fromSpecs<I>(COMMON);
}

/** Declarations of `saturatedSource.exponential`: the common ones plus the first-order source decay. */
export function exponentialUncertainInputs<I>(): UncertainInput<I>[] {
  return fromSpecs<I>([
    ...COMMON,
    [['sourceDecayRate'], 'Source first-order decay rate', '1/s', 'chemical', NON_NEGATIVE],
  ]);
}
