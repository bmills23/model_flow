export type SedimentSource = 'epa2018r4era' | 'macdonald2000';
export type SedimentTable = '2a' | '2b' | '2c' | 'tec-pec';
/** Dry weight, or normalized to 1 percent organic carbon (ocBasis 0.01 in the row). */
export type SedimentBasis = 'dw' | 'oc1pct';
export type SedimentUnit = 'ug/kg' | 'mg/kg';

export type SedimentEndpoint =
  | 'region4-freshwater-screening'
  | 'region4-freshwater-refinement'
  | 'region4-marine-screening'
  | 'region4-marine-refinement'
  | 'region4-pah-toxic-unit-refinement'
  | 'macdonald-tec'
  | 'macdonald-pec';

/**
 * One benchmark value, shaped like the engine `Criterion` record (medium, endpoint, value, unit, ocBasis,
 * waterType) plus the provenance of the row.
 */
export interface BenchmarkRow {
  /** Unique within the file: table, chemical, variant and endpoint (a repeat of the same line gets `#2`). */
  id: string;
  /** Hyphenated CAS number; else `code-<code>` for a group code such as DDD, else a slug of the name. */
  chemicalId: string;
  /** The chemical name as the source prints it. */
  name: string;
  cas: string | null;
  /** The CAS number as the report prints it, when the build corrected it (a transposition). */
  casPrinted?: string;
  /** Group code printed in the CAS column (DDD, DDE, DDT, DDTR). */
  code: string | null;
  /** "aquatic life" or "wildlife based" and similar, from the trailing parenthesis of the name. */
  variant: string | null;
  medium: 'sediment';
  source: SedimentSource;
  table: SedimentTable;
  /** PDF page for Region 4 rows; absent for the MacDonald rows. */
  page?: number;
  section: string;
  endpoint: SedimentEndpoint;
  value: number;
  unit: SedimentUnit;
  basis: SedimentBasis;
  /** 0.01 for a value published at 1 percent organic carbon, else absent. */
  ocBasis?: number;
  /** The table's note does not state the basis of this value; it was inferred (see DECISIONS.md). */
  basisInferred?: true;
  /** Region 4 source letter of this value. */
  sourceLetter?: string;
  waterType?: 'fresh' | 'salt';
  /** Region 4 mode of toxic action class printed beside the name. */
  modeOfAction?: string;
  /** Marked * in Table 2a: protective of aquatic and wildlife receptors. */
  bothReceptors?: true;
  recordSource: 'database';
}

export interface SourceBlock {
  reference: SedimentSource;
  url?: string;
  /** Date of the table or edition, ISO 8601. */
  pageDate: string;
  /** Date the committed bytes were fetched or the values transcribed, ISO 8601. */
  retrieved: string;
  licence: string;
}

export interface BenchmarkFile {
  edition: string;
  sources: Record<SedimentSource, SourceBlock>;
  units: { concentration: string; ocBasis: string };
  /** Region 4 source letters: the basis each carries and how it was decided. */
  sourceLetters: Record<
    '2a' | '2b' | '2c',
    Record<string, { basis: SedimentBasis; inferred: boolean; citation: string }>
  >;
  rows: BenchmarkRow[];
}
