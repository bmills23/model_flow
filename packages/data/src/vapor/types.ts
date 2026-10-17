import type { TaggedValue } from '../rsl/types.js';
import type { BiodegradationClass } from './classes.js';

/** RSL properties the vapor models read; copied unchanged from the RSL chemical file. */
export type VaporRslKey = 'mw' | 'hPrime' | 'hlc' | 'vp' | 'dia' | 'diw' | 'koc' | 's';

export interface LookupRow {
  cas: string;
  name: string;
  tbK: number;
  tcK: number;
  dhvbCalPerMol: number;
  /** False where the enthalpy is not a usable value at the normal boiling point (see `note`). */
  dhvbAtNormalBoilingPoint: boolean;
  note: string;
  pdfPage: number;
}

export interface VaporChemicalEntry {
  /** The RSL id (CAS number for every chemical here). */
  id: string;
  name: string;
  /** RSL values, identical to `chemicals.json`; the RSL stays primary for every property it carries. */
  rsl: Partial<Record<VaporRslKey, TaggedValue>>;
  /** Temperature-correction inputs from the EPA 2004 lookup table. Enthalpy absent when not usable. */
  epa2004je?: { tbK: number; tcK: number; dhvbCalPerMol?: number; ref: 'epa2004je' };
  /** Default aerobic rate for a petroleum chemical in a published class. Absent otherwise: no default. */
  biodegradation?: { class: BiodegradationClass; kwPerHour: number; ref: 'api2012biovapor' };
  /** Oxygen demand of complete oxidation, from the committed molecular formula. */
  oxygen?: {
    formula: { c: number; h: number; o?: number };
    molecularWeight: number;
    molO2PerMol: number;
    massRatio: number;
  };
}

export interface VaporChemicalsFile {
  source: {
    rsl: { reference: string; edition: string; documents: number[]; retrieved: string };
    epa2004je: { reference: string; file: string; sha256: string; retrieved: string };
    api2012biovapor: { reference: string; appendix: string };
  };
  units: {
    tbK: string;
    tcK: string;
    dhvbCalPerMol: string;
    kwPerHour: string;
    molecularWeight: string;
    molO2PerMol: string;
    massRatio: string;
  };
  chemicals: VaporChemicalEntry[];
  /** CAS numbers of lookup-table chemicals that the RSL table does not carry (not merged). */
  unmatchedEpa2004je: string[];
}
