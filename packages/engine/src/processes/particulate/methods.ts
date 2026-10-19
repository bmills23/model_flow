import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { boxConcentrationFromFlux, type OutdoorBox } from '../outdoorAir/box.js';
import type { OutdoorDirect, OutdoorEmission } from '../outdoorAir/emissions.js';
import { checkNonNeg, checkPos } from '../vapor/units.js';
import {
  particulateBoxEmission,
  particulatePefDirect,
  pef,
  QOVERC_1996_PM10,
  QOVERC_2002_WIND,
} from './pef.js';
import { qOverC2002 } from './qOverC2002.js';
import { PARTICULATE_DEFAULTS, windErosionFlux, type WindErosionInput } from './windErosion.js';
import {
  particulateBoxUncertainInputs,
  pef1996UncertainInputs,
  pef2002UncertainInputs,
} from './uncertain.js';

const VOLATILE_WARNING: Warning = {
  code: 'particulate.volatile-chemical',
  message:
    'A particulate pathway was requested for a chemical the volatility criterion calls volatile; the soil screening guidance uses the volatilization factor for those.',
};

export interface ParticulateBoxInput {
  /** Surface soil concentration, kg/kg. */
  soilConcentration: number;
  /** Entered PM10 emission flux, kg/(m^2 s); omitted means the wind-erosion flux. */
  flux?: number;
  /** Wind-erosion inputs; omitted means the soil screening guidance defaults. */
  wind?: WindErosionInput;
  box: OutdoorBox;
  /** The chemical is volatile (the caller's database decides). */
  volatile?: boolean;
}

export interface ParticulateBoxResult {
  /** Particulate mass flux, kg/(m^2 s). */
  flux: number;
  emission: OutdoorEmission;
  /** Outdoor air concentration, kg/m^3. */
  concentration: number;
  /** Air concentration per unit soil concentration (kg/m^3 per kg/kg). */
  coefficient: number;
  warnings: Warning[];
}

export function particulateBoxAir(p: ParticulateBoxInput): ParticulateBoxResult {
  checkNonNeg('soil concentration', p.soilConcentration);
  const flux = p.flux ?? windErosionFlux(p.wind ?? PARTICULATE_DEFAULTS);
  checkPos('particulate flux', flux);
  const area = p.box.length * p.box.width;
  const coefficient = boxConcentrationFromFlux(p.box, flux, area);
  return {
    flux,
    emission: particulateBoxEmission('particulate.box-emission', flux, p.soilConcentration, area),
    concentration: coefficient * p.soilConcentration,
    coefficient,
    warnings: p.volatile === true ? [VOLATILE_WARNING] : [],
  };
}

export interface ParticulatePefInput {
  /** Surface soil concentration, kg/kg. */
  soilConcentration: number;
  /** Q/C, g/(m^2 s) per kg/m^3; omitted means the method's guidance default. */
  qOverC?: number;
  /** Wind-erosion inputs; omitted means the soil screening guidance defaults. */
  wind?: WindErosionInput;
  volatile?: boolean;
}

export interface ParticulatePef2002Input extends ParticulatePefInput {
  /** Exhibit D-2 station for the Q/C regression (used when `qOverC` is omitted). */
  station?: string;
  /** Source area, acres (default 0.5). */
  areaAcres?: number;
}

export interface ParticulatePefResult {
  /** Particulate emission factor, m^3/kg. */
  pef: number;
  qOverC: number;
  /** Air concentration, kg/m^3. */
  concentration: number;
  /** Air concentration per unit soil concentration (1 / PEF). */
  coefficient: number;
  direct: OutdoorDirect;
  warnings: Warning[];
}

function pefAir(origin: string, qOverC: number, p: ParticulatePefInput): ParticulatePefResult {
  checkNonNeg('soil concentration', p.soilConcentration);
  const value = pef(qOverC, windErosionFlux(p.wind ?? PARTICULATE_DEFAULTS));
  const direct = particulatePefDirect(origin, p.soilConcentration, value);
  return {
    pef: value,
    qOverC,
    concentration: p.soilConcentration / value,
    coefficient: 1 / value,
    direct,
    warnings: p.volatile === true ? [VOLATILE_WARNING] : [],
  };
}

