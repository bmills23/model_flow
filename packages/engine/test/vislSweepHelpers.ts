import {
  ADAF_SEGMENTS,
  ATTENUATION_FACTORS,
  attenuationFactorRun,
  attenuationFactorScreeningLevel,
  modernChemical,
  modernPathway,
  modernReceptor,
  rslVolatile,
  sourceVapor,
  type HenryTemperatureInput,
  type LifeStageBoundary,
  type ModernReceptor,
} from '../src/index.js';

import resident25 from '../../data/raw/visl/visl-default-resident-2026-10-22.json' with { type: 'json' };
import resident10 from '../../data/raw/visl/visl-resident-tgw10-hq1-tr1e-05-2026-10-22.json' with { type: 'json' };
import commercial25 from '../../data/raw/visl/visl-default-commercial-2026-10-22.json' with { type: 'json' };
import toxJson from '../../data/generated/rsl-2024-11/tox.json' with { type: 'json' };
import vaporJson from '../../data/generated/vapor/vapor-chemicals.json' with { type: 'json' };

// Helpers of the VISL calculator comparison (`visl-sweep.test.ts`): the calculator's printed cells, the
// engine's unrounded values built from the same composition of existing functions, and the rule that
// decides whether a printed cell is reproduced. The printed numbers are comparison data, never engine
// inputs, except in the first comparison, which feeds the calculator's own printed inputs to the engine.

export interface Cell {
  column: string;
  cell: string;
  value?: number;
}
export interface PrintedResult {
  cas: string;
  name: string;
  visl: Cell[];
  properties: Cell[];
}
export interface PrintedRun {
  retrieved: string;
  query: Record<string, string>;
  inputs: { variable: string; value: string }[];
  results: PrintedResult[];
}

export const FIXTURE_IDS = ['resident-default', 'resident-tgw10', 'commercial-default'] as const;
export type FixtureId = (typeof FIXTURE_IDS)[number];

export const RUNS: Record<FixtureId, PrintedRun> = {
  'resident-default': resident25 as unknown as PrintedRun,
  'resident-tgw10': resident10 as unknown as PrintedRun,
  'commercial-default': commercial25 as unknown as PrintedRun,
};

export const COMPARISON_IDS = ['printed-inputs', 'database'] as const;
export type ComparisonId = (typeof COMPARISON_IDS)[number];

// ---- Printed cells and their precision ----

const NUMBER_CELL = /^(-?)(\d+)(?:\.(\d+))?(?:E([+-]\d+))?$/;

/** The unit of the last printed digit of a numeric cell ('3.60E-01' is 1e-3, '353.15' is 1e-2). */
export function printedUnit(cell: string): number {
  const m = NUMBER_CELL.exec(cell.trim());
  if (m === null) throw new Error(`not a numeric cell: ${cell}`);
  return 10 ** (Number(m[4] ?? 0) - (m[3]?.length ?? 0));
}

/** The number of printed digits of the mantissa ('3.60E-01' has 3). */
export function printedDigits(cell: string): number {
  const m = NUMBER_CELL.exec(cell.trim());
  if (m === null) throw new Error(`not a numeric cell: ${cell}`);
  return m[2]!.length + (m[3]?.length ?? 0);
}

/** The unrounded engine value lies within half a unit of the last printed digit of the cell. */
export function withinPrinted(engine: number, cell: string): boolean {
  return Math.abs(engine - Number(cell)) <= 0.5 * printedUnit(cell) * (1 + 1e-9);
}

export const tableOf = (r: PrintedResult, q: NumericQuantity | AnswerQuantity): Cell[] =>
  q === 'hPrime' ? r.properties : r.visl;

const find = (cells: Cell[], start: string, not?: string): Cell => {
  const hits = cells.filter((c) => c.column.startsWith(start) && !(not && c.column.includes(not)));
  if (hits.length === 0) throw new Error(`no printed column starting "${start}"`);
  return hits[0]!;
};
const text = (cells: Cell[], start: string): string => find(cells, start).cell;

