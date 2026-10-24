import {
  modernChemical,
  particulatePef2002,
  qOverCToSi,
  ssgVolatilizationFactor,
  modernPathway,
  modernResident,
  modernWorker,
  showerHouseholdAir,
  type ModernChemical,
  type ModernChemicalBoundary,
  type ModernReceptor,
  type PathwayId,
} from '../src/index.js';

import chemicalsJson from '../../data/generated/rsl-2024-11/chemicals.json' with { type: 'json' };
import levelsJson from '../../data/generated/rsl-2024-11/screening-levels.json' with { type: 'json' };
import toxJson from '../../data/generated/rsl-2024-11/tox.json' with { type: 'json' };

// Helpers of the RSL screening-level sweep (`rsl-tables-sweep.test.ts`): the published cells of the
// November 2024 tables, the database chemical behind each row, and the engine's unrounded value for the
// cells the engine can compute. The published numbers are comparison data, never engine inputs.

export interface SweepColumn {
  id: string;
  medium: string;
  receptor?: string;
  pathway: string;
  endpoint: string;
  units: string;
  count: number;
}

export interface SweepChemicalRow {
  id: string;
  cas?: string;
  name: string;
  volatile: boolean;
  mutagen: boolean;
  special?: string;
  inEpd?: boolean;
  values: Record<string, { value: number; key?: string }>;
}

export const levels = levelsJson as unknown as {
  columns: SweepColumn[];
  chemicals: SweepChemicalRow[];
  keyMeanings: Record<string, string>;
};

interface PhysRecord {
  id: string;
  values: Record<string, { value: number }>;
  fa?: number;
  inEpd?: boolean;
  dermalForm?: string;
}
type PhysValues = Record<string, { value: number }>;
interface ToxRecord {
  id: string;
  cas?: string;
  mutagen: boolean;
  volatile: boolean;
  sfo?: { value: number };
  iur?: { value: number };
  rfdo?: { value: number };
  rfci?: { value: number };
  giabs?: number;
  absd?: number;
  csat?: number;
  special?: 'trichloroethylene' | 'vinyl-chloride';
}

const phys = new Map(
  (chemicalsJson as unknown as { chemicals: PhysRecord[] }).chemicals.map((c) => [c.id, c]),
);
const tox = new Map(
  (toxJson as unknown as { toxicity: ToxRecord[] }).toxicity.map((c) => [c.id, c]),
);

/** The household water-to-air factor K of the RSL tap water inhalation term, L/m^3 (RSL user's guide table 1). */
export const HOUSEHOLD_K = 0.5;

export function boundaryOf(id: string): ModernChemicalBoundary {
  const t = tox.get(id);
  const p = phys.get(id);
  if (t === undefined) throw new Error(`no toxicity record for ${id}`);
  const v = p?.values;
  const b: ModernChemicalBoundary = {
    id: t.cas ?? t.id,
    mutagen: t.mutagen,
    sfo: t.sfo?.value,
    iur: t.iur?.value,
    rfdo: t.rfdo?.value,
    rfci: t.rfci?.value,
    giabs: t.giabs,
    absd: t.absd,
    csat: t.csat,
    kp: v?.kp?.value,
    tauEvent: v?.tauEvent?.value,
    tStar: v?.tStar?.value,
    b: v?.b?.value,
    fa: p?.fa,
    inEpd: p?.inEpd,
    special: t.special,
    organic: p?.dermalForm === undefined ? undefined : p.dermalForm === 'organic',
  };
  return b;
}

export interface Sweeper {
  chemical: ModernChemical;
  volatile: boolean;
}

const cache = new Map<string, Sweeper>();
function sweeperOf(id: string): Sweeper {
  let s = cache.get(id);
  if (s === undefined) {
    s = { chemical: modernChemical(boundaryOf(id)), volatile: tox.get(id)!.volatile };
    cache.set(id, s);
  }
  return s;
}

