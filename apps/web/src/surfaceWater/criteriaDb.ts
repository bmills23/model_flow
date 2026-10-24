import type { Criterion, CriterionUnit, HardnessEquation } from '@model-flow/engine';
import type {
  AquaticFile,
  AquaticRow,
  CriterionCell,
  HardnessFile,
  HumanHealthFile,
} from '@model-flow/data/nrwqc-types';
import type { BenchmarkFile, BenchmarkRow } from '@model-flow/data/sediment-types';
import type { CriteriaPointer, CriteriaSetId } from '@model-flow/data/criteria-types';
import type { CriteriaSetChoice } from './criteriaSetChoice';

export interface CriteriaChemical {
  /** Hyphenated CAS number, or the table's slug for a parameter. */
  id: string;
  name: string;
  hasSurfaceWater: boolean;
  hasSediment: boolean;
  /** Set only for a chemical the set prints no row for because its text points it to a group row. */
  coveredBy?: string;
}

/** A printed pointer from a chemical to a group row, with the label of the set that prints it. */
export interface CoveredInfo extends CriteriaPointer {
  setLabel: string;
}

/** What the screen shows beside a criterion: its set, basis, medium and the table it was read from. */
export interface CriterionInfo {
  set: 'us' | CriteriaSetId;
  setLabel: string;
  /** The basis in words: acute or chronic, annual average, protection level, TEC and so on. */
  basis: string;
  medium: Criterion['medium'];
  waterType?: 'fresh' | 'salt';
  /** The table, page or worksheet cell the value was read from. */
  source: string;
  /** A condition or note the source prints with the value (a hardness class, a bioavailable fraction). */
  condition?: string;
  /** The value and unit as printed, when the unit was converted. */
  printed?: string;
  year?: number;
  reliability?: string;
}

/** One source line for the note under the selector. */
export interface CriteriaSourceNote {
  set: 'us' | CriteriaSetId;
  label: string;
  /** The edition or retrieval date as a short phrase. */
  edition: string;
}

export interface CriteriaDb {
  /** The choice this database was assembled for. */
  set: CriteriaSetChoice;
  nrwqcEdition: string;
  sedimentEdition: string;
  criteria: Criterion[];
  chemicals: CriteriaChemical[];
  byChemical: Map<string, Criterion[]>;
  /** Basis, medium and source of every criterion, by criterion id. */
  info: Map<string, CriterionInfo>;
  /** Chemicals the chosen set points to a group row, by chemical id (a chemical with rows of its own is not here). */
  covered: Map<string, CoveredInfo>;
  /** Media the chosen sets have values for. */
  media: Criterion['medium'][];
  sources: CriteriaSourceNote[];
}

const WATER_UNITS = new Set(['ug/L', 'mg/L']);

function cellUnit(cell: CriterionCell): CriterionUnit | null {
  const u = cell.unit ?? 'ug/L';
  return WATER_UNITS.has(u) ? (u as CriterionUnit) : null;
}

function aquatic(
  rows: readonly AquaticRow[],
  equations: Map<string, { acute?: HardnessEquation; chronic?: HardnessEquation }>,
): Criterion[] {
  const out: Criterion[] = [];
  for (const row of rows) {
    const dissolved = /dissolved/i.test(row.notes);
    for (const [waterType, label, cols] of [
      ['fresh', 'freshwater', row.freshwater],
      ['salt', 'saltwater', row.saltwater],
    ] as const) {
      for (const [col, kind] of [
        ['cmc', 'acute'],
        ['ccc', 'chronic'],
      ] as const) {
        const cell = cols[col];
        const base = {
          id: `aquatic:${row.id}:${label}-${kind}`,
          chemicalId: row.id,
          medium: 'surfaceWater' as const,
          endpoint: `aquatic-${label}-${kind}`,
          waterType,
          source: 'database' as const,
          ...(dissolved ? { dissolved: true } : {}),
          ...(row.printedAtPh !== undefined && row.phDependentFor.includes(waterType)
            ? { printedAtPh: row.printedAtPh }
            : {}),
        };
        const eq = waterType === 'fresh' ? equations.get(row.id)?.[kind] : undefined;
        if (eq !== undefined) {
          out.push({ ...base, unit: 'ug/L', hardness: eq, dissolved: true });
        } else if (cell.status === 'value' && cell.value !== undefined) {
          const unit = cellUnit(cell);
          if (unit !== null) out.push({ ...base, value: cell.value, unit });
        } else if (row.siteSpecific && row.siteSpecificFor.includes(waterType)) {
          out.push({ ...base, unit: 'ug/L', siteSpecific: true });
        }
      }
    }
  }
  return out;
}

