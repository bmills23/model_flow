/** The international aquatic and sediment criteria sets built in wave V (DECISIONS, "Wave V scope", rulings 3 to 5). */
export type CriteriaSetId = 'ccme' | 'eu' | 'uk' | 'anzg' | 'macdonald2000';

export const CRITERIA_SET_IDS: readonly CriteriaSetId[] = [
  'ccme',
  'eu',
  'uk',
  'anzg',
  'macdonald2000',
];

export type CriteriaUnit = 'ug/L' | 'mg/L' | 'ug/kg' | 'mg/kg';

/** How the chemical id of a row was found: the CAS number the source prints, a name match, or a slug of the name. */
export type IdBy = 'cas' | 'name-join' | 'name';

/**
 * One criterion of an international set, shaped like the engine `Criterion` record (medium, endpoint, value,
 * unit, waterType) plus the basis, source table and notes of the row.
 */
export interface CriteriaRow {
  /** Unique within the set. */
  id: string;
  set: CriteriaSetId;
  /** Hyphenated CAS number, else the id of the same chemical in the Region 4 or NRWQC file, else a slug of the name. */
  chemicalId: string;
  idBy: IdBy;
  /** The chemical name as the source prints it. */
  name: string;
  cas: string | null;
  /** The CAS number as the source prints it, when the build corrected its form. */
  casPrinted?: string;
  /** The printed CAS number fails its check digit and is kept as printed. */
  casUnverified?: true;
  medium: 'surfaceWater' | 'sediment';
  waterType: 'fresh' | 'salt';
  /** The basis as the source prints it (long-term, ISQG, AA-EQS inland, 95 percent species protection, TEC). */
  basis: string;
  /** The basis in words for the screen. */
  basisLabel: string;
  /** For example `ccme-fresh-long-term`; the engine criterion endpoint. */
  endpoint: string;
  /** In `unit`; absent when the source gives only an equation or a site-specific rule (siteSpecific is then true). */
  value?: number;
  unit: CriteriaUnit;
  /** The value as the source prints it, and the unit as printed (before any conversion). */
  printedValue?: string;
  printedUnit: string;
  siteSpecific?: true;
  /** The table, page or worksheet cell the value was read from. */
  table: string;
  /** Index into the file's `notes` list, when the row has a note. */
  note?: number;
  /** ANZG: reliability class. */
  reliability?: string;
  /** CCME and ANZG: the year the value was published. */
  year?: number;
}

export interface CriteriaSource {
  title: string;
  /** Keys in packages/engine/src/references/references.json. */
  references: string[];
  url: string;
  /** Date of the edition or table as the source prints it; absent where it prints none. */
  pageDate?: string;
  /** Date the values were fetched and transcribed, ISO 8601. */
  retrieved: string;
  /** Terms of reuse as read from the source, and what ships because of them. */
  terms: string;
  termsUrl: string;
  /** The raw source file is committed under the manifest (its terms allow redistribution). */
  redistributed: boolean;
  /** SHA-256 of the fetched source file, committed or not. */
  sourceSha256: string;
  /** Where the transcribed CSV the build reads is committed. */
  csv: string;
}

export interface CriteriaSetFile {
  set: CriteriaSetId;
  /** Directory-level edition label of the generated files. */
  edition: string;
  label: string;
  /** Media the set has values for. */
  media: ('surfaceWater' | 'sediment')[];
  source: CriteriaSource;
  /** Notes shared by rows (a note is printed once). */
  notes: string[];
  /** Counts of rows the build left out and why (a narrative guideline has no number). */
  omitted: Record<string, number>;
  rows: CriteriaRow[];
}