/**
 * Soil inhalation inputs of the RSL (user's guide sections 4.1.1 and 4.2.1 for the levels, 4.9.1 for the particulate
 * emission factor, 4.9.4 for the chronic volatilization factor, read 2026-10-23; the values of the default exposure
 * parameter file, SEMS 404323, sheets "Chronic VF, Csat" and "PEF Wind"). The test composes them from the engine's
 * volatilization factor (`outdoorAir.ssg-vf-1996`) and wind-erosion particulate emission factor
 * (`particulate.ssg-pef-2002`); the RSL form differs from the engine's defaults in the dispersion factor for
 * volatiles, the exposure interval and the soil, which are passed as the options those methods already take.
 */
export const RSL_SOIL = {
  /** Q/C for volatiles, 0.5 acre, g/(m^2 s) per kg/m^3. */
  qOverCVolatile: 68.18,
  /** Exposure interval of the unlimited-source model, 26 years in s. */
  exposureS: 8.2e8,
  /** The value of pi the guide prints in the volatilization factor. */
  pi: 3.14,
  /** Dry bulk density (kg/m^3), particle density (kg/m^3), water-filled porosity and organic carbon fraction. */
  bulkDensity: 1500,
  particleDensity: 2650,
  moisture: 0.15,
  foc: 0.006,
} as const;

/** The RSL particulate emission factor, m^3/kg: Q/C 93.77 with the wind-erosion defaults (the guide's 1.36E9). */
export function rslPef(): number {
  return particulatePef2002({ soilConcentration: 1 }).pef;
}

export type VfStatus =
  | { kind: 'not-volatile' }
  | { kind: 'missing-input'; missing: string[] }
  | { kind: 'vf'; vf: number };

/**
 * The RSL volatilization factor of one chemical, m^3/kg. A chemical the tables do not call volatile has none (its
 * soil inhalation term is the particulate part alone). A volatile chemical whose parameter-sheet row lacks an input of
 * the engine's factor (H', a diffusivity, or both Koc and Kd) is reported as missing that input.
 */
export function rslVfStatus(id: string): VfStatus {
  const t = tox.get(id);
  const p = phys.get(id);
  if (t === undefined || p === undefined || !t.volatile) return { kind: 'not-volatile' };
  const v = p.values as PhysValues;
  const missing = [
    ...(v.hPrime === undefined ? ["H'"] : []),
    ...(v.dia === undefined ? ['Dia'] : []),
    ...(v.diw === undefined ? ['Diw'] : []),
    ...(v.kd === undefined && v.koc === undefined ? ['Koc and Kd'] : []),
  ];
  if (missing.length > 0) return { kind: 'missing-input', missing };
  const kd = v.kd !== undefined ? v.kd.value : v.koc!.value * RSL_SOIL.foc;
  const result = ssgVolatilizationFactor({
    chemical: { Da: v.dia!.value * 1e-4, Dw: v.diw!.value * 1e-4, H: v.hPrime!.value },
    soil: {
      porosity: 1 - RSL_SOIL.bulkDensity / RSL_SOIL.particleDensity,
      moisture: RSL_SOIL.moisture,
      bulkDensity: RSL_SOIL.bulkDensity,
      kd: kd * 1e-3,
    },
    qOverC: qOverCToSi(RSL_SOIL.qOverCVolatile),
    exposureTime: RSL_SOIL.exposureS,
  });
  // the guide prints pi as 3.14 in the volatilization factor; the engine uses Math.PI, so the test scales the
  // infinite-source factor by sqrt(3.14 / pi) (0.02 percent), which decides a few cells at a rounding edge
  return { kind: 'vf', vf: result.vf * Math.sqrt(RSL_SOIL.pi / Math.PI) };
}

/** Air concentration per unit soil concentration of the soil inhalation term, kg/m^3 per kg/kg: 1/VF + 1/PEF. */
export function soilToAirFactor(id: string, particulateOnly = false): number | null {
  const s = rslVfStatus(id);
  if (s.kind === 'missing-input' && !particulateOnly) return null;
  return (s.kind === 'vf' && !particulateOnly ? 1 / s.vf : 0) + 1 / rslPef();
}

