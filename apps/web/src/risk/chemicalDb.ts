import type {
  ChemicalEntry,
  ChemicalsFile,
  ToxEntry,
  ToxFile,
  ToxValue,
} from '@model-flow/data/rsl-types';

/** One chemical: its toxicity row and its physical-property row, joined by the database id. */
export interface ChemicalRecord {
  id: string;
  cas?: string;
  name: string;
  tox: ToxEntry;
  phys: ChemicalEntry | undefined;
}

export interface ChemicalDb {
  edition: string;
  /** Source key (one letter) to the name of the source, from the RSL. */
  sourceKeys: Record<string, string>;
  chemicals: ChemicalRecord[];
  byId: Map<string, ChemicalRecord>;
}

export function buildDb(chem: ChemicalsFile, tox: ToxFile): ChemicalDb {
  const phys = new Map(chem.chemicals.map((c) => [c.id, c]));
  const chemicals = tox.toxicity.map((t): ChemicalRecord => {
    const rec: ChemicalRecord = { id: t.id, name: t.name, tox: t, phys: phys.get(t.id) };
    if (t.cas !== undefined) rec.cas = t.cas;
    return rec;
  });
  return {
    edition: tox.edition,
    sourceKeys: tox.sourceKeys,
    chemicals,
    byId: new Map(chemicals.map((c) => [c.id, c])),
  };
}

let loading: Promise<ChemicalDb> | null = null;

/**
 * Loads the generated RSL files on first use. They are dynamic imports, so the bundler puts the
 * roughly 1.5 MB of JSON in chunks of their own and the main bundle never carries them.
 */
export function loadChemicalDb(): Promise<ChemicalDb> {
  loading ??= Promise.all([
    import('@model-flow/data/generated/rsl-2024-11/chemicals.json'),
    import('@model-flow/data/generated/rsl-2024-11/tox.json'),
  ]).then(([c, t]) =>
    buildDb(c.default as unknown as ChemicalsFile, t.default as unknown as ToxFile),
  );
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** Name or CAS matches, names starting with the query first, then shorter names, capped at `limit`. */
export function searchChemicals(db: ChemicalDb, query: string, limit = 25): ChemicalRecord[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const hits: { rec: ChemicalRecord; rank: number }[] = [];
  for (const rec of db.chemicals) {
    const name = rec.name.toLowerCase();
    const at = name.indexOf(q);
    if (at >= 0) {
      hits.push({ rec, rank: at === 0 ? 0 : 1 });
    } else if (rec.cas !== undefined && rec.cas.includes(q)) {
      hits.push({ rec, rank: rec.cas.startsWith(q) ? 0 : 1 });
    }
  }
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.rec.name.length - b.rec.name.length ||
      a.rec.name.localeCompare(b.rec.name),
  );
  return hits.slice(0, limit).map((h) => h.rec);
}

export interface ToxRow {
  key: 'sfo' | 'iur' | 'rfdo' | 'rfci';
  label: string;
  value: number;
  unit: string;
  /** Name of the source, from the RSL key; the key itself when the RSL does not define it. */
  source: string;
}

const TOX_ROWS: { key: ToxRow['key']; label: string; unit: string }[] = [
  { key: 'sfo', label: 'Oral slope factor', unit: '(mg/kg-d)^-1' },
  { key: 'iur', label: 'Inhalation unit risk', unit: '(ug/m3)^-1' },
  { key: 'rfdo', label: 'Oral reference dose', unit: 'mg/kg-d' },
  { key: 'rfci', label: 'Inhalation reference concentration', unit: 'mg/m3' },
];

/** The toxicity values the RSL gives for a chemical, each with its source. Absent values are absent. */
export function toxRows(rec: ChemicalRecord, sourceKeys: Record<string, string>): ToxRow[] {
  const out: ToxRow[] = [];
  for (const { key, label, unit } of TOX_ROWS) {
    const v: ToxValue | undefined = rec.tox[key];
    if (v === undefined) continue;
    out.push({ key, label, unit, value: v.value, source: sourceKeys[v.source] ?? v.source });
  }
  return out;
}
