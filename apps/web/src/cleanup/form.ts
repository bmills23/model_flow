import type { Allocation } from '@model-flow/engine';
import { defaultReceptor, type ChemicalRow, type ReceptorForm } from '../risk/form';

export interface CleanupForm {
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