const resident = modernResident();
const worker = modernWorker();

const SCALE: Record<string, number> = { 'ug/L': 1e-6, 'mg/kg': 1e-6, 'ug/m3': 1e-9 };

/** Per-unit-EPC coefficients of one pathway: risk and the hazard quotient of each noncancer group. */
interface Coef {
  risk: number | null;
  hq: Record<string, number> | null;
}

function coefOf(
  pathway: PathwayId,
  receptor: ModernReceptor,
  chem: ModernChemical,
): Coef | 'missing' {
  const cell = modernPathway(pathway, receptor, chem, 1);
  if (!cell.computable) return 'missing';
  return {
    risk: cell.riskPerEpc,
    hq:
      cell.hqByGroup.length === 0
        ? null
        : Object.fromEntries(cell.hqByGroup.map((g) => [g.group, g.hqPerEpc])),
  };
}

/** The water-to-air coefficient of the household term (kg/m^3 air per kg/m^3 water). */
function householdCoefficient(): number {
  return showerHouseholdAir({
    waterConcentration: 1,
    transferFactorLPerM3: HOUSEHOLD_K,
    volatile: true,
  }).coefficient;
}

const levelOf = (
  c: Coef | 'missing',
  endpoint: 'cancer' | 'noncancer',
  scale: number,
): number | null => {
  if (c === 'missing') return null;
  if (endpoint === 'cancer') return c.risk === null || c.risk === 0 ? null : 1e-6 / c.risk / scale;
  if (c.hq === null) return null;
  const top = Math.max(...Object.values(c.hq));
  return top === 0 ? null : 1 / top / scale;
};

/** Sums coefficients: risks add, hazard quotients add within each noncancer group. */
function addCoefs(parts: (Coef | 'missing')[]): Coef {
  let risk: number | null = null;
  let hq: Record<string, number> | null = null;
  for (const p of parts) {
    if (p === 'missing') continue;
    if (p.risk !== null) risk = (risk ?? 0) + p.risk;
    if (p.hq !== null) {
      hq ??= {};
      for (const [g, v] of Object.entries(p.hq)) hq[g] = (hq[g] ?? 0) + v;
    }
  }
  return { risk, hq };
}

export type PathwayName = 'ingestion' | 'dermal' | 'inhalation' | 'total';

/**
 * The engine's coefficient set for one pathway of one medium and receptor. `inhalation` is the
 * resident indoor air level for tap water (divided by K) and for air, and for soil it is
 * the RSL soil inhalation term: the receptor's air coefficient times 1/VF + 1/PEF (`soilToAirFactor`).
 */
export function engineCoef(
  medium: string,
  pathway: PathwayName,
  id: string,
  include: { dermal: boolean; inhalation: boolean; particulateOnly?: boolean; iurFactor?: number },
): Coef | 'missing' | 'not-computed' {
  // `iurFactor` rescales the inhalation unit risk, to test a cell against the rounding of the printed value
  const chemical =
    include.iurFactor === undefined
      ? sweeperOf(id).chemical
      : modernChemical({
          ...boundaryOf(id),
          iur: (boundaryOf(id).iur ?? 0) * include.iurFactor,
        });
  const soil = medium.startsWith('soil');
  const receptor = medium === 'soil-industrial' ? worker : resident;
  const ing: PathwayId = soil ? 'soilIngestion' : 'waterIngestion';
  const derm: PathwayId = soil ? 'soilDermal' : 'waterDermal';
  const inhalation = (): Coef | 'missing' => {
    const c = coefOf('indoorInhalation', resident, chemical);
    if (c === 'missing') return c;
    const k = householdCoefficient();
    return {
      risk: c.risk === null ? null : c.risk * k,
      hq:
        c.hq === null ? null : Object.fromEntries(Object.entries(c.hq).map(([g, v]) => [g, v * k])),
    };
  };
  // the soil inhalation term: the receptor's air coefficient (24 h, 350 d for the resident; 8 h, 250 d for the
  // worker) times the air concentration per unit soil concentration, 1/VF + 1/PEF
  const soilInhalation = (): Coef | 'missing' | 'not-computed' => {
    const c = coefOf('indoorInhalation', receptor, chemical);
    if (c === 'missing') return c;
    const f = soilToAirFactor(id, include.particulateOnly === true);
    if (f === null) return 'not-computed';
    return {
      risk: c.risk === null ? null : c.risk * f,
      hq:
        c.hq === null ? null : Object.fromEntries(Object.entries(c.hq).map(([g, v]) => [g, v * f])),
    };
  };
  switch (pathway) {
    case 'ingestion':
      return coefOf(ing, receptor, chemical);
    case 'dermal':
      return coefOf(derm, receptor, chemical);
    case 'inhalation':
      return soil ? soilInhalation() : inhalation();
    case 'total': {
      const parts = [coefOf(ing, receptor, chemical)];
      if (include.dermal) parts.push(coefOf(derm, receptor, chemical));
      if (include.inhalation) {
        const part = soil ? soilInhalation() : inhalation();
        if (part === 'not-computed') return part;
        parts.push(part);
      }
      return addCoefs(parts);
    }
  }
}