export const inputOf = (run: PrintedRun, start: string): string => {
  const hit = run.inputs.find((i) => i.variable.startsWith(start));
  if (hit === undefined) throw new Error(`no printed input "${start}"`);
  return hit.value;
};

// ---- What the engine computes ----

/** Every quantity of a result row the engine can compute, SI-free: the calculator's units (ug/m3, ug/L). */
export const NUMERIC_QUANTITIES = [
  'ciaC',
  'ciaNc',
  'cia',
  'csg',
  'cgw',
  'cvp',
  'chc',
  'hPrime',
] as const;
export type NumericQuantity = (typeof NUMERIC_QUANTITIES)[number];

export const ANSWER_QUANTITIES = [
  'volatile',
  'hasToxicity',
  'soilSource',
  'groundwaterSource',
  'basis',
  'mutagenic',
] as const;
export type AnswerQuantity = (typeof ANSWER_QUANTITIES)[number];

/** The column each quantity is printed in (a prefix of the column title); H prime is in the property table. */
export const COLUMN: Record<NumericQuantity | AnswerQuantity, string> = {
  ciaC: 'Carcinogenic VISL',
  ciaNc: 'Noncarcinogenic VISL',
  cia: 'Target Indoor Air Concentration',
  csg: 'Target Sub-Slab',
  cgw: 'Target Groundwater Concentration',
  cvp: 'Pure Phase Vapor Concentration',
  chc: 'Maximum Groundwater Vapor',
  hPrime: "Henry's Law Constant Used in Calcs",
  volatile: 'Does the chemical meet the definition for volatility',
  hasToxicity: 'Does the chemical have inhalation toxicity data',
  soilSource:
    'Is Chemical Sufficiently Volatile and Toxic to Pose Inhalation Risk Via Vapor Intrusion from Soil',
  groundwaterSource:
    'Is Chemical Sufficiently Volatile and Toxic to Pose Inhalation Risk Via Vapor Intrusion from Groundwater',
  basis: 'Toxicity Basis',
  mutagenic: 'Mutagenic Indicator',
};

/** The chemical and toxicity values one evaluation starts from, in the calculator's units. */
export interface Basis {
  /** g/mol */
  mw: number;
  /** Vapor pressure, mm Hg, at `vpTempC`. */
  vp: number;
  vpTempC: number;
  /** Aqueous solubility, mg/L. */
  s: number;
  /** Henry's constant at 25 deg C, atm m3/mol. */
  hlc: number;
  /** Dimensionless Henry's constant at 25 deg C, used directly when the groundwater temperature is 25 deg C. */
  hPrime25?: number;
  tbK: number;
  tcK: number;
  /** Enthalpy of vaporization at the normal boiling point, cal/mol. */
  dhvb: number;
  /** (ug/m3)^-1 */
  iur?: number;
  /** mg/m3 */
  rfc?: number;
  mutagen: boolean;
}
export type BasisKey = keyof Basis;

/** What is chosen by the user of the calculator, not by the chemical. */
export interface Setting {
  receptor: ModernReceptor;
  tr: number;
  thq: number;
  tgwC: number;
}

export interface Evaluated {
  ciaC: number | null;
  ciaNc: number | null;
  cia: number | null;
  csg: number | null;
  cgw: number | null;
  cvp: number;
  chc: number;
  volatile: boolean;
  hasToxicity: boolean;
  soilSource: boolean | null;
  groundwaterSource: boolean | null;
  basis: 'CA' | 'NC' | null;
  mutagenic: boolean;
  hPrime: number;
}

const UG_M3 = 1e-9; // kg/m3 per ug/m3
const UG_L = 1e-6; // kg/m3 per ug/L
const MMHG_TO_PA = 133.322387415;

function henryInput(b: Basis, tgwC: number): { H: number } | { henry: HenryTemperatureInput } {
  if (tgwC === 25 && b.hPrime25 !== undefined) return { H: b.hPrime25 };
  return {
    henry: { HR: b.hlc, dHvb: b.dhvb, TB: b.tbK, TC: b.tcK, TS: tgwC + 273.15 },
  };
}

