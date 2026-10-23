import {
  modernChemical,
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
 * resident indoor air level for tap water (divided by K) and for air, and is not computed for soil
 * (the soil inhalation terms need the volatilization and particulate emission factors, which are not shipped).
 */
export function engineCoef(
  medium: string,
  pathway: PathwayName,
  id: string,
  include: { dermal: boolean; inhalation: boolean },
): Coef | 'missing' | 'not-computed' {
  const { chemical } = sweeperOf(id);
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
  switch (pathway) {
    case 'ingestion':
      return coefOf(ing, receptor, chemical);
    case 'dermal':
      return coefOf(derm, receptor, chemical);
    case 'inhalation':
      return soil ? 'not-computed' : inhalation();
    case 'total': {
      if (soil && include.inhalation) return 'not-computed';
      const parts = [coefOf(ing, receptor, chemical)];
      if (include.dermal) parts.push(coefOf(derm, receptor, chemical));
      if (!soil && include.inhalation) parts.push(inhalation());
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
  'soil-inhalation-not-computed',
  'soil-total-with-inhalation-not-computed',
  'key-g-no-toxicity-value',
  'key-g-fiber-units',
] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export interface SweepCounts {
  compared: number;
  reproduced: number;
  excepted: number;
  unexplained: number;
}

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
      const isHousehold = medium === 'tapwater' && pathway === 'inhalation';
      if (isHousehold) householdK.cells += 1;
      if (typeof computed === 'number' && withinHalfUnit(computed, cell.value)) {
        counts.reproduced += 1;
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
      if (medium.startsWith('soil') && pathway === 'inhalation') {
        cls = 'soil-inhalation-not-computed';
      } else if (
        medium.startsWith('soil') &&
        pathway === 'total' &&
        endpoint !== null &&
        ch.values[`${medium}.inhalation.${endpoint}`] !== undefined
      ) {
        cls = 'soil-total-with-inhalation-not-computed';
      } else if (keyG && computed === null) cls = 'key-g-no-toxicity-value';
      else if (keyG) cls = 'key-g-fiber-units';

      if (cls !== null) {
        counts.excepted += 1;
        const entry = classes[cls];
        entry.cells[sweep] = (entry.cells[sweep] ?? 0) + 1;
        if (!entry.chemicals.includes(ch.name)) entry.chemicals.push(ch.name);
      } else {
        counts.unexplained += 1;
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
  return { sweeps, classes, unexplained, householdK, keyLetters };
}