export function particulatePef1996(p: ParticulatePefInput): ParticulatePefResult {
  return pefAir('particulate.ssg-pef-1996', p.qOverC ?? QOVERC_1996_PM10, p);
}

export function particulatePef2002(p: ParticulatePef2002Input): ParticulatePefResult {
  const q =
    p.qOverC ??
    (p.station === undefined ? QOVERC_2002_WIND : qOverC2002(p.station, p.areaAcres ?? 0.5));
  return pefAir('particulate.ssg-pef-2002', q, p);
}

export const particulateBoxEmissionMethod: MethodDescriptor<
  ParticulateBoxInput,
  ParticulateBoxResult
> = {
  id: 'particulate.box-emission',
  uncertainInputs: particulateBoxUncertainInputs(),
  process: 'particulate',
  kind: 'legacy',
  name: 'Particulate flux into the outdoor box',
  summary:
    'A PM10 mass flux, entered or from the wind-erosion expression J = 0.036 (1 - V) (U_m/U_t)^3 F(x), times the soil concentration is an area-flux emission of chemical into the outdoor box: C_a = J C_s L / (u delta).',
  citations: ['cowherd1985', 'epa1996ssg'],
  assumptions: [
    'The particles carry the bulk soil concentration of the chemical; soil is constant in time.',
    'F(x) is an entered value (the preset 0.194 is the printed guidance default); the function of x is not computed.',
    'The wind-erosion expression is verified as reproduced in the soil screening guidance; the original report was not read.',
    'Linear in the soil concentration.',
  ],
  risc5Choice:
    'RISC5 offers an entered PM10 emission flux (an ASTM RBCA default that could not be cited) or the wind-erosion flux, each feeding the outdoor box.',
  validate: (input): Warning[] => particulateBoxAir(input).warnings,
  run: particulateBoxAir,
};

export const particulateSsgPef1996: MethodDescriptor<ParticulatePefInput, ParticulatePefResult> = {
  id: 'particulate.ssg-pef-1996',
  uncertainInputs: pef1996UncertainInputs(),
  process: 'particulate',
  kind: 'modern',
  name: 'Soil screening guidance particulate emission factor (1996)',
  summary:
    'PEF = (Q/C) / J with the guidance default Q/C of 90.80 g/(m^2 s) per kg/m^3 (Minneapolis, half acre) and the wind-erosion flux; air concentration = soil concentration / PEF.',
  citations: ['epa1996ssg', 'eq1994pef'],
  assumptions: [
    'Q/C for particulates is a separate PM10 value from the volatilization Q/C used by the outdoor air method.',
    'Defaults V 0.5, U_m 4.69 m/s, U_t 11.32 m/s and F(x) 0.194 are the printed guidance values; the generic PEF is 1.32E9 m^3/kg.',
    'Linear in the soil concentration.',
  ],
  validate: (input): Warning[] => particulatePef1996(input).warnings,
  run: particulatePef1996,
};

export const particulateSsgPef2002: MethodDescriptor<
  ParticulatePef2002Input,
  ParticulatePefResult
> = {
  id: 'particulate.ssg-pef-2002',
  uncertainInputs: pef2002UncertainInputs(),
  process: 'particulate',
  kind: 'modern',
  name: 'Supplemental soil screening guidance particulate emission factor (2002)',
  summary:
    'The same PEF with the 2002 default Q/C of 93.77 or the site-specific regression Q/C = A exp[(ln A_s - B)^2 / C] on source area (0.5 to 500 acres) with the constants of a climate zone station.',
  citations: ['epa2002ssg'],
  assumptions: [
    'The regression constants are those of Exhibit D-2; the Minneapolis half-acre value reproduces the printed 93.77.',
    'V, U_m, U_t and F(x) are the same as the 1996 guidance; the generic PEF is 1.36E9 m^3/kg.',
    'Construction-phase emission factors are not included.',
    'Linear in the soil concentration.',
  ],
  validate: (input): Warning[] => particulatePef2002(input).warnings,
  run: particulatePef2002,
};