function humanHealth(file: HumanHealthFile): Criterion[] {
  const out: Criterion[] = [];
  for (const row of file.rows) {
    for (const [key, endpoint] of [
      ['waterAndOrganism', 'human-health-water-organism'],
      ['organismOnly', 'human-health-organism-only'],
    ] as const) {
      const cell = row[key];
      if (cell.status !== 'value' || cell.value === undefined) continue;
      const unit = cellUnit(cell);
      if (unit === null) continue;
      out.push({
        id: `hh:${row.id}:${endpoint}`,
        chemicalId: row.id,
        medium: 'surfaceWater',
        endpoint,
        value: cell.value,
        unit,
        source: 'database',
      });
    }
  }
  return out;
}

function sediment(file: BenchmarkFile): Criterion[] {
  return file.rows.map((r): Criterion => ({
    id: `sediment:${r.id}`,
    chemicalId: r.chemicalId,
    medium: 'sediment',
    endpoint: r.variant ? `${r.endpoint} (${r.variant})` : r.endpoint,
    value: r.value,
    unit: r.unit,
    ...(r.ocBasis !== undefined ? { ocBasis: r.ocBasis } : {}),
    ...(r.waterType !== undefined ? { waterType: r.waterType } : {}),
    source: 'database',
  }));
}

const US_LABEL = 'United States (EPA)';

const AQUATIC_BASIS: Record<string, string> = {
  acute: 'acute (criterion maximum concentration, CMC)',
  chronic: 'chronic (criterion continuous concentration, CCC)',
};

const R4_BASIS: Record<string, string> = {
  'region4-freshwater-screening': 'screening value, freshwater',
  'region4-freshwater-refinement': 'refinement value, freshwater',
  'region4-marine-screening': 'screening value, marine',
  'region4-marine-refinement': 'refinement value, marine',
  'region4-pah-toxic-unit-refinement': 'PAH toxic unit refinement value',
};

/** Basis, medium and source of each US criterion, read from its id and endpoint and from its source row. */
function usInfo(
  criteria: readonly Criterion[],
  aq: AquaticFile,
  hh: HumanHealthFile,
  bench: BenchmarkFile,
): Map<string, CriterionInfo> {
  const rows = new Map<string, BenchmarkRow>(bench.rows.map((r) => [`sediment:${r.id}`, r]));
  const out = new Map<string, CriterionInfo>();
  for (const c of criteria) {
    const waterType = c.waterType;
    const wt = waterType === undefined ? {} : { waterType };
    if (c.id.startsWith('aquatic:')) {
      const kind = c.endpoint.endsWith('acute') ? 'acute' : 'chronic';
      out.set(c.id, {
        set: 'us',
        setLabel: US_LABEL,
        basis: `${AQUATIC_BASIS[kind]!}, ${waterType === 'salt' ? 'saltwater' : 'freshwater'}`,
        medium: c.medium,
        ...wt,
        source: `National Recommended Water Quality Criteria, aquatic life table (page of ${aq.source.pageDate})`,
        ...(c.hardness !== undefined
          ? { condition: 'Computed from the hardness equation at the hardness entered.' }
          : {}),
      });
    } else if (c.id.startsWith('hh:')) {
      out.set(c.id, {
        set: 'us',
        setLabel: US_LABEL,
        basis:
          c.endpoint === 'human-health-organism-only'
            ? 'human health, consumption of organisms only'
            : 'human health, consumption of water and organisms',
        medium: c.medium,
        source: `National Recommended Water Quality Criteria, human health table (page of ${hh.source.pageDate})`,
      });
    } else {
      const r = rows.get(c.id);
      out.set(c.id, {
        set: 'us',
        setLabel: US_LABEL,
        basis: `${R4_BASIS[r?.endpoint ?? ''] ?? c.endpoint}${r?.variant ? ` (${r.variant})` : ''}${r?.ocBasis !== undefined ? ', at 1 percent organic carbon' : ''}`,
        medium: c.medium,
        ...wt,
        source: `Region 4 Ecological Risk Assessment Supplemental Guidance (2018), Table ${r?.table ?? ''}${r?.page !== undefined ? `, p. ${r.page}` : ''}`,
      });
    }
  }
  return out;
}

/** Everything a database is made of: the criteria and their info, and the names for the chemical list. */
export interface DbParts {
  criteria: Criterion[];
  info: Map<string, CriterionInfo>;
  /** Chemical id to name; the first name given for an id is kept. */
  names: Map<string, string>;
  /** Printed pointers from a chemical to a group row (eu2026 PFOS), by chemical id. */
  covered?: Map<string, CoveredInfo>;
  sources: CriteriaSourceNote[];
  nrwqcEdition: string;
  sedimentEdition: string;
}

