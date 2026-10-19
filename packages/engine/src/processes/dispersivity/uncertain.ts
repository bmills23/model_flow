import type { UncertainInput } from '../../registry/index.js';
import { declareRows } from '../vapor/uncertain.js';
import type { DispersivityInput } from './index.js';

/** Declarations of the dispersivity correlations: the transport distance (uncertainty note, ruling 2). */
export function dispersivityUncertainInputs(): UncertainInput<DispersivityInput>[] {
  return declareRows<DispersivityInput>('dispersivity', [
    ['distance', ['distance'], 'Transport distance (scale length)', 'm', 'site'],
  ]);
}