export function engineLevel(
  c: Coef | 'missing' | 'not-computed',
  endpoint: 'cancer' | 'noncancer',
  units: string,
): number | null | 'not-computed' {
  if (c === 'not-computed') return 'not-computed';
  return levelOf(c, endpoint, SCALE[units]!);
}

/** Air levels of the resident (24 h, 350 d) and worker (8 h, 250 d) indoor air receptors, ug/m^3. */
export function engineAirLevel(
  id: string,
  receptorName: 'resident' | 'industrial',
  endpoint: 'cancer' | 'noncancer',
): number | null {
  const { chemical } = sweeperOf(id);
  const c = coefOf('indoorInhalation', receptorName === 'resident' ? resident : worker, chemical);
  return levelOf(c, endpoint, SCALE['ug/m3']!);
}

/** The unrounded published-value comparison of the existing reproductions: half a unit in the second figure. */
export function withinHalfUnit(engine: number, published: number): boolean {
  const unit = 10 ** (Math.floor(Math.log10(published)) - 1);
  return Math.abs(engine - published) <= 0.5 * unit * (1 + 1e-9);
}

// ---- The sweep ----

export type SweepId = 'tapwater' | 'soil-resident' | 'soil-industrial' | 'air';
export const SWEEP_IDS: SweepId[] = ['tapwater', 'soil-resident', 'soil-industrial', 'air'];

/** The class ids a cell can be excepted under, in the order they are tried. */
export const CLASS_IDS = [
  'soil-inhalation-vf-input-missing',
  'soil-total-vf-input-missing',
  'key-g-no-toxicity-value',
  'key-g-fiber-units',
  'iur-printed-three-figures',
] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/**
 * Whether the printed cell can come from an inhalation unit risk that rounds to the printed one. The tables print
 * the unit risk to three significant figures (Aroclor 1242: 5.71E-4), so the value they computed with lies in
 * [5.705E-4, 5.715E-4); the level is monotone in it, so the cell is reachable when the engine's levels at the two
 * ends of that interval span a value that rounds to the printed cell. Only a unit risk printed to at most three
 * figures qualifies, and the engine itself still uses the printed value.
 */
export function reachableWithinPrintedIur(
  id: string,
  medium: string,
  pathway: PathwayName,
  include: { dermal: boolean; inhalation: boolean },
  endpoint: 'cancer' | 'noncancer',
  units: string,
  published: number,
): boolean {
  const iur = boundaryOf(id).iur;
  if (endpoint !== 'cancer' || iur === undefined || iur <= 0) return false;
  if (Number(iur.toPrecision(3)) !== iur) return false;
  const half = 0.5 * 10 ** (Math.floor(Math.log10(iur)) - 2);
  const ends: number[] = [];
  for (const factor of [(iur - half) / iur, (iur + half) / iur]) {
    const level = engineLevel(
      engineCoef(medium, pathway, id, { ...include, iurFactor: factor }),
      endpoint,
      units,
    );
    if (typeof level !== 'number') return false;
    ends.push(level);
  }
  const unit = 10 ** (Math.floor(Math.log10(published)) - 1);
  return Math.min(...ends) <= published + 0.5 * unit && Math.max(...ends) >= published - 0.5 * unit;
}