/**
 * The engine's value of every quantity of one calculator row, from the composition the app has:
 * the exposure kernel for the target indoor air levels (risk and hazard quotient per unit
 * concentration of `indoorInhalation`), the attenuation factor screening level for sub-slab soil gas
 * and groundwater, the attenuation run on the solubility for the maximum groundwater vapor, the
 * vapor pressure form of the source vapor for the pure phase vapor, and the RSL volatility criterion.
 */
export function evaluate(b: Basis, s: Setting): Evaluated {
  const chem = modernChemical({
    id: 'x',
    mutagen: b.mutagen,
    ...(b.iur !== undefined ? { iur: b.iur } : {}),
    ...(b.rfc !== undefined ? { rfci: b.rfc } : {}),
  });
  const cell = modernPathway('indoorInhalation', s.receptor, chem, 1);
  const ciaC =
    cell.riskPerEpc === null || cell.riskPerEpc === 0 ? null : s.tr / cell.riskPerEpc / UG_M3;
  const top = cell.hqByGroup.length === 0 ? 0 : Math.max(...cell.hqByGroup.map((g) => g.hqPerEpc));
  const ciaNc = top === 0 ? null : s.thq / top / UG_M3;
  const found = [ciaC, ciaNc].filter((x): x is number => x !== null);
  const cia = found.length === 0 ? null : Math.min(...found);
  const basis = cia === null ? null : ciaC !== null && ciaC <= (ciaNc ?? Infinity) ? 'CA' : 'NC';

  const henry = henryInput(b, s.tgwC);
  const sKg = b.s * 1e-3;
  const gw = attenuationFactorRun({ medium: 'groundwater', concentration: sKg, ...henry });
  const hPrime = gw.hPrime!;
  const chc = gw.sourceVapor / UG_M3;

  // pure phase vapor: no mole fraction (no TPH entered), so the source is the pure chemical; the soil
  // block only has to be valid, the vapor pressure form does not depend on it
  const vpSource = sourceVapor({
    kind: 'soil',
    F: 1,
    rhoB: 1600,
    kd: 1e-3,
    theta: 0.3,
    thetaA: 0.2,
    H: hPrime,
    M: b.mw / 1000,
    S: sKg,
    vaporPressure: b.vp * MMHG_TO_PA,
    temperature: b.vpTempC + 273.15,
  });
  const cvp = vpSource.vaporPressureForm! / UG_M3;

  const csg =
    cia === null
      ? null
      : attenuationFactorScreeningLevel({ medium: 'subSlabSoilGas', targetIndoorAir: cia * UG_M3 })
          .screeningLevel / UG_M3;
  const cgw =
    cia === null
      ? null
      : attenuationFactorScreeningLevel({
          medium: 'groundwater',
          targetIndoorAir: cia * UG_M3,
          ...henry,
        }).screeningLevel / UG_L;

  return {
    ciaC,
    ciaNc,
    cia,
    csg,
    cgw,
    cvp,
    chc,
    volatile: rslVolatile({ henryAtmM3PerMol: b.hlc, vaporPressureMmHg: b.vp }),
    hasToxicity: cell.risk !== null || cell.hqByGroup.length > 0,
    soilSource: cia === null ? null : cvp > cia,
    groundwaterSource: cia === null ? null : chc > cia,
    basis,
    mutagenic: b.mutagen,
    hPrime,
  };
}

// ---- Receptors ----

const filler = { bwKg: 80 }; // body weight does not enter an inhalation level

