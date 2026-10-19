import type { ChemicalEntry, ChemicalsFile, ToxEntry, ToxFile } from '@model-flow/data/rsl-types';
import type { CsvColumn, CsvRow } from '../export/csv';

export type BrowseGroup = 'Physical-chemical' | 'Toxicity';

/** One value of one chemical, as shown on the screen and written to the CSV. */
export interface BrowseRow {
  group: BrowseGroup;
  key: string;
  label: string;
  /** Numeric value as the data file has it; absent for a flag. */
  value?: number;
  /** The text shown: the value at full precision, or Yes or No for a flag. */
  text: string;
  unit: string;
  /** The reference or source for this value. */
  source: string;
}

export interface BrowseRecord {
  id: string;
  cas?: string;
  name: string;
  rows: BrowseRow[];
}

export interface BrowseDb {
  edition: string;
  retrieved: string;
  records: BrowseRecord[];
}

const PHYS_LABELS: Record<string, string> = {
  mw: 'Molecular weight',
  hPrime: "Henry's law constant, dimensionless",
  hlc: "Henry's law constant",
  vp: 'Vapor pressure',
  mp: 'Melting point',
  density: 'Density',
  dia: 'Diffusivity in air',
  diw: 'Diffusivity in water',
  kd: 'Soil-water partition coefficient (Kd)',
  koc: 'Organic carbon partition coefficient (Koc)',
  logKow: 'Log octanol-water partition coefficient (log Kow)',
  s: 'Water solubility',
  b: 'Dermal B (RAGS Part E)',
  tauEvent: 'Dermal event lag time (tau event)',
  tStar: 'Dermal time to steady state (t*)',
  kp: 'Dermal permeability coefficient (Kp)',
};

const TOX_LABELS: { key: 'sfo' | 'iur' | 'rfdo' | 'rfci'; label: string }[] = [
  { key: 'sfo', label: 'Oral slope factor' },
  { key: 'iur', label: 'Inhalation unit risk' },
  { key: 'rfdo', label: 'Oral reference dose' },
  { key: 'rfci', label: 'Inhalation reference concentration' },
];

const NO_REF = 'not stated';
const RSL_TABLE = 'RSL table (no per-value reference)';

function unitText(u: string | undefined): string {
  return u === undefined ? '' : u === '1' ? 'dimensionless' : u;
}

function physRows(entry: ChemicalEntry | undefined, units: ChemicalsFile['units']): BrowseRow[] {
  if (entry === undefined) return [];
  const rows: BrowseRow[] = [];
  for (const [key, v] of Object.entries(entry.values)) {
    rows.push({
      group: 'Physical-chemical',
      key,
      label: PHYS_LABELS[key] ?? key,
      value: v.value,
      text: String(v.value),
      unit: unitText(units[key as keyof typeof units]),
      source: v.ref ?? NO_REF,
    });
  }
  if (entry.fa !== undefined) {
    rows.push({
      group: 'Physical-chemical',
      key: 'fa',
      label: 'Fraction absorbed in water',
      value: entry.fa,
      text: String(entry.fa),
      unit: 'dimensionless',
      source: RSL_TABLE,
    });
  }
  return rows;
}

function toxRowsFor(t: ToxEntry, file: ToxFile): BrowseRow[] {
  const rows: BrowseRow[] = [];
  for (const { key, label } of TOX_LABELS) {
    const v = t[key];
    if (v === undefined) continue;
    rows.push({
      group: 'Toxicity',
      key,
      label,
      value: v.value,
      text: String(v.value),
      unit: file.units[key],
      source: file.sourceKeys[v.source] ?? v.source,
    });
  }
  const flag = (key: string, label: string, on: boolean): BrowseRow => ({
    group: 'Toxicity',
    key,
    label,
    text: on ? 'Yes' : 'No',
    unit: '',
    source: RSL_TABLE,
  });
  rows.push(flag('volatile', 'Volatile', t.volatile), flag('mutagen', 'Mutagen', t.mutagen));
  const num = (key: string, label: string, value: number | undefined, unit: string): void => {
    if (value === undefined) return;
    rows.push({
      group: 'Toxicity',
      key,
      label,
      value,
      text: String(value),
      unit,
      source: RSL_TABLE,
    });
  };
  num('giabs', 'Gastrointestinal absorption fraction', t.giabs, 'dimensionless');
  num('absd', 'Dermal absorption fraction from soil', t.absd, 'dimensionless');
  num('csat', 'Soil saturation concentration', t.csat, file.units.csat);
  num(
    'mcl',
    t.mclGroup ? 'Maximum contaminant level (group value)' : 'Maximum contaminant level',
    t.mcl,
    t.mclUnit ?? file.units.mcl,
  );
  return rows;
}

/** Joins the physical-property file and the toxicity file by id; one record per toxicity entry. */
export function buildBrowse(full: ChemicalsFile, tox: ToxFile): BrowseDb {
  const phys = new Map(full.chemicals.map((c) => [c.id, c]));
  const records = tox.toxicity.map((t): BrowseRecord => {
    const rec: BrowseRecord = {
      id: t.id,
      name: t.name,
      rows: [...physRows(phys.get(t.id), full.units), ...toxRowsFor(t, tox)],
    };
    if (t.cas !== undefined) rec.cas = t.cas;
    return rec;
  });
  return { edition: tox.edition, retrieved: tox.source.retrieved, records };
}

/** Records whose name or CAS number contains the query (case blind); all of them for an empty query. */
export function filterBrowse(db: BrowseDb, query: string): BrowseRecord[] {
  const q = query.trim().toLowerCase();
  if (q === '') return db.records;
  return db.records.filter(
    (r) => r.name.toLowerCase().includes(q) || (r.cas !== undefined && r.cas.includes(q)),
  );
}

export const browseCsvColumns: readonly CsvColumn[] = [
  { key: 'chemical', header: 'Chemical' },
  { key: 'cas', header: 'CAS' },
  { key: 'group', header: 'Group' },
  { key: 'property', header: 'Property' },
  { key: 'value', header: 'Value' },
  { key: 'unit', header: 'Unit' },
  { key: 'source', header: 'Source' },
];

/** One CSV row per value; flags are written as Yes or No text, numbers at full precision. */
export function browseCsvRows(records: readonly BrowseRecord[]): CsvRow[] {
  return records.flatMap((r) =>
    r.rows.map((x) => ({
      chemical: r.name,
      cas: r.cas ?? '',
      group: x.group,
      property: x.label,
      value: x.value ?? x.text,
      unit: x.unit,
      source: x.source,
    })),
  );
}
