import type { SedimentBasis } from './types.js';

/**
 * What each Region 4 source letter says about the unit of the value, from the notes under the tables.
 * `inferred` marks a letter whose note states no unit; the basis then follows an identical citation
 * elsewhere in the report (DECISIONS.md, M8 slice D2).
 */
export interface LetterInfo {
  basis: SedimentBasis;
  inferred: boolean;
  citation: string;
}

export const LETTERS_2A: Record<string, LetterInfo> = {
  a: { basis: 'dw', inferred: false, citation: 'Long and Morgan 1991 (ER-L, ER-M), ug/kg dw' },
  b: {
    basis: 'dw',
    inferred: false,
    citation: 'Florida inland sediment guidelines (TEC, PEC), ug/kg dw',
  },
  c: { basis: 'dw', inferred: false, citation: 'Florida coastal sediment guidelines, ug/kg dw' },
  d: {
    basis: 'oc1pct',
    inferred: false,
    citation: 'Region 4 sediment model from the surface water ESV, ug/kg at 1% OC',
  },
  e: {
    basis: 'oc1pct',
    inferred: false,
    citation: 'Region 4 sediment model from ECOSAR, ug/kg at 1% OC',
  },
  f: {
    basis: 'oc1pct',
    inferred: false,
    citation: 'Region 4 sediment model from McGrath and Di Toro 2009, ug/kg at 1% OC',
  },
  g: { basis: 'oc1pct', inferred: false, citation: 'Ontario sediment guidelines, ug/kg at 1% OC' },
  h: { basis: 'dw', inferred: false, citation: 'Washington State sediment standards, ug/kg dw' },
  i: { basis: 'dw', inferred: false, citation: 'Los Alamos ECORISK database, ug/kg dw' },
  j: { basis: 'dw', inferred: false, citation: 'CCME guidelines, ug/kg dw' },
  k: {
    basis: 'oc1pct',
    inferred: true,
    citation:
      'EPA 1993 dioxin report; the note states no unit, so the section heading (1% OC) applies',
  },
  l: {
    basis: 'dw',
    inferred: false,
    citation: 'New York DEC 2014, ug/kg dw (a wildlife number is ug/kg at 1% OC)',
  },
};

export const LETTERS_2B: Record<string, LetterInfo> = {
  a: {
    basis: 'oc1pct',
    inferred: false,
    citation: 'Region 4 sediment model from the surface water ESV, ug/kg at 1% OC',
  },
  b: {
    basis: 'oc1pct',
    inferred: false,
    citation: 'Region 4 sediment model from ECOSAR, ug/kg at 1% OC',
  },
  c: {
    basis: 'oc1pct',
    inferred: false,
    citation: 'Region 4 sediment model from McGrath and Di Toro 2009, ug/kg at 1% OC',
  },
  d: {
    basis: 'dw',
    inferred: true,
    citation:
      'Florida coastal sediment guidelines; the note states no unit, taken as dry weight like the same citation in Table 2a',
  },
  e: {
    basis: 'oc1pct',
    inferred: false,
    citation: 'Washington State sediment standards, ug/kg at 1% OC',
  },
  f: {
    basis: 'dw',
    inferred: false,
    citation: 'Florida inland sediment guidelines (TEC), ug/kg dw',
  },
  g: { basis: 'dw', inferred: false, citation: 'CCME guidelines, ug/kg dw' },
  h: {
    basis: 'oc1pct',
    inferred: true,
    citation: 'Ontario sediment guidelines; unused in the table',
  },
  i: { basis: 'dw', inferred: false, citation: 'Los Alamos ECORISK database, ug/kg dw' },
  j: {
    basis: 'dw',
    inferred: true,
    citation:
      'New York DEC 2014; the note states no unit, taken as dry weight like the same citation in Table 2a',
  },
  k: {
    basis: 'oc1pct',
    inferred: false,
    citation: 'Median of the Table 2c refinement values divided by 10, ug/kg at 1% OC',
  },
};

export const LETTERS_2C: Record<string, LetterInfo> = {
  a: {
    basis: 'oc1pct',
    inferred: false,
    citation: 'EPA 2003 PAH mixtures ESB procedures, Table 3-4, ug/kg at 1% OC',
  },
  b: {
    basis: 'oc1pct',
    inferred: false,
    citation: 'Calculated with the EPA 2003 equations and a KOWWIN log Kow, ug/kg at 1% OC',
  },
};