/** The receptor of a fixture, built from the exposure inputs the calculator prints. */
export function receptorOf(run: PrintedRun): ModernReceptor {
  const scenario = inputOf(run, 'Exposure Scenario');
  const lifetimeYr = Number(inputOf(run, 'LT'));
  if (scenario === 'Commercial') {
    return modernReceptor({
      label: 'printed commercial',
      lifetimeYr,
      stages: [
        {
          id: 'worker',
          group: 'worker',
          ...filler,
          edYr: Number(inputOf(run, 'EDcom')),
          efDaysPerYr: Number(inputOf(run, 'EFcom')),
          etHoursPerDay: { indoorInhalation: Number(inputOf(run, 'ETcom')) },
        },
      ],
    });
  }
  const phases = ['0-2', '2-6', '6-16', '16-26'];
  const mutagenStages: LifeStageBoundary[] = phases.map((p, i) => ({
    id: `age-${p}`,
    group: 'resident',
    ...filler,
    edYr: Number(inputOf(run, `ED${p}`)),
    adaf: ADAF_SEGMENTS[i]!,
    efDaysPerYr: Number(inputOf(run, `EF${p}`)),
    etHoursPerDay: { indoorInhalation: Number(inputOf(run, `ET${p}`)) },
  }));
  return modernReceptor({
    label: 'printed resident',
    lifetimeYr,
    stages: [
      {
        id: 'resident',
        group: 'resident',
        ...filler,
        edYr: Number(inputOf(run, 'EDres')),
        efDaysPerYr: Number(inputOf(run, 'EFres')),
        etHoursPerDay: { indoorInhalation: Number(inputOf(run, 'ETres')) },
      },
    ],
    mutagenStages,
  });
}

export function settingOf(run: PrintedRun, receptor: ModernReceptor): Setting {
  return {
    receptor,
    tr: Number(inputOf(run, 'TR')),
    thq: Number(inputOf(run, 'THQ')),
    tgwC: Number(inputOf(run, 'Temperature for Groundwater Vapor Concentration')),
  };
}

/** The attenuation factors the calculator prints must be the ones the engine holds. */
export function printedFactors(run: PrintedRun): { groundwater: number; subSlab: number } {
  return {
    groundwater: Number(inputOf(run, 'AFgw')),
    subSlab: Number(inputOf(run, 'AFss')),
  };
}
export const ENGINE_FACTORS = {
  groundwater: ATTENUATION_FACTORS.groundwater,
  subSlab: ATTENUATION_FACTORS.subSlabSoilGas,
};

// ---- The two sources of Basis ----

/** The numeric inputs the engine takes from a row, with the unit of the last printed digit of each. */
export const ROUNDED_KEYS = ['mw', 'vp', 's', 'hlc', 'tbK', 'tcK', 'dhvb', 'iur', 'rfc'] as const;
export type RoundedKey = (typeof ROUNDED_KEYS)[number];
export type PrintedUnits = Record<RoundedKey, number>;

/** First comparison: the chemical and toxicity values the calculator prints for the row itself. */
export function printedBasis(
  run: PrintedRun,
  r: PrintedResult,
): { basis: Basis; units: PrintedUnits } {
  const p = r.properties;
  const tgwC = Number(inputOf(run, 'Temperature for Groundwater Vapor Concentration'));
  // the vapor pressure at the groundwater temperature is printed when it is not 25 deg C
  const vpColumn = tgwC === 25 ? 'Vapor Pressure VP (mm Hg)' : `Vapor Pressure VP (${tgwC} `;
  const cells: Record<RoundedKey, Cell> = {
    mw: find(p, 'MW', 'Ref'),
    vp: find(p, vpColumn),
    s: find(p, 'S (mg/L)'),
    hlc: find(p, "Henry's Law Constant (atm-m3/mole)"),
    tbK: find(p, 'Normal Boiling Point'),
    tcK: find(p, 'Critical Temperature'),
    dhvb: find(p, 'Enthalpy of vaporization at the normal boiling point'),
    iur: find(r.visl, 'IUR (ug/m3)-1'),
    rfc: find(r.visl, 'Inhalation Reference Concentration'),
  };
  const units = Object.fromEntries(
    ROUNDED_KEYS.map((k) => [k, printedUnit(cells[k].cell)]),
  ) as PrintedUnits;
  const n = (k: RoundedKey): number => Number(cells[k].cell);
  return {
    basis: {
      mw: n('mw'),
      vp: n('vp'),
      vpTempC: tgwC,
      s: n('s'),
      hlc: n('hlc'),
      tbK: n('tbK'),
      tcK: n('tcK'),
      dhvb: n('dhvb'),
      iur: n('iur'),
      rfc: n('rfc'),
      mutagen: text(r.visl, 'Mutagenic Indicator') !== 'No',
    },
    units,
  };
}

