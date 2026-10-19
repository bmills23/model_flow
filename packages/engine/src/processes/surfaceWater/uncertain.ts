import { pathInput, type UncertainInput } from '../../registry/index.js';
import type { LegacySurfaceWaterInput, ModernSurfaceWaterInput } from './scenario.js';

/**
 * Uncertain-input declarations of the surface water methods (uncertainty note, ruling 2). Ids are
 * `surfaceWater.<path>`. An input of the other variant of a union (river or lake, entered or Domenico
 * reach, flow or Darcy discharge) reads NaN and refuses a set. The groundwater concentration and bank
 * discharge series are outputs of the groundwater chain, not parameters, and are not declared here.
 */

const NON_NEGATIVE = [0, Number.POSITIVE_INFINITY] as const;
const FRACTION = [0, 1] as const;

type Cat = 'site' | 'transport' | 'chemical';

function scalar<I>(
  path: readonly string[],
  label: string,
  unit: string,
  category: Cat,
  bounds: readonly [number, number] = NON_NEGATIVE,
  when?: (input: I) => boolean,
): UncertainInput<I> {
  return pathInput<I>({
    id: `surfaceWater.${path.join('.')}`,
    label,
    unit,
    category,
    bounds,
    path,
    ...(when !== undefined ? { when } : {}),
  });
}

interface Common {
  body: { type: string };
  sediment?: object;
}

function commonInputs<I extends Common>(): UncertainInput<I>[] {
  const river = (i: I): boolean => i.body.type === 'river';
  const lake = (i: I): boolean => i.body.type === 'lake';
  return [
    scalar<I>(['upstreamFlow'], 'Upstream flow', 'm^3/s', 'transport'),
    scalar<I>(['background'], 'Upstream background concentration', 'kg/m^3', 'transport'),
    scalar<I>(['mixingFraction'], 'Mixing fraction', '1', 'transport', FRACTION),
    scalar<I>(['decay'], 'First-order decay in the water body', '1/s', 'chemical'),
    scalar<I>(['body', 'crossSection'], 'River cross-section', 'm^2', 'site', NON_NEGATIVE, river),
    scalar<I>(['body', 'reachLength'], 'River reach length', 'm', 'site', NON_NEGATIVE, river),
    scalar<I>(['body', 'volume'], 'Lake volume', 'm^3', 'site', NON_NEGATIVE, lake),
    scalar<I>(
      ['sediment', 'fractionOrganicCarbon'],
      'Sediment organic carbon fraction',
      '1',
      'site',
      FRACTION,
    ),
    scalar<I>(['sediment', 'koc'], 'Organic carbon partition coefficient', 'm^3/kg', 'chemical'),
    scalar<I>(['sediment', 'kd'], 'Sediment partition coefficient', 'm^3/kg', 'chemical'),
  ];
}

/** Declarations of `surfaceWater.well-mixed`. */
export function legacySurfaceWaterUncertainInputs(): UncertainInput<LegacySurfaceWaterInput>[] {
  type I = LegacySurfaceWaterInput;
  const entered = (i: I): boolean => i.reach?.kind === 'entered';
  const domenico = (i: I): boolean => i.reach?.kind === 'domenico';
  const flow = (i: I): boolean => i.discharge.kind === 'flow';
  const darcy = (i: I): boolean => i.discharge.kind === 'darcy';
  return [
    ...commonInputs<I>(),
    scalar<I>(['reach', 'length'], 'Entered reach length', 'm', 'site', NON_NEGATIVE, entered),
    scalar<I>(
      ['reach', 'sourceWidth'],
      'Source width for the Domenico reach',
      'm',
      'site',
      NON_NEGATIVE,
      domenico,
    ),
    scalar<I>(
      ['reach', 'distance'],
      'Distance to the bank for the Domenico reach',
      'm',
      'site',
      NON_NEGATIVE,
      domenico,
    ),
    scalar<I>(
      ['reach', 'transverseDispersivity'],
      'Transverse dispersivity for the Domenico reach',
      'm',
      'transport',
      NON_NEGATIVE,
      domenico,
    ),
    scalar<I>(
      ['discharge', 'flow'],
      'Groundwater discharge',
      'm^3/s',
      'transport',
      NON_NEGATIVE,
      flow,
    ),
    scalar<I>(
      ['discharge', 'bedConductivity'],
      'Bed hydraulic conductivity',
      'm/s',
      'site',
      NON_NEGATIVE,
      darcy,
    ),
    scalar<I>(['discharge', 'thickness'], 'Discharge thickness', 'm', 'site', NON_NEGATIVE, darcy),
    scalar<I>(['discharge', 'gradient'], 'Bed head gradient', '1', 'site', NON_NEGATIVE, darcy),
  ];
}

/** Declarations of `surfaceWater.mass-discharge`. */
export function modernSurfaceWaterUncertainInputs(): UncertainInput<ModernSurfaceWaterInput>[] {
  type I = ModernSurfaceWaterInput;
  const discharge = (i: I): boolean => i.bank.kind === 'discharge';
  return [
    ...commonInputs<I>(),
    scalar<I>(
      ['bank', 'groundwaterFlow'],
      'Groundwater flow through the bank plane',
      'm^3/s',
      'transport',
      NON_NEGATIVE,
      discharge,
    ),
    scalar<I>(['initialConcentration'], 'Initial water body concentration', 'kg/m^3', 'transport'),
    scalar<I>(
      ['downstream', 'distance'],
      'Distance of the river receptor below the reach',
      'm',
      'site',
    ),
  ];
}
