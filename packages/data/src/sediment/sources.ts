import type { SedimentBasis } from './types.js';

/**
 * What each Region 4 source letter's note says about the unit of a value, from the notes under the
 * tables. `inferred` marks a note that states no unit; its `basis` is then only the basis most of its
 * cells carry by their shading. The build decides the basis of each value from the fill of its cell,
 * not from the letter, and uses a note's stated unit only to flag a cell whose fill contradicts it and
 * under a heading that states no basis (DECISIONS.md, M8 slice D2).
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
    basis: 'oc1pct',
    inferred: true,
    citation:
      'Florida coastal sediment guidelines; the note states no unit. The Table 2b cells are unshaded (1% OC) except the gray total LMW-PAHs and two shaded totals; the Table 2a note for the same citation says dw',
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
    basis: 'oc1pct',
    inferred: true,
    citation:
      'New York DEC 2014; the note states no unit. Its one Table 2b cell is unshaded (1% OC); the Table 2a note for the same citation says dw',
  },
  k: {
    basis: 'dw',
    inferred: true,
    citation:
      'Median of the Table 2c refinement values divided by 10; the note states no unit. Both cells are shaded (tan, not the legend gray), so dry weight, flagged',
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