interface VaporRow {
  id: string;
  rsl: {
    mw?: { value: number };
    hPrime?: { value: number };
    hlc?: { value: number };
    vp?: { value: number };
    s?: { value: number };
  };
  epa2004je?: { tbK?: number; tcK?: number; dhvbCalPerMol?: number };
}
interface ToxRow {
  id: string;
  mutagen: boolean;
  iur?: { value: number };
  rfci?: { value: number };
}
const vaporRows = new Map(
  (vaporJson as unknown as { chemicals: VaporRow[] }).chemicals.map((c) => [c.id, c]),
);
const toxRows = new Map(
  (toxJson as unknown as { toxicity: ToxRow[] }).toxicity.map((c) => [c.id, c]),
);

/**
 * Second comparison: the values the app ships. Chemical properties come from the file the vapor screen
 * loads (`vapor-chemicals.json`: RSL properties, and the EPA 2004 guide's boiling point, critical
 * temperature and enthalpy), toxicity from the RSL toxicity file the exposure screens use. The database
 * holds the vapor pressure at 25 deg C only.
 */
export function databaseBasis(cas: string): Basis {
  const v = vaporRows.get(cas);
  const t = toxRows.get(cas);
  if (v === undefined || t === undefined) throw new Error(`${cas} is not in the shipped database`);
  const e = v.epa2004je;
  if (
    v.rsl.mw === undefined ||
    v.rsl.hlc === undefined ||
    v.rsl.hPrime === undefined ||
    v.rsl.vp === undefined ||
    v.rsl.s === undefined ||
    e?.tbK === undefined ||
    e.tcK === undefined ||
    e.dhvbCalPerMol === undefined
  ) {
    throw new Error(`${cas}: the database row lacks a property the vapor screening needs`);
  }
  return {
    mw: v.rsl.mw.value,
    vp: v.rsl.vp.value,
    vpTempC: 25,
    s: v.rsl.s.value,
    hlc: v.rsl.hlc.value,
    hPrime25: v.rsl.hPrime.value,
    tbK: e.tbK,
    tcK: e.tcK,
    dhvb: e.dhvbCalPerMol,
    ...(t.iur !== undefined ? { iur: t.iur.value } : {}),
    ...(t.rfci !== undefined ? { rfc: t.rfci.value } : {}),
    mutagen: t.mutagen,
  };
}

// ---- Comparison ----

export type Status = 'reproduced' | 'excepted' | 'unexplained';

export interface CellOutcome {
  comparison: ComparisonId;
  fixture: FixtureId;
  cas: string;
  name: string;
  quantity: NumericQuantity | AnswerQuantity;
  printed: string;
  /** The engine's value (numbers to four significant figures for print), or the answer. */
  computed: number | string | null;
  status: Status;
  /** The exception class when excepted. */
  cls?: string;
  /** The database inputs whose difference explains an excepted cell (second comparison). */
  inputs?: BasisKey[];
}

const yesNo = (b: boolean | null): string => (b === null ? '--' : b ? 'Yes' : 'No');
const BASIS_KEYS: BasisKey[] = [
  'mw',
  'vp',
  's',
  'hlc',
  'hPrime25',
  'tbK',
  'tcK',
  'dhvb',
  'iur',
  'rfc',
  'mutagen',
];

/** True when the engine's value for one quantity matches the printed cell. */
export function matches(
  q: NumericQuantity | AnswerQuantity,
  e: Evaluated,
  printed: string,
): boolean {
  switch (q) {
    case 'volatile':
      return yesNo(e.volatile) === printed;
    case 'hasToxicity':
      return yesNo(e.hasToxicity) === printed;
    case 'soilSource':
      return yesNo(e.soilSource) === printed;
    case 'groundwaterSource':
      return yesNo(e.groundwaterSource) === printed;
    case 'basis':
      return e.basis === printed;
    case 'mutagenic':
      return (e.mutagenic ? 'Mut' : 'No') === printed;
    default: {
      const v = e[q];
      return v !== null && withinPrinted(v, printed);
    }
  }
}

