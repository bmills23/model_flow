/** Conventional atomic masses (g/mol) for the formula masses below. */
const MASS_C = 12.011;
const MASS_H = 1.008;
const MASS_O = 15.999;

export interface MolecularFormula {
  c: number;
  h: number;
  /** Oxygen atoms; absent for a plain hydrocarbon. */
  o?: number;
}

export interface OxygenDemand {
  /** Formula mass, g/mol. */
  molecularWeight: number;
  /** Mol O2 needed for complete oxidation to CO2 and H2O per mol of chemical: c + h/4 - o/2. */
  molO2PerMol: number;
  /** Mass of O2 per mass of chemical, g/g. */
  massRatio: number;
}

/** Stoichiometric oxygen demand of complete oxidation, from the molecular formula alone. */
export const oxygenDemand = (f: MolecularFormula): OxygenDemand => {
  const o = f.o ?? 0;
  if (![f.c, f.h, o].every((n) => Number.isInteger(n) && n >= 0) || f.c < 1) {
    throw new RangeError('formula needs a positive carbon count and non-negative integer counts');
  }
  const molecularWeight = f.c * MASS_C + f.h * MASS_H + o * MASS_O;
  const molO2PerMol = f.c + f.h / 4 - o / 2;
  if (molO2PerMol < 0) throw new RangeError('formula has more oxygen than complete oxidation uses');
  return {
    molecularWeight,
    molO2PerMol,
    massRatio: (molO2PerMol * 2 * MASS_O) / molecularWeight,
  };
};