export function assembleDb(set: CriteriaSetChoice, parts: DbParts): CriteriaDb {
  const byChemical = new Map<string, Criterion[]>();
  for (const c of parts.criteria) {
    const list = byChemical.get(c.chemicalId);
    if (list) list.push(c);
    else byChemical.set(c.chemicalId, [c]);
  }
  const chemicals = [...byChemical.entries()]
    .map(([id, list]): CriteriaChemical => ({
      id,
      name: parts.names.get(id) ?? id,
      hasSurfaceWater: list.some((c) => c.medium === 'surfaceWater'),
      hasSediment: list.some((c) => c.medium === 'sediment'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const media = (['surfaceWater', 'sediment'] as const).filter((m) =>
    parts.criteria.some((c) => c.medium === m),
  );
  return {
    set,
    nrwqcEdition: parts.nrwqcEdition,
    sedimentEdition: parts.sedimentEdition,
    criteria: parts.criteria,
    chemicals,
    byChemical,
    info: parts.info,
    covered: new Map([...(parts.covered ?? [])].filter(([id]) => !byChemical.has(id))),
    media,
    sources: parts.sources,
  };
}

/** The US parts: the NRWQC aquatic life and human health criteria and the Region 4 sediment benchmarks. */
export function usParts(
  aq: AquaticFile,
  hh: HumanHealthFile,
  hardness: HardnessFile,
  bench: BenchmarkFile,
): DbParts {
  const equations = new Map(hardness.metals.map((m) => [m.id, m.freshwater]));
  const criteria = [...aquatic(aq.rows, equations), ...humanHealth(hh), ...sediment(bench)];
  const names = new Map<string, string>();
  for (const r of [...aq.rows, ...hh.rows]) if (!names.has(r.id)) names.set(r.id, r.name);
  for (const r of bench.rows) if (!names.has(r.chemicalId)) names.set(r.chemicalId, r.name);
  return {
    criteria,
    info: usInfo(criteria, aq, hh, bench),
    names,
    sources: [
      {
        set: 'us',
        label: 'EPA national recommended water quality criteria',
        edition: `page of ${aq.source.pageDate}`,
      },
      {
        set: 'us',
        label: 'EPA Region 4 sediment benchmarks',
        edition: `edition of ${bench.edition}`,
      },
    ],
    nrwqcEdition: aq.source.pageDate,
    sedimentEdition: bench.edition,
  };
}

export function buildCriteriaDb(
  aq: AquaticFile,
  hh: HumanHealthFile,
  hardness: HardnessFile,
  bench: BenchmarkFile,
): CriteriaDb {
  return assembleDb('us', usParts(aq, hh, hardness, bench));
}

let usLoading: Promise<DbParts> | null = null;

/**
 * Loads the generated US criteria files on first use. They are dynamic imports, so the bundler puts each
 * JSON file in a chunk of its own and neither the main bundle nor the surface water screen carries them
 * until a chemical is chosen.
 */
export function loadUsParts(): Promise<DbParts> {
  usLoading ??= Promise.all([
    import('@model-flow/data/generated/nrwqc-2026-10-16/aquatic.json'),
    import('@model-flow/data/generated/nrwqc-2026-10-16/human-health.json'),
    import('@model-flow/data/generated/nrwqc-2026-10-16/hardness.json'),
    import('@model-flow/data/generated/sediment-2026-10-16/benchmarks.json'),
  ]).then(([a, h, w, s]) =>
    usParts(
      a.default as unknown as AquaticFile,
      h.default as unknown as HumanHealthFile,
      w.default as unknown as HardnessFile,
      s.default as unknown as BenchmarkFile,
    ),
  );
  usLoading.catch(() => {
    usLoading = null;
  });
  return usLoading;
}

let loading: Promise<CriteriaDb> | null = null;

/** The US criteria database: the default set, and the one the cleanup screens read. */
export function loadCriteriaDb(): Promise<CriteriaDb> {
  loading ??= loadUsParts().then((p) => assembleDb('us', p));
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export function criteriaFor(
  db: CriteriaDb,
  chemicalId: string,
  medium: Criterion['medium'],
): Criterion[] {
  return (db.byChemical.get(chemicalId) ?? []).filter((c) => c.medium === medium);
}

/** Name or CAS matches, names starting with the query first, capped at `limit`. */
export function searchCriteriaChemicals(
  db: CriteriaDb,
  query: string,
  limit = 25,
): CriteriaChemical[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const hits: { c: CriteriaChemical; rank: number }[] = [];
  for (const c of db.chemicals) {
    const name = c.name.toLowerCase();
    const at = name.indexOf(q);
    if (at >= 0) hits.push({ c, rank: at === 0 ? 0 : 1 });
    else if (c.id.includes(q)) hits.push({ c, rank: 1 });
  }
  for (const [id, p] of db.covered) {
    const name = p.name.toLowerCase();
    const at = name.indexOf(q);
    if (at < 0 && !id.includes(q)) continue;
    hits.push({
      c: {
        id,
        name: p.name,
        hasSurfaceWater: true,
        hasSediment: false,
        coveredBy: `${p.group.name}, entry ${p.group.entry}`,
      },
      rank: at === 0 ? 0 : 1,
    });
  }
  hits.sort(
    (a, b) =>
      a.rank - b.rank || a.c.name.length - b.c.name.length || a.c.name.localeCompare(b.c.name),
  );
  return hits.slice(0, limit).map((h) => h.c);
}