function shown(q: NumericQuantity | AnswerQuantity, e: Evaluated): number | string | null {
  switch (q) {
    case 'volatile':
      return yesNo(e.volatile);
    case 'hasToxicity':
      return yesNo(e.hasToxicity);
    case 'soilSource':
      return yesNo(e.soilSource);
    case 'groundwaterSource':
      return yesNo(e.groundwaterSource);
    case 'basis':
      return e.basis;
    case 'mutagenic':
      return e.mutagenic ? 'Mut' : 'No';
    default:
      return e[q] === null ? null : Number(e[q]!.toPrecision(5));
  }
}

export const CLASSES = [
  'special-case-bracketed',
  'pure-phase-vapor-at-25',
  'printed-input-rounding',
  'database-input-differs',
] as const;
export type ClassId = (typeof CLASSES)[number];

/** Everything one judgement needs about a row of a fixture. */
export interface RowContext {
  comparison: ComparisonId;
  fixture: FixtureId;
  result: PrintedResult;
  /** The basis the engine is run from. */
  basis: Basis;
  /** The values the calculator prints for the row, with the rounding of each. */
  printed: { basis: Basis; units: PrintedUnits };
  setting: Setting;
}

function* subsets<T>(items: T[], size: number, start = 0, taken: T[] = []): Generator<T[]> {
  if (taken.length === size) {
    yield taken;
    return;
  }
  for (let i = start; i < items.length; i++) {
    yield* subsets(items, size, i + 1, [...taken, items[i]!]);
  }
}

/**
 * The range of engine values when each of the named inputs is moved anywhere within the rounding of its
 * last printed digit (the corners of the box; each quantity is monotone in each input over these ranges).
 */
function attainable(
  q: NumericQuantity,
  basis: Basis,
  keys: readonly RoundedKey[],
  units: PrintedUnits,
  setting: Setting,
): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let mask = 0; mask < 1 << keys.length; mask++) {
    const moved: Basis = { ...basis };
    keys.forEach((k, i) => {
      moved[k] = basis[k]! + ((mask >> i) & 1 ? 0.5 : -0.5) * units[k];
    });
    const v = evaluate(moved, setting)[q];
    if (v === null) return null;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [lo, hi];
}

const isNumeric = (q: NumericQuantity | AnswerQuantity): q is NumericQuantity =>
  (NUMERIC_QUANTITIES as readonly string[]).includes(q);

/** The printed cell lies within half a unit of its last digit of a value in the range. */
const covers = (range: [number, number] | null, printed: string): boolean => {
  if (range === null) return false;
  const half = 0.5 * printedUnit(printed) * (1 + 1e-9);
  return range[0] <= Number(printed) + half && range[1] >= Number(printed) - half;
};

/**
 * Decides one cell. A cell that does not reproduce is excepted only when a class applies and its own
 * evidence holds, never by name; otherwise it is unexplained.
 * - `special-case-bracketed`: a chemical the calculator flags mutagenic whose printed cancer level lies
 *   strictly between the engine's all-mutagenic and not-mutagenic levels (the calculator treats only part
 *   of its cancer risk as mutagenic, by the RSL's own equations; the engine has the two bounds only);
 * - `pure-phase-vapor-at-25`: a pure phase vapor concentration printed under a groundwater temperature other
 *   than 25 deg C that the engine reproduces from the vapor pressure at 25 deg C (the calculator keeps its
 *   25 deg C value; the engine, given the printed vapor pressure at the new temperature, does not);
 * - `printed-input-rounding` (first comparison): the printed inputs carry three or five significant figures,
 *   and the printed cell lies within half a unit of a value the engine gives for inputs that round to the
 *   printed ones (the tolerance itself is not widened; the engine's input is);
 * - `database-input-differs` (second comparison): the cell reproduces when the smallest set of database
 *   inputs that differ from the printed ones is replaced by the printed ones, taking those printed inputs
 *   anywhere within their rounding (the other inputs stay the database's).
 */
