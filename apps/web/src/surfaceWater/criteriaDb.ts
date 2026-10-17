import type { Criterion, CriterionUnit, HardnessEquation } from '@model-flow/engine';
import type {
  AquaticFile,
  AquaticRow,
  CriterionCell,
  HardnessFile,
  HumanHealthFile,
} from '@model-flow/data/nrwqc-types';
import type { BenchmarkFile } from '@model-flow/data/sediment-types';

export interface CriteriaChemical {
  /** Hyphenated CAS number, or the table's slug for a parameter. */
  id: string;
  name: string;
  hasSurfaceWater: boolean;
  hasSediment: boolean;
}

export interface CriteriaDb {
  nrwqcEdition: string;
  sedimentEdition: string;
  criteria: Criterion[];
  chemicals: CriteriaChemical[];
  byChemical: Map<string, Criterion[]>;
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

export function buildCriteriaDb(
  aq: AquaticFile,
  hh: HumanHealthFile,
  hardness: HardnessFile,
  bench: BenchmarkFile,
): CriteriaDb {
  const equations = new Map(hardness.metals.map((m) => [m.id, m.freshwater]));
  const criteria = [...aquatic(aq.rows, equations), ...humanHealth(hh), ...sediment(bench)];
  const byChemical = new Map<string, Criterion[]>();
  for (const c of criteria) {
    const list = byChemical.get(c.chemicalId);
    if (list) list.push(c);
    else byChemical.set(c.chemicalId, [c]);
  }
  const names = new Map<string, string>();
  for (const r of [...aq.rows, ...hh.rows]) if (!names.has(r.id)) names.set(r.id, r.name);
  for (const r of bench.rows) if (!names.has(r.chemicalId)) names.set(r.chemicalId, r.name);
  const chemicals = [...byChemical.entries()]
    .map(([id, list]): CriteriaChemical => ({
      id,
      name: names.get(id) ?? id,
      hasSurfaceWater: list.some((c) => c.medium === 'surfaceWater'),
      hasSediment: list.some((c) => c.medium === 'sediment'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    nrwqcEdition: aq.source.pageDate,
    sedimentEdition: bench.edition,
    criteria,
    chemicals,
    byChemical,
  };
}

let loading: Promise<CriteriaDb> | null = null;

/**
 * Loads the generated criteria files on first use. They are dynamic imports, so the bundler puts each
 * JSON file in a chunk of its own and neither the main bundle nor the surface water screen carries them
 * until a chemical is chosen.
 */
export function loadCriteriaDb(): Promise<CriteriaDb> {
  loading ??= Promise.all([
    import('@model-flow/data/generated/nrwqc-2026-10-16/aquatic.json'),
    import('@model-flow/data/generated/nrwqc-2026-10-16/human-health.json'),
    import('@model-flow/data/generated/nrwqc-2026-10-16/hardness.json'),
    import('@model-flow/data/generated/sediment-2026-10-16/benchmarks.json'),
  ]).then(([a, h, w, s]) =>
    buildCriteriaDb(
      a.default as unknown as AquaticFile,
      h.default as unknown as HumanHealthFile,
      w.default as unknown as HardnessFile,
      s.default as unknown as BenchmarkFile,
    ),
  );
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
  hits.sort(
    (a, b) =>
      a.rank - b.rank || a.c.name.length - b.c.name.length || a.c.name.localeCompare(b.c.name),
  );
  return hits.slice(0, limit).map((h) => h.c);
}
