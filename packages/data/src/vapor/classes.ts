import type { MolecularFormula } from './formulas.js';

export type BiodegradationClass =
  | 'alkylbenzene'
  | 'naphthalene'
  | 'branched-cycloaliphatic'
  | 'normal-alkane'
  | 'mixed-aliphatic'
  | 'methane';

export interface ClassRate {
  /** Water-phase aerobic first-order rate k_w in 1/h, as published. */
  kwPerHour: number;
  /** Section of Appendix C of api2012biovapor that publishes the rate. */
  section: string;
}

/**
 * Default water-phase (pseudo) first-order aerobic biodegradation rates by chemical class, from
 * Appendix C of the BioVapor user's manual (`api2012biovapor`, sections C.2.1 to C.2.6). The manual
 * gives one median or geometric mean per class and no per-chemical rate. The mixed class (C.2.5) is for
 * a blend of aliphatics and so has no single chemical in the list below.
 */
export const biodegradationClasses: Readonly<Record<BiodegradationClass, ClassRate>> = {
  alkylbenzene: { kwPerHour: 0.73, section: 'C.2.1' },
  naphthalene: { kwPerHour: 19, section: 'C.2.2' },
  'branched-cycloaliphatic': { kwPerHour: 11, section: 'C.2.3' },
  'normal-alkane': { kwPerHour: 170, section: 'C.2.4' },
  'mixed-aliphatic': { kwPerHour: 71, section: 'C.2.5' },
  methane: { kwPerHour: 82, section: 'C.2.6' },
};

export interface PetroleumChemical {
  /** Name for reading only. */
  name: string;
  class: BiodegradationClass;
  formula: MolecularFormula;
}

/**
 * Chemicals of the RSL table that fall in a published class, by CAS number (the RSL id), with the
 * molecular formula used for the oxygen mass ratio.
 *
 * Membership follows the class definitions in Appendix C: C.2.1 names benzene, toluene, ethylbenzene,
 * xylenes, trimethylbenzene and cumene; the other alkylbenzenes (propyl and butyl benzenes) are read as
 * belonging to the same class, as the heading "BTEX and Alkylbenzenes" says (DECISIONS.md). C.2.2 is
 * naphthalene only, so 2-methylnaphthalene is not classed. C.2.4 is the straight-chain alkanes C5 to
 * C12; C.2.3 is branched and ring aliphatics (cyclohexane and methylcyclohexane here). A chemical not in
 * this list has no default rate and the engine treats it as non-degrading with a warning.
 * `packages/data/test/vapor.test.ts` checks that every id exists in the RSL table.
 */
export const petroleumChemicals: Readonly<Record<string, PetroleumChemical>> = {
  '71-43-2': { name: 'Benzene', class: 'alkylbenzene', formula: { c: 6, h: 6 } },
  '108-88-3': { name: 'Toluene', class: 'alkylbenzene', formula: { c: 7, h: 8 } },
  '100-41-4': { name: 'Ethylbenzene', class: 'alkylbenzene', formula: { c: 8, h: 10 } },
  '95-47-6': { name: 'o-Xylene', class: 'alkylbenzene', formula: { c: 8, h: 10 } },
  '108-38-3': { name: 'm-Xylene', class: 'alkylbenzene', formula: { c: 8, h: 10 } },
  '106-42-3': { name: 'p-Xylene', class: 'alkylbenzene', formula: { c: 8, h: 10 } },
  '1330-20-7': { name: 'Xylenes', class: 'alkylbenzene', formula: { c: 8, h: 10 } },
  '95-63-6': { name: '1,2,4-Trimethylbenzene', class: 'alkylbenzene', formula: { c: 9, h: 12 } },
  '108-67-8': { name: '1,3,5-Trimethylbenzene', class: 'alkylbenzene', formula: { c: 9, h: 12 } },
  '526-73-8': { name: '1,2,3-Trimethylbenzene', class: 'alkylbenzene', formula: { c: 9, h: 12 } },
  '25551-13-7': {
    name: 'Trimethylbenzene (isomer mix)',
    class: 'alkylbenzene',
    formula: { c: 9, h: 12 },
  },
  '98-82-8': { name: 'Cumene', class: 'alkylbenzene', formula: { c: 9, h: 12 } },
  '103-65-1': { name: 'n-Propylbenzene', class: 'alkylbenzene', formula: { c: 9, h: 12 } },
  '104-51-8': { name: 'n-Butylbenzene', class: 'alkylbenzene', formula: { c: 10, h: 14 } },
  '135-98-8': { name: 'sec-Butylbenzene', class: 'alkylbenzene', formula: { c: 10, h: 14 } },
  '98-06-6': { name: 'tert-Butylbenzene', class: 'alkylbenzene', formula: { c: 10, h: 14 } },
  '91-20-3': { name: 'Naphthalene', class: 'naphthalene', formula: { c: 10, h: 8 } },
  '109-66-0': { name: 'n-Pentane', class: 'normal-alkane', formula: { c: 5, h: 12 } },
  '110-54-3': { name: 'n-Hexane', class: 'normal-alkane', formula: { c: 6, h: 14 } },
  '142-82-5': { name: 'n-Heptane', class: 'normal-alkane', formula: { c: 7, h: 16 } },
  '111-84-2': { name: 'n-Nonane', class: 'normal-alkane', formula: { c: 9, h: 20 } },
  '110-82-7': { name: 'Cyclohexane', class: 'branched-cycloaliphatic', formula: { c: 6, h: 12 } },
  '108-87-2': {
    name: 'Methylcyclohexane',
    class: 'branched-cycloaliphatic',
    formula: { c: 7, h: 14 },
  },
};