export interface SweepCounts {
  compared: number;
  reproduced: number;
  excepted: number;
  unexplained: number;
}

export interface SoilInhalationPart {
  compared: number;
  reproduced: number;
  excepted: number;
  unexplained: number;
}
/** The soil inhalation cells and the soil totals that include one, per soil sweep. */
export type SoilInhalationCounts = Record<
  'soil-resident' | 'soil-industrial',
  { inhalation: SoilInhalationPart; totalWithInhalation: SoilInhalationPart }
>;

export interface UnexplainedCell {
  sweep: SweepId;
  column: string;
  chemical: string;
  name: string;
  published: number;
  computed: number | null;
}

export interface SweepResult {
  sweeps: Record<SweepId, SweepCounts>;
  classes: Record<ClassId, { cells: Partial<Record<SweepId, number>>; chemicals: string[] }>;
  unexplained: UnexplainedCell[];
  soilInhalation: SoilInhalationCounts;
  /** The tap water inhalation cells, which test the household factor K. */
  householdK: { cells: number; reproduced: number };
  /** Reproduced cells of the industrial air sweep whose key letter names the endpoint the engine finds governing. */
  keyLetters: { checked: number; agree: number };
}

function sweepOfColumn(column: string): SweepId | null {
  const medium = column.split('.')[0]!;
  if (medium === 'tapwater' || medium === 'soil-resident' || medium === 'soil-industrial') {
    return medium;
  }
  if (medium === 'air-resident' || column === 'summary.air-industrial.governing') return 'air';
  return null;
}

