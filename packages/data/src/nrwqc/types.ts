export type CriterionKind = 'chemical' | 'parameter' | 'group';
export type WaterType = 'fresh' | 'salt';

/** A tissue residue value printed beside a water value (PFAS chronic criteria). */
export interface TissueValue {
  value: number;
  unit: string;
  /** For example "Wet Weight in Invertebrate Whole-Body Tissue". */
  description: string;
}

/** One criterion cell of a table, read from the text the page prints. */
export interface CriterionCell {
  status: 'value' | 'none' | 'vacated' | 'text';
  /** The number as printed; the low end of a printed range. */
  value?: number;
  /** The high end of a printed range such as "0.58-2.1". */
  valueHigh?: number;
  /** Unit of `value`; the table's column unit unless the cell prints another. */
  unit?: string;
  /** Tissue residue values printed in the same cell. */
  tissue?: TissueValue[];
  /** The cell text, for a `text` status or a cell with more than a number. */
  text?: string;
}

export interface Edition {
  /** Directory name under raw/nrwqc: the pages are not numbered editions. */
  edition: string;
  source: {
    reference: string;
    url: string;
    /** The page's own "last updated" date, ISO 8601: the table's edition. */
    pageDate: string;
    /** Date the committed bytes were fetched, ISO 8601. */
    retrieved: string;
    licence: string;
  };
}

interface RowBase {
  /** First hyphenated CAS number, else a slug of the name. */
  id: string;
  /** The name as printed, without the priority pollutant mark. */
  name: string;
  kind: CriterionKind;
  /** Marked (P) as a priority pollutant. */
  priority: boolean;
  /** Hyphenated CAS numbers; the table prints them without hyphens. */
  cas: string[];
  publicationYear: string;
  notes: string;
}

export interface WaterColumns {
  /** Criterion maximum concentration (acute). */
  cmc: CriterionCell;
  /** Criterion continuous concentration (chronic). */
  ccc: CriterionCell;
}

export interface AquaticRow extends RowBase {
  freshwater: WaterColumns;
  saltwater: WaterColumns;
  /** The criterion depends on site water chemistry (pH, temperature, hardness and organic carbon, or tissue). */
  siteSpecific: boolean;
  /** The water types whose criteria are not tabulated because of that dependence. */
  siteSpecificFor: WaterType[];
  /** The water types whose printed values are one point of a function of pH. */
  phDependentFor: WaterType[];
  /** The pH the printed values correspond to, when `phDependentFor` is not empty. */
  printedAtPh?: number;
  /** Listed in Appendix B (freshwater criteria are a function of hardness). */
  hardnessDependent: boolean;
}

export interface HumanHealthRow extends RowBase {
  /** Consumption of water and organism. */
  waterAndOrganism: CriterionCell;
  /** Consumption of organism only. */
  organismOnly: CriterionCell;
}

export interface AquaticFile extends Edition {
  units: { criterion: 'ug/L' };
  rows: AquaticRow[];
}

export interface HumanHealthFile extends Edition {
  units: { criterion: 'ug/L' };
  rows: HumanHealthRow[];
}

/** A conversion factor: a constant, or intercept + slope ln(hardness). */
export type ConversionFactor = { constant: number } | { intercept: number; slope: number };

export interface HardnessEquation {
  slope: number;
  intercept: number;
  conversionFactor: ConversionFactor;
}

export interface HardnessMetal {
  id: string;
  name: string;
  freshwater: { acute?: HardnessEquation; chronic?: HardnessEquation };
}

export interface ConversionFactorRow {
  name: string;
  freshwater: { cmc: ConversionFactor | null; ccc: ConversionFactor | null };
  saltwater: { cmc: ConversionFactor | null; ccc: ConversionFactor | null };
}

export interface HardnessFile extends Edition {
  units: { criterion: 'ug/L'; hardness: 'mg/L as CaCO3' };
  /** Appendix B: exp(slope ln(h) + intercept) times the conversion factor, in ug/L. */
  metals: HardnessMetal[];
  /** Appendix A: conversion factors from total recoverable to dissolved metal. */
  conversionFactors: ConversionFactorRow[];
}
