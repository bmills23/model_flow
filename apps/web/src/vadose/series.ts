import type { VadoseMethod } from './compute';

/** Labels and series tokens of the two methods, shared with the transport screen's colours. */
export const METHOD_SERIES: Record<
  VadoseMethod,
  { label: string; short: string; cls: string; marker: VadoseMethod }
> = {
  legacy: { label: 'Legacy VADSAT-type', short: 'Legacy', cls: 's-legacy', marker: 'legacy' },
  modern: { label: 'Modern layered', short: 'Modern', cls: 's-modern', marker: 'modern' },
};
