import type { Allocation } from '@model-flow/engine';
import { defaultReceptor, type ChemicalRow, type ReceptorForm } from '../risk/form';

/** Where the concentration being solved for sits: the medium the receptor contacts, or upstream of the well. */
export type SourceKind = 'direct' | 'dissolved' | 'vadose' | 'saturated';
/** What a modeled chain is solved to meet: the risk targets, or a concentration at the well. */
export type TargetKind = 'risk' | 'well';

export interface CleanupForm {
  source: SourceKind;
  targetKind: TargetKind;
  /** Well concentration target, mg/L; blank uses the database MCL. */
  wellTarget: string;
  /** Averaging time of the well target, years; blank or 0 uses the peak. */
  windowYr: string;
  /** Starting source concentration for the search, mg/kg (soil) or mg/L (dissolved); blank starts at 1. */
  startConc: string;
  /** Aqueous solubility, mg/L: the ceiling of a dissolved source; blank means no ceiling. */
  solubility: string;
  /** Also run the secant iteration and report its agreement. */
  secantParity: boolean;
  /** Hold TPH at the entered value instead of scaling it with the chemical. */
  tphHeld: boolean;
  chemicals: ChemicalRow[];
  a: ReceptorForm;
  b: ReceptorForm | null;
  /** Also add the two receptors' cancer risks (legacy and modern both honour it). */
  additive: boolean;
  routeExtrapolation: boolean;
  allocation: Allocation;
  /** Target incremental lifetime cancer risk; blank keeps the default 1e-6. */
  targetRisk: string;
  /** Target hazard quotient; blank keeps the default 1. */
  targetHq: string;
}

export const ALLOCATIONS: readonly { value: Allocation; label: string }[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'cumulative', label: 'Cumulative (keep my ratios)' },
  { value: 'equal', label: 'Equal split' },
];

export function defaultCleanupForm(): CleanupForm {
  return {
    source: 'direct',
    targetKind: 'risk',
    wellTarget: '',
    windowYr: '',
    startConc: '',
    solubility: '',
    secantParity: false,
    tphHeld: false,
    chemicals: [],
    a: defaultReceptor('resident'),
    b: null,
    additive: false,
    routeExtrapolation: false,
    allocation: 'individual',
    targetRisk: '',
    targetHq: '',
  };
}

export const SOURCES: readonly { value: SourceKind; label: string }[] = [
  { value: 'direct', label: 'Medium contacted' },
  { value: 'dissolved', label: 'Groundwater source' },
  { value: 'vadose', label: 'Soil, vadose zone' },
  { value: 'saturated', label: 'Soil, saturated' },
];

export const TARGET_KINDS: readonly { value: TargetKind; label: string }[] = [
  { value: 'risk', label: 'Risk and hazard' },
  { value: 'well', label: 'Concentration at the well' },
];