/** Compares every published cell of the swept columns with the engine, and classifies what does not reproduce. */
export function runRslSweep(): SweepResult {
  const sweeps = Object.fromEntries(
    SWEEP_IDS.map((s) => [s, { compared: 0, reproduced: 0, excepted: 0, unexplained: 0 }]),
  ) as Record<SweepId, SweepCounts>;
  const classes = Object.fromEntries(
    CLASS_IDS.map((c) => [c, { cells: {}, chemicals: [] as string[] }]),
  ) as SweepResult['classes'];
  const unexplained: UnexplainedCell[] = [];
  const householdK = { cells: 0, reproduced: 0 };
  const emptyPart = (): SoilInhalationPart => ({
    compared: 0,
    reproduced: 0,
    excepted: 0,
    unexplained: 0,
  });
  const soilInhalation: SoilInhalationCounts = {
    'soil-resident': { inhalation: emptyPart(), totalWithInhalation: emptyPart() },
    'soil-industrial': { inhalation: emptyPart(), totalWithInhalation: emptyPart() },
  };
  const keyLetters = { checked: 0, agree: 0 };

  for (const col of levels.columns) {
    const sweep = sweepOfColumn(col.id);
    if (sweep === null) continue;
    const parts = col.id.split('.');
    const medium = parts[0]!;
    for (const ch of levels.chemicals) {
      const cell = ch.values[col.id];
      if (cell === undefined) continue;
      let computed: number | null | 'not-computed';
      let endpoint: 'cancer' | 'noncancer' | null = null;
      let pathway = '';
      let governingLetter: string | null = null;
      if (col.id === 'summary.air-industrial.governing') {
        const c = engineAirLevel(ch.id, 'industrial', 'cancer');
        const n = engineAirLevel(ch.id, 'industrial', 'noncancer');
        const found = [c, n].filter((x): x is number => x !== null);
        computed = found.length === 0 ? null : Math.min(...found);
        governingLetter = c !== null && (n === null || c <= n) ? 'c' : 'n';
      } else {
        pathway = parts[1]!;
        endpoint = parts[2] as 'cancer' | 'noncancer';
        if (medium === 'air-resident') {
          computed = engineAirLevel(ch.id, 'resident', endpoint);
        } else {
          const has = (p: string): boolean => ch.values[`${medium}.${p}.${endpoint}`] !== undefined;
          computed = engineLevel(
            engineCoef(medium, pathway as PathwayName, ch.id, {
              dermal: has('dermal'),
              inhalation: has('inhalation'),
            }),
            endpoint,
            col.units,
          );
        }
      }
      const counts = sweeps[sweep];
      counts.compared += 1;
      let part: SoilInhalationPart | null = null;
      if (medium === 'soil-resident' || medium === 'soil-industrial') {
        if (pathway === 'inhalation') part = soilInhalation[medium].inhalation;
        else if (
          pathway === 'total' &&
          endpoint !== null &&
          ch.values[`${medium}.inhalation.${endpoint}`] !== undefined
        ) {
          part = soilInhalation[medium].totalWithInhalation;
        }
      }
      if (part !== null) part.compared += 1;
      const isHousehold = medium === 'tapwater' && pathway === 'inhalation';
      if (isHousehold) householdK.cells += 1;
      if (typeof computed === 'number' && withinHalfUnit(computed, cell.value)) {
        counts.reproduced += 1;
        if (part !== null) part.reproduced += 1;
        if (isHousehold) householdK.reproduced += 1;
        if (governingLetter !== null) {
          keyLetters.checked += 1;
          if ((cell.key ?? '')[0] === governingLetter) keyLetters.agree += 1;
        }
        continue;
      }

      const summaryKeys = Object.entries(ch.values)
        .filter(([id]) => id.startsWith('summary.'))
        .map(([, v]) => v.key ?? '');
      const keyG = summaryKeys.some((k) => k.includes('G'));
      let cls: ClassId | null = null;
      if (computed === 'not-computed' && part !== null) {
        // the engine's volatilization factor has no input for this chemical; the class stands only when the
        // particulate-only level reproduces the printed cell (the tables then applied no volatilization factor)
        const alt = engineLevel(
          engineCoef(medium, pathway as PathwayName, ch.id, {
            dermal: ch.values[`${medium}.dermal.${endpoint}`] !== undefined,
            inhalation: true,
            particulateOnly: true,
          }),
          endpoint!,
          col.units,
        );
        if (typeof alt === 'number' && withinHalfUnit(alt, cell.value)) {
          cls =
            pathway === 'inhalation'
              ? 'soil-inhalation-vf-input-missing'
              : 'soil-total-vf-input-missing';
        }
      } else if (keyG && computed === null) cls = 'key-g-no-toxicity-value';
      else if (keyG) cls = 'key-g-fiber-units';
      else if (
        typeof computed === 'number' &&
        endpoint === 'cancer' &&
        medium !== 'air-resident' &&
        (pathway === 'inhalation' || pathway === 'total') &&
        reachableWithinPrintedIur(
          ch.id,
          medium,
          pathway as PathwayName,
          {
            dermal: ch.values[`${medium}.dermal.${endpoint}`] !== undefined,
            inhalation: ch.values[`${medium}.inhalation.${endpoint}`] !== undefined,
          },
          endpoint,
          col.units,
          cell.value,
        )
      ) {
        cls = 'iur-printed-three-figures';
      }

      if (cls !== null) {
        counts.excepted += 1;
        if (part !== null) part.excepted += 1;
        const entry = classes[cls];
        entry.cells[sweep] = (entry.cells[sweep] ?? 0) + 1;
        if (!entry.chemicals.includes(ch.name)) entry.chemicals.push(ch.name);
      } else {
        counts.unexplained += 1;
        if (part !== null) part.unexplained += 1;
        unexplained.push({
          sweep,
          column: col.id,
          chemical: ch.id,
          name: ch.name,
          published: cell.value,
          computed: typeof computed === 'number' ? Number(computed.toPrecision(4)) : null,
        });
      }
    }
  }
  return { sweeps, classes, unexplained, soilInhalation, householdK, keyLetters };
}
