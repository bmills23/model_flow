import type { MethodKey } from './compute';

export const SERIES: Record<MethodKey, { label: string; cls: string; dash?: string }> = {
  legacy: { label: 'Legacy (AT123D-class)', cls: 's-legacy' },
  modern: { label: 'Modern (Wexler 1992)', cls: 's-modern' },
  domenico: { label: 'Domenico comparison', cls: 's-domenico', dash: '7 5' },
};