export function judge(c: RowContext, q: NumericQuantity | AnswerQuantity): CellOutcome {
  const { comparison, fixture, result: r, basis, setting } = c;
  const e = evaluate(basis, setting);
  const printed = text(tableOf(r, q), COLUMN[q]);
  const out: CellOutcome = {
    comparison,
    fixture,
    cas: r.cas,
    name: r.name,
    quantity: q,
    printed,
    computed: shown(q, e),
    status: 'reproduced',
  };
  if (matches(q, e, printed)) return out;

  const except = (cls: ClassId, inputs?: BasisKey[]): CellOutcome => ({
    ...out,
    status: 'excepted',
    cls,
    ...(inputs !== undefined ? { inputs } : {}),
  });

  if (q === 'ciaC' && basis.mutagen) {
    const mutagenic = e.ciaC;
    const ordinary = evaluate({ ...basis, mutagen: false }, setting).ciaC;
    const target = Number(printed);
    if (mutagenic !== null && ordinary !== null && mutagenic < target && target < ordinary) {
      return except('special-case-bracketed');
    }
  }

  if (q === 'cvp' && setting.tgwC !== 25) {
    const vp25 = Number(find(r.properties, 'Vapor Pressure VP (mm Hg)').cell);
    if (matches('cvp', evaluate({ ...basis, vp: vp25, vpTempC: 25 }, setting), printed)) {
      return except('pure-phase-vapor-at-25');
    }
  }

  if (comparison === 'printed-inputs' && isNumeric(q)) {
    if (covers(attainable(q, basis, ROUNDED_KEYS, c.printed.units, setting), printed)) {
      return except('printed-input-rounding');
    }
  }

  if (comparison === 'database') {
    const asPrinted = c.printed.basis;
    const differing = BASIS_KEYS.filter((k) => basis[k] !== asPrinted[k]);
    for (let size = 1; size <= differing.length; size++) {
      for (const subset of subsets(differing, size)) {
        const swapped = {
          ...basis,
          ...Object.fromEntries(subset.map((k) => [k, asPrinted[k]])),
        } as Basis;
        const rounded = subset.filter((k): k is RoundedKey =>
          (ROUNDED_KEYS as readonly string[]).includes(k),
        );
        if (
          matches(q, evaluate(swapped, setting), printed) ||
          (isNumeric(q) &&
            covers(attainable(q, swapped, rounded, c.printed.units, setting), printed))
        ) {
          return except('database-input-differs', subset);
        }
      }
    }
  }
  return { ...out, status: 'unexplained' };
}

export interface Counts {
  compared: number;
  reproduced: number;
  excepted: number;
  unexplained: number;
}
export const emptyCounts = (): Counts => ({
  compared: 0,
  reproduced: 0,
  excepted: 0,
  unexplained: 0,
});

export function contextOf(
  comparison: ComparisonId,
  fixture: FixtureId,
  result: PrintedResult,
): RowContext {
  const run = RUNS[fixture];
  const printed = printedBasis(run, result);
  const basis = comparison === 'printed-inputs' ? printed.basis : databaseBasis(result.cas);
  return { comparison, fixture, result, basis, printed, setting: settingOf(run, receptorOf(run)) };
}

/** The quantities compared in one comparison. */
export const quantitiesOf = (comparison: ComparisonId): (NumericQuantity | AnswerQuantity)[] => [
  ...NUMERIC_QUANTITIES,
  // the mutagenic indicator is an input of the first comparison, so only the second one checks it
  ...ANSWER_QUANTITIES.filter((q) => q !== 'mutagenic' || comparison === 'database'),
];

/** Runs one comparison of one fixture: every numeric and yes or no cell the engine can compute. */
export function runFixture(comparison: ComparisonId, fixture: FixtureId): CellOutcome[] {
  const out: CellOutcome[] = [];
  for (const result of RUNS[fixture].results) {
    const context = contextOf(comparison, fixture, result);
    for (const q of quantitiesOf(comparison)) out.push(judge(context, q));
  }
  return out;
}

export function countOf(cells: CellOutcome[]): Counts {
  const c = emptyCounts();
  for (const x of cells) {
    c.compared += 1;
    c[x.status] += 1;
  }
  return c;
}
